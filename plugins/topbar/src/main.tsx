import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayProvider } from "@m4cs/yaof-sdk";
import manifest from "virtual:yaof-manifest";
import App from "./App";
import "./App.css";
import { ThemeProvider } from "./components/theme-provider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayProvider manifest={manifest} overlayId="topbar-main">
      <App />
    </OverlayProvider>
  </StrictMode>
);
