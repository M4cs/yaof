import { z } from "zod";
import { Widget } from "./types";

const WidgetEnum = z.enum(Widget);
/**
 * Topbar plugin configuration schema.
 * Uses Zod v4 for type-safe configuration with defaults.
 */
export const topbarConfigSchema = z.object({
  /** Clock display format */
  clockFormat: z.enum(["HH:MM", "HH:MM:SS", "HH:MM:SS:MS"]).default("HH:MM"),
  /** Whether to show the clock */
  showClock: z.boolean().default(true),
  /** Refresh interval in milliseconds */
  refreshInterval: z.number().min(100).max(10000).default(1000),

  darkMode: z.boolean().default(true),

  leftBarWidth: z.number().min(0).max(1920).default(230),
  rightBarWidth: z.number().min(0).max(1920).default(230),
  widgetGap: z.number().min(0).max(1920).default(3),
  leftWidgets: z
    .array(WidgetEnum)
    .default([Widget.Clock, Widget.CPU, Widget.ActiveWindow]),
  rightWidgets: z
    .array(WidgetEnum)
    .default([Widget.Tickers, Widget.NowPlaying, Widget.Network]),
  customTickers: z
    .array(
      z.object({ symbol: z.string(), address: z.string(), chain: z.string() })
    )
    .default([]),
  tickers: z
    .array(z.enum(["ETH", "BTC", "SOL"]))
    .default(["ETH", "BTC", "SOL"]),
  useMarquee: z.boolean().default(true),
  marqueeSpeed: z.number().min(0).max(100).default(20),
  marqueeDirection: z.enum(["left", "right"]).default("left"),
  marqueeDelay: z.number().min(0).max(1000).default(0),
  tickerPriceInterval: z.number().min(1).max(1000).default(60),
});

/** Inferred type from the config schema */
export type TopbarConfig = z.infer<typeof topbarConfigSchema>;
