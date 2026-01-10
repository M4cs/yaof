import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayProvider } from "@m4cs/yaof-sdk";
import manifest from "virtual:yaof-manifest";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "@yaof/ui/components/ui/tooltip";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayProvider manifest={manifest} overlayId="main">
      <ThemeProvider defaultTheme="dark" storageKey="yaof-core-settings-theme">
        <main className="min-h-screen min-w-screen w-full h-full bg-background text-foreground">
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </main>
      </ThemeProvider>
    </OverlayProvider>
  </StrictMode>
);
