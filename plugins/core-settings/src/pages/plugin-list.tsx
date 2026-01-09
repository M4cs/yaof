import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import type { PluginManifest } from "@m4cs/yaof-sdk";
import { PluginCard } from "../components/plugin-card";
import { Skeleton } from "@yaof/ui/components/ui/skeleton";
import { Card } from "@yaof/ui/components/ui/card";
import { Badge } from "@yaof/ui/components/ui/badge";
import { Package, Terminal } from "@phosphor-icons/react";

interface PluginListProps {
  onSelectPlugin: (pluginId: string) => void;
}

export function PluginList({ onSelectPlugin }: PluginListProps) {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [enabledStates, setEnabledStates] = useState<Record<string, boolean>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlugins();
  }, []);

  async function loadPlugins() {
    try {
      const list = await invoke<PluginManifest[]>("plugin:yaof|plugin_list");

      // Filter out core plugins (like yaof-core-settings) since they're not overlays
      // Core plugins have no overlays to configure
      const overlayPlugins = list.filter(
        (plugin) => Object.keys(plugin.overlays).length > 0
      );
      setPlugins(overlayPlugins);

      // Load enabled state for each plugin's main overlay
      const states: Record<string, boolean> = {};
      for (const plugin of overlayPlugins) {
        const overlayId = Object.keys(plugin.overlays)[0] ?? "main";
        const storeName = `${plugin.id}-${overlayId}-overlay.json`;
        try {
          const store = await load(storeName);
          const enabled = await store.get<boolean>("enabled");
          states[plugin.id] = enabled ?? true;
        } catch {
          states[plugin.id] = true;
        }
      }
      setEnabledStates(states);
    } catch (error) {
      console.error("Failed to load plugins:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function togglePlugin(pluginId: string, enabled: boolean) {
    const plugin = plugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    const overlayId = Object.keys(plugin.overlays)[0] ?? "main";
    const storeName = `${pluginId}-${overlayId}-overlay.json`;

    try {
      const store = await load(storeName);
      await store.set("enabled", enabled);
      await store.save();

      setEnabledStates((prev) => ({ ...prev, [pluginId]: enabled }));
    } catch (error) {
      console.error("Failed to toggle plugin:", error);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Plugins</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-full" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Plugins</h2>
        <Badge variant="secondary" className="text-xs">
          {plugins.length} installed
        </Badge>
      </div>

      {plugins.length === 0 ? (
        <Card className="border-dashed">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Package
                className="size-8 text-muted-foreground"
                weight="duotone"
              />
            </div>
            <h3 className="font-semibold text-lg mb-2">No plugins installed</h3>
            <p className="text-muted-foreground text-sm mb-4 max-w-sm">
              Get started by installing your first plugin using the CLI
            </p>
            <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2">
              <Terminal
                className="size-4 text-muted-foreground"
                weight="duotone"
              />
              <code className="text-sm font-mono">yaof plugin add</code>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              enabled={enabledStates[plugin.id] ?? true}
              onToggle={(enabled) => togglePlugin(plugin.id, enabled)}
              onConfigure={() => onSelectPlugin(plugin.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
