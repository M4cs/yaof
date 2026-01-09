import { createPublicClient, http, parseAbi } from "viem";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";

// ============ Types ============

export type CustomToken = {
  symbol: string;
  address: string;
  chain: string;
};

export type PriceResult = {
  symbol: string;
  price: number | null;
  source: string;
};

// ============ Chain Configuration ============

const CHAIN_CONFIG: Record<
  string,
  { viemChain: any; defillamaPrefix: string; rpc: string }
> = {
  ethereum: {
    viemChain: mainnet,
    defillamaPrefix: "ethereum",
    rpc: "https://eth.llamarpc.com",
  },
  base: {
    viemChain: base,
    defillamaPrefix: "base",
    rpc: "https://base.llamarpc.com",
  },
  arbitrum: {
    viemChain: arbitrum,
    defillamaPrefix: "arbitrum",
    rpc: "https://arbitrum.llamarpc.com",
  },
  optimism: {
    viemChain: optimism,
    defillamaPrefix: "optimism",
    rpc: "https://optimism.llamarpc.com",
  },
  polygon: {
    viemChain: polygon,
    defillamaPrefix: "polygon",
    rpc: "https://polygon.llamarpc.com",
  },
  solana: {
    viemChain: null,
    defillamaPrefix: "solana",
    rpc: "https://api.mainnet-beta.solana.com",
  },
};

// ============ CoinGecko (Major Tickers) ============

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
};

async function fetchMajorPrices(
  symbols: string[]
): Promise<Map<string, number>> {
  const ids = symbols
    .map((s) => COINGECKO_IDS[s.toUpperCase()])
    .filter(Boolean)
    .join(",");

  if (!ids) return new Map();

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );
    const data = await res.json();

    const prices = new Map<string, number>();
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      if (data[id]?.usd) {
        prices.set(symbol, data[id].usd);
      }
    }
    return prices;
  } catch (error) {
    console.error("CoinGecko fetch failed:", error);
    return new Map();
  }
}

// ============ DeFiLlama (Token by Address) ============

async function fetchDefiLlamaPrices(
  tokens: CustomToken[]
): Promise<Map<string, number>> {
  if (tokens.length === 0) return new Map();

  // Format: chain:address
  const coins = tokens
    .map((t) => {
      const config = CHAIN_CONFIG[t.chain.toLowerCase()];
      if (!config) return null;
      return `${config.defillamaPrefix}:${t.address}`;
    })
    .filter(Boolean)
    .join(",");

  if (!coins) return new Map();

  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${coins}`);
    const data = await res.json();

    const prices = new Map<string, number>();
    for (const token of tokens) {
      const config = CHAIN_CONFIG[token.chain.toLowerCase()];
      if (!config) continue;

      const key = `${config.defillamaPrefix}:${token.address}`;
      if (data.coins?.[key]?.price) {
        prices.set(token.symbol, data.coins[key].price);
      }
    }
    return prices;
  } catch (error) {
    console.error("DeFiLlama fetch failed:", error);
    return new Map();
  }
}

// ============ On-Chain Fallback (Uniswap V3) ============

const UNISWAP_QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

async function fetchOnChainPrice(token: CustomToken): Promise<number | null> {
  const config = CHAIN_CONFIG[token.chain.toLowerCase()];
  if (!config?.viemChain) return null;

  try {
    const client = createPublicClient({
      chain: config.viemChain,
      transport: http(config.rpc),
    });

    // Quote 1 token -> USDC via Uniswap
    const result = await client.simulateContract({
      address: UNISWAP_QUOTER_V2,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: token.address as `0x${string}`,
          tokenOut: USDC,
          amountIn: BigInt(10 ** 18), // Assumes 18 decimals
          fee: 3000,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const amountOut = result.result[0];
    return Number(amountOut) / 10 ** 6; // USDC has 6 decimals
  } catch (error) {
    console.error(`On-chain quote failed for ${token.symbol}:`, error);
    return null;
  }
}

// ============ Jupiter (Solana Tokens) ============

async function fetchJupiterPrice(token: CustomToken): Promise<number | null> {
  if (token.chain.toLowerCase() !== "solana") return null;

  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${token.address}`);
    const data = await res.json();
    return data.data?.[token.address]?.price ?? null;
  } catch (error) {
    console.error(`Jupiter fetch failed for ${token.symbol}:`, error);
    return null;
  }
}

// ============ Main Price Fetcher ============

export async function fetchPrices(
  majorTickers: string[] = ["ETH", "BTC", "SOL"],
  customTokens: CustomToken[] = []
): Promise<PriceResult[]> {
  const results: PriceResult[] = [];

  // 1. Fetch major tickers from CoinGecko
  const majorPrices = await fetchMajorPrices(majorTickers);
  for (const symbol of majorTickers) {
    const price = majorPrices.get(symbol.toUpperCase()) ?? null;
    results.push({
      symbol,
      price,
      source: price ? "coingecko" : "unavailable",
    });
  }

  // 2. Fetch custom tokens from DeFiLlama (batch)
  const defillamaPrices = await fetchDefiLlamaPrices(customTokens);

  // 3. For tokens not found, try on-chain/Jupiter fallback
  for (const token of customTokens) {
    let price = defillamaPrices.get(token.symbol) ?? null;
    let source = "defillama";

    if (price === null) {
      if (token.chain.toLowerCase() === "solana") {
        price = await fetchJupiterPrice(token);
        source = "jupiter";
      } else {
        price = await fetchOnChainPrice(token);
        source = "onchain-uniswap";
      }
    }

    results.push({
      symbol: token.symbol,
      price,
      source: price !== null ? source : "unavailable",
    });
  }

  return results;
}
