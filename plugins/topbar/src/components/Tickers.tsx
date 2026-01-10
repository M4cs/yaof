import { CustomToken, fetchPrices, PriceResult } from "@/lib/prices";
import { useEffect, useState } from "react";
import Marquee from "react-fast-marquee";
import {
  SiBitcoin,
  SiEthereum,
  SiPolygon,
  SiRipple,
  SiSolana,
} from "@icons-pack/react-simple-icons";
import { cn } from "@/lib/utils";
import { usePluginConfig } from "@m4cs/yaof-sdk";
import { TopbarConfig, topbarConfigSchema } from "@/config";

interface TickerProps {
  tickers: string[];
  custom?: CustomToken[];
}

export function Tickers({ tickers, custom }: TickerProps) {
  const { config } = usePluginConfig(topbarConfigSchema);

  const [priceData, setPriceData] = useState<PriceResult[]>([]);

  useEffect(() => {
    async function updatePrices() {
      const data = await fetchPrices(tickers, custom);
      setPriceData(data);
    }
    updatePrices();
    const interval = setInterval(
      updatePrices,
      1000 * config.tickerPriceInterval
    );
    return () => clearInterval(interval);
  }, [tickers, custom, config]);

  return (
    <Marquee
      className="max-w-xs"
      speed={config.marqueeSpeed}
      delay={config.marqueeDelay}
      direction={config.marqueeDirection}
    >
      <div className="flex items-center gap-6 text-foreground">
        {priceData.map((res, idx) => (
          <div
            className={cn(idx === 0 && "ml-6", "flex items-center gap-1")}
            key={idx}
          >
            {res.symbol === "ETH" && <SiEthereum size={12} />}
            {res.symbol === "SOL" && <SiSolana size={12} />}
            {res.symbol === "BTC" && <SiBitcoin size={12} />}
            {res.symbol === "XRP" && <SiRipple size={12} />}
            <p className="text-xs font-mono">
              {res.symbol}: $
              {parseFloat(res.price?.toFixed(2) ?? "0.00").toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </Marquee>
  );
}
