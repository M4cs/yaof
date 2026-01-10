import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PluginManifest, PluginSettingsConfig } from "@m4cs/yaof-sdk";
import {
  OverlaySettingsPanel,
  type OverlayDefinition,
} from "../components/overlay-settings-panel";
import { DynamicSettingsForm } from "../components/dynamic-settings-form";
import { Button } from "@yaof/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@yaof/ui/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@yaof/ui/components/ui/tabs";
import { Badge } from "@yaof/ui/components/ui/badge";
import { Skeleton } from "@yaof/ui/components/ui/skeleton";
import { ArrowLeft, Sliders, Gear } from "@phosphor-icons/react";

// Extended manifest type that includes x/y from overlay.json and settings
interface ExtendedPluginManifest
  extends Omit<PluginManifest, "overlays" | "settings"> {
  overlays: Record<string, OverlayDefinition>;
  settings?: PluginSettingsConfig;
}

interface PluginSettingsProps {
  pluginId: string;
  onBack: () => void;
}

export function PluginSettings({ pluginId, onBack }: PluginSettingsProps) {
  const [plugin, setPlugin] = useState<ExtendedPluginManifest | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlugin();
  }, [pluginId]);

  async function loadPlugin() {
    try {
      const data = await invoke<ExtendedPluginManifest | null>(
        "plugin:yaof|plugin_get",
        {
          id: pluginId,
        }
      );
      setPlugin(data);

      // Select first overlay by default
      if (data) {
        const overlayIds = Object.keys(data.overlays);
        if (overlayIds.length > 0) {
          setSelectedOverlay(overlayIds[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load plugin:", error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="size-4" />
          Back to Plugins
        </Button>
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-2 -ml-2"
        >
          <ArrowLeft className="size-4" />
          Back to Plugins
        </Button>
        <Card className="border-destructive">
          <CardContent className="py-8 text-center">
            <p className="text-destructive">Plugin not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overlayIds = Object.keys(plugin.overlays);
  const hasSettings =
    plugin.settings?.schema && Object.keys(plugin.settings.schema).length > 0;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-2 -ml-2"
      >
        <ArrowLeft className="size-4" />
        Back to Plugins
      </Button>

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{plugin.name}</h2>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-muted-foreground">
            {plugin.id}
          </code>
          <Badge variant="outline" className="text-xs">
            v{plugin.version}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="overlays" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overlays" className="gap-2">
            <Sliders className="size-4" weight="duotone" />
            Overlays
            {overlayIds.length > 1 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {overlayIds.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="gap-2"
            disabled={!hasSettings}
          >
            <Gear className="size-4" weight="duotone" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overlays" className="space-y-4">
          {overlayIds.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {overlayIds.map((id) => {
                const overlay = plugin.overlays[id];
                const route = overlay?.route ?? "/";
                return (
                  <Button
                    key={id}
                    variant={selectedOverlay === id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedOverlay(id)}
                    className="gap-2"
                  >
                    <span className="capitalize">{id}</span>
                    {route !== "/" && (
                      <code className="text-xs opacity-70 font-mono">
                        {route}
                      </code>
                    )}
                  </Button>
                );
              })}
            </div>
          )}

          {selectedOverlay && plugin.overlays[selectedOverlay] && (
            <>
              {/* Show route info if defined */}
              {plugin.overlays[selectedOverlay].route && (
                <div className="text-sm text-muted-foreground">
                  Route:{" "}
                  <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
                    {plugin.overlays[selectedOverlay].route}
                  </code>
                </div>
              )}
              <OverlaySettingsPanel
                pluginId={plugin.id}
                overlayId={selectedOverlay}
                overlayDefinition={plugin.overlays[selectedOverlay]}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plugin Settings</CardTitle>
              <CardDescription>
                Configure plugin-specific options
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasSettings && plugin.settings?.schema ? (
                <DynamicSettingsForm
                  pluginId={plugin.id}
                  schema={plugin.settings!.schema}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This plugin has no additional settings configured.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
