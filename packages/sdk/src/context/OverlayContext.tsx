import type { PluginManifest } from "@/types";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface OverlayContextValue {
  pluginId: string;
  overlayId: string;
  manifest: PluginManifest;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export interface OverlayProviderProps {
  children: ReactNode;
  manifest: PluginManifest;
  overlayId: string;
}

export function OverlayProvider({
  children,
  manifest,
  overlayId,
}: OverlayProviderProps) {
  const value = useMemo<OverlayContextValue>(
    () => ({
      pluginId: manifest.id,
      overlayId,
      manifest,
    }),
    [manifest, overlayId]
  );

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

export function useOverlayContext(): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error("useOverlayContext must be used within an OverlayProvider");
  }
  return context;
}
