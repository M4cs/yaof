import { load, Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOverlayContext } from "../context";
import type { PositionPreset } from "./use-position";

export interface OverlaySettings {
  enabled: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  positionPreset: PositionPreset | "custom";
  opacity: number;
  clickThrough: boolean;
  alwaysOnTop: boolean;
}

// Minimal fallback defaults - these are only used if overlay.json doesn't exist
const FALLBACK_DEFAULTS: OverlaySettings = {
  enabled: true,
  width: 300,
  height: 200,
  x: 100,
  y: 100,
  positionPreset: "bottom-right",
  opacity: 100,
  clickThrough: false,
  alwaysOnTop: true,
};

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 300;

export interface UseOverlaySettingsReturn {
  settings: OverlaySettings;
  updateSettings: (updates: Partial<OverlaySettings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  isLoading: boolean;
}

/**
 * Calculate default position based on preset
 */
function calculateDefaultPosition(
  preset: string | undefined,
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
 * Hook for managing core overlay settings (dimensions, position, etc.)
 * These are automatic for all overlays and persisted per-overlay.
 *
 * Settings priority:
 * 1. Stored user settings (from tauri store)
 * 2. overlay.json manifest values (from plugin config)
 * 3. Fallback defaults
 */
export function useOverlaySettings(): UseOverlaySettingsReturn {
  const { pluginId, overlayId, manifest } = useOverlayContext();
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>(FALLBACK_DEFAULTS);
  const [manifestDefaults, setManifestDefaults] =
    useState<OverlaySettings>(FALLBACK_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  // Refs for debouncing
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Partial<OverlaySettings>>({});

  const storeName = `${pluginId}-${overlayId}-overlay.json`;
  const overlayWindowId = `${pluginId}-${overlayId}`;

  // Load settings on mount
  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const s = await load(storeName);
        if (!mounted) return;
        setStore(s);

        // Get defaults from overlay.json manifest (via context manifest)
        // The manifest comes from the OverlayContext which has the overlay definition
        const overlayDef = manifest?.overlays?.[overlayId];

        // Build defaults from overlay.json, falling back to FALLBACK_DEFAULTS
        const defaultPos = calculateDefaultPosition(
          overlayDef?.defaultPosition,
          overlayDef?.width ?? FALLBACK_DEFAULTS.width,
          overlayDef?.height ?? FALLBACK_DEFAULTS.height
        );

        const defaults: OverlaySettings = {
          enabled: true,
          width: overlayDef?.width ?? FALLBACK_DEFAULTS.width,
          height: overlayDef?.height ?? FALLBACK_DEFAULTS.height,
          x: overlayDef?.x ?? defaultPos.x,
          y: overlayDef?.y ?? defaultPos.y,
          positionPreset:
            (overlayDef?.defaultPosition as PositionPreset) ??
            FALLBACK_DEFAULTS.positionPreset,
          opacity: FALLBACK_DEFAULTS.opacity,
          clickThrough:
            overlayDef?.clickThrough ?? FALLBACK_DEFAULTS.clickThrough,
          alwaysOnTop: FALLBACK_DEFAULTS.alwaysOnTop,
        };

        setManifestDefaults(defaults);

        // Load stored settings, using manifest defaults as fallback
        const loaded: OverlaySettings = { ...defaults };
        for (const key of Object.keys(defaults) as (keyof OverlaySettings)[]) {
          const value = await s.get<unknown>(key);
          if (value !== null && value !== undefined) {
            (loaded as any)[key] = value;
          }
        }

        setSettings(loaded);

        // Apply settings to window, but skip clickThrough on initial load
        // The backend already applied the manifest's clickThrough value during window creation
        await applySettings(loaded, true);
      } catch (error) {
        console.error("[useOverlaySettings] Failed to load:", error);
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
  }, [storeName, overlayId, manifest]);

  // Apply settings to the actual window using the proper Tauri commands
  // This ensures we use configure_overlay/set_unconstrained_position on the backend
  // skipClickThrough: if true, don't apply clickThrough setting (used on initial load
  // to avoid overriding the backend's manifest-based setting)
  const applySettings = useCallback(
    async (s: OverlaySettings, skipClickThrough = false) => {
      try {
        // Use overlay_update_geometry command to properly position the window
        // This uses set_unconstrained_position on the backend which bypasses
        // macOS frame constraining for menu bar area positioning
        await invoke("plugin:yaof|overlay_update_geometry", {
          id: overlayWindowId,
          x: s.x,
          y: s.y,
          width: s.width,
          height: s.height,
        });

        // Only apply clickThrough if explicitly requested (not on initial load)
        // The backend already applies the manifest's clickThrough value during window creation
        if (!skipClickThrough) {
          await invoke("plugin:yaof|overlay_set_click_through", {
            id: overlayWindowId,
            enabled: s.clickThrough,
          });
        }

        // Apply always on top setting
        await invoke("plugin:yaof|overlay_set_always_on_top", {
          id: overlayWindowId,
          enabled: s.alwaysOnTop,
        });

        // Handle visibility
        await invoke("plugin:yaof|overlay_set_visible", {
          id: overlayWindowId,
          visible: s.enabled,
        });

        // Opacity requires platform-specific handling or Tauri plugin
        // await window.setOpacity(s.opacity / 100);
      } catch (error) {
        console.error("[useOverlaySettings] Failed to apply:", error);
      }
    },
    [overlayWindowId]
  );

  // Debounced update handler - saves to store and applies to overlay
  const debouncedApply = useCallback(
    (updates: Partial<OverlaySettings>, currentSettings: OverlaySettings) => {
      // Merge with pending updates
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

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
          console.error("[useOverlaySettings] Failed to save:", error);
        }

        // Apply to live overlay
        await applySettings(currentSettings);
      }, DEBOUNCE_DELAY);
    },
    [store, applySettings]
  );

  // Update settings - immediately updates local state, debounces save and apply
  const updateSettings = useCallback(
    async (updates: Partial<OverlaySettings>) => {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      // Debounce the save and apply
      debouncedApply(updates, newSettings);
    },
    [settings, debouncedApply]
  );

  // Reset to manifest defaults (from overlay.json)
  const resetToDefaults = useCallback(async () => {
    await updateSettings(manifestDefaults);
  }, [updateSettings, manifestDefaults]);

  return {
    settings,
    updateSettings,
    resetToDefaults,
    isLoading,
  };
}
