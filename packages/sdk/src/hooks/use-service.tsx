import { useOverlayContext } from "@/context";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseServiceReturn<T> {
  data: T | null;
  isConnected: boolean;
  error: Error | null;
}

export function useService<T = unknown>(
  providerId: string
): UseServiceReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let mounted = true;

    async function subscribe() {
      try {
        // Subscribe to the service on the backend
        await invoke("plugin:yaof|service_subscribe", { providerId });

        if (mounted) {
          setIsConnected(true);
          setError(null);
        }

        // Listen for service events
        const unlisten = await listen<T>(
          `yaof:service:${providerId}`,
          (event) => {
            if (mounted) {
              setData(event.payload);
            }
          }
        );

        unlistenRef.current = unlisten;
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsConnected(false);
        }
      }
    }

    subscribe();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      // Unsubscribe from service
      invoke("plugin:yaof|service_unsubscribe", { providerId }).catch(
        console.error
      );
    };
  }, [providerId]);

  return { data, isConnected, error };
}

export interface UseProvideServiceReturn<T> {
  broadcast: (data: T) => Promise<void>;
  isRegistered: boolean;
}

export function useProvideService<T = unknown>(
  serviceId: string,
  schema: object = {}
): UseProvideServiceReturn<T> {
  const { pluginId } = useOverlayContext();
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function register() {
      try {
        await invoke("plugin:yaof|service_register", {
          serviceId,
          pluginId,
          schema,
        });
        if (mounted) {
          setIsRegistered(true);
        }
      } catch (err) {
        console.error(
          `[useProvideService] Failed to register "${serviceId}":`,
          err
        );
      }
    }

    register();

    return () => {
      mounted = false;
      // Unregister service
      invoke("plugin:yaof|service_unregister", { serviceId }).catch(
        console.error
      );
    };
  }, [serviceId, pluginId, schema]);

  const broadcast = useCallback(
    async (data: T) => {
      if (!isRegistered) {
        console.warn(
          `[useProvideService] Cannot broadcast: service "${serviceId}" not registered`
        );
        return;
      }

      try {
        await invoke("plugin:yaof|service_broadcast", {
          serviceId,
          data,
        });
      } catch (err) {
        console.error(`[useProvideService] Broadcast failed:`, err);
        throw err;
      }
    },
    [serviceId, isRegistered]
  );

  return { broadcast, isRegistered };
}
