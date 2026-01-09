import { useOverlayContext } from "@/context";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { load, Store } from "@tauri-apps/plugin-store";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";

/** Event payload for settings changes */
interface SettingsChangedPayload {
  pluginId: string;
  values: Record<string, unknown>;
}

export interface UsePluginConfigReturn<T extends z.ZodObject<z.ZodRawShape>> {
  /** Full config object with all values (reactive) */
  config: z.infer<T>;
  /** Get a specific config value in real-time from the store */
  get: <K extends keyof z.infer<T>>(key: K) => Promise<z.infer<T>[K]>;
  /** Set a specific config value and update the config state */
  set: <K extends keyof z.infer<T>>(
    key: K,
    value: z.infer<T>[K]
  ) => Promise<void>;
  /** Whether the config is still loading */
  isLoading: boolean;
  /** The schema used for this config */
  schema: T;
}

/**
 * Extract default values from a Zod object schema.
 * Uses Zod v4's simplified API.
 */
function getDefaultsFromSchema<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T
): z.infer<T> {
  const shape = schema.shape;
  const defaults: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(shape)) {
    // In Zod v4, we can use parse with undefined to get defaults
    // or check if the schema has a default value
    const zodField = fieldSchema as z.ZodType;

    try {
      // Try to parse undefined - if there's a default, it will be used
      defaults[key] = zodField.parse(undefined);
    } catch {
      // No default, set to undefined
      defaults[key] = undefined;
    }
  }

  return defaults as z.infer<T>;
}

/**
 * Hook for managing plugin configuration with Zod schema validation.
 *
 * @example
 * ```tsx
 * import { z } from "zod";
 * import { usePluginConfig } from "@m4cs/yaof-sdk";
 *
 * const configSchema = z.object({
 *   clockFormat: z.enum(["12h", "24h"]).default("24h"),
 *   showSeconds: z.boolean().default(true),
 *   refreshInterval: z.number().min(100).max(10000).default(1000),
 * });
 *
 * function MyComponent() {
 *   const { config, get, set, isLoading } = usePluginConfig(configSchema);
 *
 *   // config is fully typed and reactive
 *   console.log(config.clockFormat); // "24h"
 *
 *   // Get a value in real-time from the store
 *   const currentFormat = await get("clockFormat");
 *
 *   // Set a value (updates both store and config state)
 *   await set("clockFormat", "12h");
 * }
 * ```
 */
export function usePluginConfig<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T
): UsePluginConfigReturn<T> {
  type ConfigType = z.infer<T>;

  const { pluginId } = useOverlayContext();
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<ConfigType>(() =>
    getDefaultsFromSchema(schema)
  );

  // Keep schema ref stable for callbacks
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  // Load config on mount
  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      try {
        // Use -settings.json to match the Tauri commands used by core-settings
        const s = await load(`${pluginId}-settings.json`);
        if (!mounted) return;

        setStore(s);

        // Load all values from store, merging with defaults
        const defaults = getDefaultsFromSchema(schema);
        const loaded: Record<string, unknown> = { ...defaults };

        for (const key of Object.keys(schema.shape)) {
          const stored = await s.get<unknown>(key);
          if (stored !== null && stored !== undefined) {
            loaded[key] = stored;
          }
        }

        // Validate the loaded config against the schema
        const validated = schema.parse(loaded);
        setConfig(validated);
      } catch (error) {
        console.error("[usePluginConfig] Failed to load config:", error);
        // Fall back to defaults on error
        setConfig(getDefaultsFromSchema(schema));
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      mounted = false;
    };
  }, [pluginId, schema]);

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

            const { values } = event.payload;

            // Merge received values with defaults from schema
            const defaults = getDefaultsFromSchema(schemaRef.current);
            const merged: Record<string, unknown> = { ...defaults };

            for (const [key, value] of Object.entries(values)) {
              if (key in schemaRef.current.shape) {
                merged[key] = value;
              }
            }

            try {
              // Validate the merged config against the schema
              const validated = schemaRef.current.parse(merged);
              setConfig(validated);
            } catch (error) {
              console.error(
                "[usePluginConfig] Failed to validate settings update:",
                error
              );
            }
          }
        );
      } catch (error) {
        console.error(
          "[usePluginConfig] Failed to setup settings listener:",
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

  /**
   * Get a specific config value in real-time from the store.
   * This fetches directly from the store, not from React state.
   */
  const get = useCallback(
    async <K extends keyof ConfigType>(key: K): Promise<ConfigType[K]> => {
      if (!store) {
        // Return from current state if store not ready
        return config[key];
      }

      const stored = await store.get<ConfigType[K]>(key as string);

      if (stored !== null && stored !== undefined) {
        // Validate the individual field if possible
        const fieldSchema = schemaRef.current.shape[key as string];
        if (fieldSchema) {
          try {
            return (fieldSchema as z.ZodType).parse(stored) as ConfigType[K];
          } catch {
            // Return stored value if validation fails
            return stored;
          }
        }
        return stored;
      }

      // Return default from current config
      return config[key];
    },
    [store, config]
  );

  /**
   * Set a specific config value.
   * Updates both the store and the reactive config state.
   */
  const set = useCallback(
    async <K extends keyof ConfigType>(
      key: K,
      value: ConfigType[K]
    ): Promise<void> => {
      if (!store) {
        console.warn("[usePluginConfig] Store not loaded yet");
        return;
      }

      // Validate the value against the field schema
      const fieldSchema = schemaRef.current.shape[key as string];
      if (fieldSchema) {
        try {
          (fieldSchema as z.ZodType).parse(value);
        } catch (error) {
          console.error(
            `[usePluginConfig] Validation failed for "${String(key)}":`,
            error
          );
          throw error;
        }
      }

      // Update store
      await store.set(key as string, value);
      await store.save();

      // Update React state
      setConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [store]
  );

  return {
    config,
    get,
    set,
    isLoading,
    schema,
  };
}
