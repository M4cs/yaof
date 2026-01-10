import { useOverlayContext } from "@/context";
import { load, Store } from "@tauri-apps/plugin-store";
import { useCallback, useEffect, useState } from "react";

type SetStateAction<T> = T | ((prev: T) => T);

export interface UsePluginStoreReturn<T> {
  value: T;
  set: (value: SetStateAction<T>) => Promise<void>;
  isLoading: boolean;
}

export function usePluginStore<T>(
  key: string,
  defaultValue: T
): UsePluginStoreReturn<T> {
  const { pluginId } = useOverlayContext();
  const [value, setValue] = useState<T>(defaultValue);
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function loadValue() {
      try {
        const store = await load(`${pluginId}.json`);
        if (mounted && store !== null) {
          setStore(store);
          const val = await store.get<T>(key);
          if (mounted && val) {
            setValue(val);
          }
        }
      } catch (e) {
        console.error(`[usePluginStore] Failed to load "${key}"`, e);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadValue();

    return () => {
      mounted = false;
    };
  }, [key, pluginId]);

  const set = useCallback(
    async (action: SetStateAction<T>) => {
      if (store === null || isLoading) {
        console.warn(`[usePluginStore] Store not loaded yet`);
        return;
      }
      const newValue = action instanceof Function ? action(value) : action;
      setValue(newValue);

      try {
        await store?.set(key, newValue);
      } catch (e) {
        console.error(`[usePluginStore] Failed to set "${key}"`, e);
        throw e;
      }
    },
    [key, store, value]
  );

  return { value, set, isLoading };
}
