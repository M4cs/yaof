import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { load, Store } from "@tauri-apps/plugin-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayContext } from "../context";
import type { SettingsSchema, SettingsValues } from "../types/settings";

/** Event payload for settings changes */
interface SettingsChangedPayload {
  pluginId: string;
  values: Record<string, unknown>;
}

export interface UsePluginSettingsReturn<T extends SettingsSchema> {
  /** Current settings values */
  settings: SettingsValues<T>;
  /** Update a single setting */
  setSetting: <K extends keyof T>(
    key: K,
    value: SettingsValues<T>[K]
  ) => Promise<void>;
  /** Update multiple settings at once */
  setSettings: (updates: Partial<SettingsValues<T>>) => Promise<void>;
  /** Reset a setting to its default value */
  resetSetting: <K extends keyof T>(key: K) => Promise<void>;
  /** Reset all settings to defaults */
  resetAll: () => Promise<void>;
  /** Whether settings are still loading */
  isLoading: boolean;
  /** The schema definition */
  schema: T;
}

/**
 * Hook for managing plugin settings with automatic persistence.
 *
 * @example
 * ```tsx
 * const settingsSchema = {
 *   format: { type: "select", label: "Format", options: [...], default: "24h" },
 *   showSeconds: { type: "boolean", label: "Show Seconds", default: true },
 * } as const;
 *
 * function MyOverlay() {
 *   const { settings, setSetting } = usePluginSettings(settingsSchema);
 *
 *   return <div>Format: {settings.format}</div>;
 * }
 * ```
 */
export function usePluginSettings<T extends SettingsSchema>(
  schema: T
): UsePluginSettingsReturn<T> {
  const { pluginId } = useOverlayContext();
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});

  // Compute defaults from schema
  const defaults = useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema)) {
      result[key] = field.default;
    }
    return result;
  }, [schema]);

  // Keep schema ref stable for event listener
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  // Load settings on mount
  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const s = await load(`${pluginId}-settings.json`);
        if (!mounted) return;

        setStore(s);

        // Load all settings, falling back to defaults
        const loaded: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(schema)) {
          const stored = await s.get<unknown>(key);
          loaded[key] =
            stored !== null && stored !== undefined ? stored : field.default;
        }

        setValues(loaded);
      } catch (error) {
        console.error("[usePluginSettings] Failed to load:", error);
        setValues(defaults);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();
    return () => {
      mounted = false;
    };
  }, [pluginId, schema, defaults]);

  // Listen for settings changes from core-settings window
  useEffect(() => {
    let mounted = true;
    let unlistenFn: UnlistenFn | null = null;

    async function setupListener() {
      try {
        unlistenFn = await listen<SettingsChangedPayload>(
          `yaof:settings:changed:${pluginId}`,
          (event) => {
            if (!mounted) return;

            const { values: newValues } = event.payload;

            // Merge received values with defaults from schema
            const merged: Record<string, unknown> = {};
            for (const [key, field] of Object.entries(schemaRef.current)) {
              merged[key] = key in newValues ? newValues[key] : field.default;
            }

            setValues(merged);
          }
        );
      } catch (error) {
        console.error(
          "[usePluginSettings] Failed to setup settings listener:",
          error
        );
      }
    }

    setupListener();

    return () => {
      mounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [pluginId]);

  // Update a single setting
  const setSetting = useCallback(
    async <K extends keyof T>(key: K, value: SettingsValues<T>[K]) => {
      if (!store) return;

      setValues((prev) => ({ ...prev, [key]: value }));
      await store.set(key as string, value);
      await store.save();
    },
    [store]
  );

  // Update multiple settings
  const setSettings = useCallback(
    async (updates: Partial<SettingsValues<T>>) => {
      if (!store) return;

      setValues((prev) => ({ ...prev, ...updates }));

      for (const [key, value] of Object.entries(updates)) {
        await store.set(key, value);
      }
      await store.save();
    },
    [store]
  );

  // Reset a single setting to default
  const resetSetting = useCallback(
    async <K extends keyof T>(key: K) => {
      const defaultValue = schema[key]?.default;
      await setSetting(key, defaultValue as SettingsValues<T>[K]);
    },
    [schema, setSetting]
  );

  // Reset all settings to defaults
  const resetAll = useCallback(async () => {
    if (!store) return;

    setValues(defaults);

    for (const [key, value] of Object.entries(defaults)) {
      await store.set(key, value);
    }
    await store.save();
  }, [store, defaults]);

  return {
    settings: values as SettingsValues<T>,
    setSetting,
    setSettings,
    resetSetting,
    resetAll,
    isLoading,
    schema,
  };
}
