import { ActiveWindow } from "./components/ActiveWindow";
import { Clock } from "./components/Clock";
import { CPU } from "./components/CPU";
import { NowPlaying } from "./components/NowPlaying";
import { Network } from "./components/Network";
import { Tickers } from "./components/Tickers";
import { usePluginConfig } from "@m4cs/yaof-sdk";
import { topbarConfigSchema } from "./config";
import { Fragment, useCallback, useMemo } from "react";
import { Widget } from "./types";
import { ThemeProvider } from "./components/theme-provider";

function App() {
  const { config } = usePluginConfig(topbarConfigSchema);

  const barComponents = useCallback(
    (componentConfig: Widget[]) => {
      return componentConfig.map((widget, idx) => {
        switch (widget) {
          case Widget.Clock:
            return <Clock key={idx} />;
          case Widget.CPU:
            return <CPU key={idx} />;
          case Widget.ActiveWindow:
            return <ActiveWindow key={idx} />;
          case Widget.Network:
            return <Network key={idx} />;
          case Widget.Tickers:
            return (
              <Tickers
                tickers={config.tickers}
                custom={config.customTickers}
                key={idx}
              />
            );
          case Widget.NowPlaying:
            return <NowPlaying key={idx} />;
          default:
            return <Fragment key={idx} />;
        }
      });
    },
    [config]
  );

  return (
    <ThemeProvider
      defaultTheme={config.darkMode ? "dark" : "light"}
      storageKey="yaof-topbar-theme"
    >
      <div className="min-w-screen min-h-screen w-full h-full bg-transparent flex items-center justify-between font-figtree text-sm px-7">
        <div
          style={{
            width: `calc(var(--spacing) * ${config.leftBarWidth})`,
          }}
          className="bg-background rounded-2xl rounded-r-lg border-border border flex items-center justify-start p-3 gap-12"
        >
          {barComponents(config.leftWidgets)}
        </div>
        <div
          style={{
            width: `calc(var(--spacing) * ${config.rightBarWidth})`,
          }}
          className="bg-background rounded-2xl rounded-l-lg border-border border flex items-center justify-end p-3 gap-12"
        >
          {barComponents(config.rightWidgets)}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
