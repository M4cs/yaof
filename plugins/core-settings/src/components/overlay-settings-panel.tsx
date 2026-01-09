import { useCallback, useEffect, useRef, useState } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@yaof/ui/components/ui/card";
import { Switch } from "@yaof/ui/components/ui/switch";
import { Input } from "@yaof/ui/components/ui/input";
import { Label } from "@yaof/ui/components/ui/label";
import { Badge } from "@yaof/ui/components/ui/badge";
import { Separator } from "@yaof/ui/components/ui/separator";
import { Skeleton } from "@yaof/ui/components/ui/skeleton";

export interface OverlayDefinition {
  width: number;
  height: number;
  x?: number;
  y?: number;
  defaultPosition?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "center-left"
    | "center"
    | "center-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  clickThrough?: boolean;
  frameless?: boolean;
  /** Optional route path for this overlay (used with HashRouter) */
  route?: string;
}

export interface OverlaySettings {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
}

interface OverlaySettingsPanelProps {
  pluginId: string;
  overlayId: string;
  /** Default values from overlay.json manifest */
  overlayDefinition: OverlayDefinition;
  /** Display name for the overlay (defaults to overlayId) */
  displayName?: string;
}

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 300;

/**
 * Calculate default position based on preset
 */
function calculateDefaultPosition(
  preset: OverlayDefinition["defaultPosition"],
  width: number,
  height: number
): { x: number; y: number } {
  // Assume a standard screen size for defaults - actual positioning
  // will be handled by the overlay runtime
  const screenWidth = 1920;
  const screenHeight = 1080;

  switch (preset) {
    case "top-left":
      return { x: 0, y: 0 };
    case "top-center":
      return { x: (screenWidth - width) / 2, y: 0 };
    case "top-right":
      return { x: screenWidth - width, y: 0 };
    case "center-left":
      return { x: 0, y: (screenHeight - height) / 2 };
    case "center":
      return { x: (screenWidth - width) / 2, y: (screenHeight - height) / 2 };
    case "center-right":
      return { x: screenWidth - width, y: (screenHeight - height) / 2 };
    case "bottom-left":
      return { x: 0, y: screenHeight - height };
    case "bottom-center":
      return { x: (screenWidth - width) / 2, y: screenHeight - height };
    case "bottom-right":
      return { x: screenWidth - width, y: screenHeight - height };
    default:
      return { x: 100, y: 100 };
  }
}

/**
 * Get default settings from overlay definition (overlay.json)
 */
function getDefaultSettings(def: OverlayDefinition): OverlaySettings {
  const defaultPos = calculateDefaultPosition(
    def.defaultPosition,
    def.width,
    def.height
  );

  return {
    enabled: true,
    width: def.width,
    height: def.height,
    x: def.x ?? defaultPos.x,
    y: def.y ?? defaultPos.y,
    alwaysOnTop: true,
    clickThrough: def.clickThrough ?? false,
  };
}

export function OverlaySettingsPanel({
  pluginId,
  overlayId,
  overlayDefinition,
}: OverlaySettingsPanelProps) {
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>(() =>
    getDefaultSettings(overlayDefinition)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isOverlayRunning, setIsOverlayRunning] = useState(false);

  // Refs for debouncing
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Partial<OverlaySettings>>({});

  const storeName = `${pluginId}-${overlayId}-overlay.json`;
  const overlayWindowId = `${pluginId}-${overlayId}`;

  // Check if overlay is currently running
  const checkOverlayStatus = useCallback(async () => {
    try {
      const exists = await invoke<boolean>("plugin:yaof|overlay_exists", {
        id: overlayWindowId,
      });
      setIsOverlayRunning(exists);
    } catch (error) {
      console.error("Failed to check overlay status:", error);
      setIsOverlayRunning(false);
    }
  }, [overlayWindowId]);

  // Load settings on mount
  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const s = await load(storeName);
        if (!mounted) return;
        setStore(s);

        // Start with defaults from overlay.json
        const defaults = getDefaultSettings(overlayDefinition);
        const loaded: OverlaySettings = { ...defaults };

        // Override with any stored user settings
        for (const key of Object.keys(defaults) as (keyof OverlaySettings)[]) {
          const value = await s.get<unknown>(key);
          if (value !== null && value !== undefined) {
            (loaded as any)[key] = value;
          }
        }

        setSettings(loaded);
        await checkOverlayStatus();
      } catch (error) {
        console.error("Failed to load overlay settings:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadSettings();
    return () => {
      mounted = false;
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [storeName, overlayDefinition, checkOverlayStatus]);

  // Apply settings to the live overlay window
  const applyToOverlay = useCallback(
    async (
      updates: Partial<OverlaySettings>,
      currentSettings: OverlaySettings
    ) => {
      // Check if overlay is running
      const exists = await invoke<boolean>("plugin:yaof|overlay_exists", {
        id: overlayWindowId,
      });

      if (!exists) {
        // If overlay doesn't exist and we're enabling it, spawn it
        if (updates.enabled === true) {
          try {
            // Build entry point with route hash for HashRouter support
            const route = overlayDefinition.route ?? "/";
            const entryPoint = `yaof-plugin://${pluginId}/index.html#${route}`;

            await invoke("plugin:yaof|spawn_overlay", {
              config: {
                id: overlayWindowId,
                pluginId,
                entryPoint,
                width: currentSettings.width,
                height: currentSettings.height,
                x: currentSettings.x,
                y: currentSettings.y,
                clickThrough: currentSettings.clickThrough,
                frameless: true,
              },
            });
            setIsOverlayRunning(true);
          } catch (error) {
            console.error("Failed to spawn overlay:", error);
          }
        }
        return;
      }

      // Overlay exists - apply updates
      try {
        // Handle enabled toggle - use visibility instead of close/spawn
        if (updates.enabled === false) {
          await invoke("plugin:yaof|overlay_set_visible", {
            id: overlayWindowId,
            visible: false,
          });
          return;
        }

        if (updates.enabled === true) {
          await invoke("plugin:yaof|overlay_set_visible", {
            id: overlayWindowId,
            visible: true,
          });
        }

        // Handle geometry updates (position/size)
        if (
          updates.x !== undefined ||
          updates.y !== undefined ||
          updates.width !== undefined ||
          updates.height !== undefined
        ) {
          await invoke("plugin:yaof|overlay_update_geometry", {
            id: overlayWindowId,
            x: currentSettings.x,
            y: currentSettings.y,
            width: currentSettings.width,
            height: currentSettings.height,
          });
        }

        // Handle click-through toggle
        if (updates.clickThrough !== undefined) {
          await invoke("plugin:yaof|overlay_set_click_through", {
            id: overlayWindowId,
            enabled: updates.clickThrough,
          });
        }

        // Handle always-on-top toggle
        if (updates.alwaysOnTop !== undefined) {
          await invoke("plugin:yaof|overlay_set_always_on_top", {
            id: overlayWindowId,
            enabled: updates.alwaysOnTop,
          });
        }
      } catch (error) {
        console.error("Failed to apply overlay settings:", error);
      }
    },
    [overlayWindowId, pluginId, overlayDefinition]
  );

  // Debounced update handler
  const debouncedUpdate = useCallback(
    (updates: Partial<OverlaySettings>) => {
      // Merge with pending updates
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

      // Update local state immediately for responsive UI
      setSettings((prev) => {
        const newSettings = { ...prev, ...updates };
        return newSettings;
      });

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(async () => {
        const pendingUpdates = pendingUpdatesRef.current;
        pendingUpdatesRef.current = {};

        if (!store || Object.keys(pendingUpdates).length === 0) return;

        // Save to store
        try {
          for (const [key, value] of Object.entries(pendingUpdates)) {
            await store.set(key, value);
          }
          await store.save();
        } catch (error) {
          console.error("Failed to save settings:", error);
        }

        // Apply to live overlay
        setSettings((currentSettings) => {
          applyToOverlay(pendingUpdates, currentSettings);
          return currentSettings;
        });
      }, DEBOUNCE_DELAY);
    },
    [store, applyToOverlay]
  );

  // Update a single setting
  const updateSetting = <K extends keyof OverlaySettings>(
    key: K,
    value: OverlaySettings[K]
  ) => {
    debouncedUpdate({ [key]: value });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Overlay Settings</CardTitle>
            <CardDescription>
              Configure overlay appearance and behavior
            </CardDescription>
          </div>
          <Badge variant={isOverlayRunning ? "default" : "secondary"}>
            {isOverlayRunning ? "Running" : "Stopped"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enabled Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="overlay-enabled" className="text-sm font-medium">
              Enabled
            </Label>
            <p className="text-xs text-muted-foreground">
              Show or hide this overlay
            </p>
          </div>
          <Switch
            id="overlay-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked: boolean) =>
              updateSetting("enabled", checked)
            }
          />
        </div>

        <Separator />

        {/* Position */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Position</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pos-x" className="text-xs text-muted-foreground">
                X
              </Label>
              <Input
                id="pos-x"
                type="number"
                value={settings.x}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting("x", Number(e.target.value))
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-y" className="text-xs text-muted-foreground">
                Y
              </Label>
              <Input
                id="pos-y"
                type="number"
                value={settings.y}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting("y", Number(e.target.value))
                }
                className="font-mono"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Size</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="size-w" className="text-xs text-muted-foreground">
                Width
              </Label>
              <Input
                id="size-w"
                type="number"
                value={settings.width}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting("width", Number(e.target.value))
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size-h" className="text-xs text-muted-foreground">
                Height
              </Label>
              <Input
                id="size-h"
                type="number"
                value={settings.height}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting("height", Number(e.target.value))
                }
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Click Through */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="click-through" className="text-sm font-medium">
              Click Through
            </Label>
            <p className="text-xs text-muted-foreground">
              Allow clicks to pass through overlay
            </p>
          </div>
          <Switch
            id="click-through"
            checked={settings.clickThrough}
            onCheckedChange={(checked: boolean) =>
              updateSetting("clickThrough", checked)
            }
          />
        </div>

        {/* Always On Top */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="always-on-top" className="text-sm font-medium">
              Always On Top
            </Label>
            <p className="text-xs text-muted-foreground">
              Keep overlay above other windows
            </p>
          </div>
          <Switch
            id="always-on-top"
            checked={settings.alwaysOnTop}
            onCheckedChange={(checked: boolean) =>
              updateSetting("alwaysOnTop", checked)
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
