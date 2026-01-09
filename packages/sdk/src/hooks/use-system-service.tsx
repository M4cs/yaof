import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

/**
 * System status data emitted by yaof-core's built-in system services.
 * This matches the SystemStatus struct from yaof-core/src/services/system/mod.rs
 */
export interface SystemStatus {
  cpu: {
    usage: number;
  };
  network: {
    connected: boolean;
    connection_type: string;
    strength: number | null;
  };
  window: {
    title: string | null;
    app_name: string | null;
    process_id: number | null;
  };
  desktop: {
    number: number;
    name: string | null;
  };
  media: {
    playing: boolean;
    title: string | null;
    artist: string | null;
    album: string | null;
    duration_ms: number | null;
    position_ms: number | null;
    app_name: string | null;
  };
}

export interface UseSystemServiceReturn<T> {
  data: T | null;
  isConnected: boolean;
  error: Error | null;
}

/**
 * Hook to subscribe to yaof-core's built-in system services.
 *
 * Unlike `useService` which is for plugin-to-plugin communication,
 * this hook listens to the system status events emitted by yaof-core's
 * built-in system services (CPU, network, window, desktop, media).
 *
 * @example
 * ```tsx
 * // Get the full system status
 * const { data, isConnected } = useSystemService();
 *
 * // Or with a transformer to get specific data
 * const { data } = useSystemService((status) => ({
 *   cpuUsage: status.cpu.usage,
 *   networkConnected: status.network.connected,
 * }));
 * ```
 */
export function useSystemService(): UseSystemServiceReturn<SystemStatus>;
export function useSystemService<T>(
  transform: (status: SystemStatus) => T
): UseSystemServiceReturn<T>;
export function useSystemService<T = SystemStatus>(
  transform?: (status: SystemStatus) => T
): UseSystemServiceReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let mounted = true;

    async function subscribe() {
      try {
        // Listen for system status events from yaof-core
        const unlisten = await listen<SystemStatus>(
          "yaof:system:status",
          (event) => {
            if (mounted) {
              const transformed = transform
                ? transform(event.payload)
                : (event.payload as unknown as T);
              setData(transformed);
              setIsConnected(true);
              setError(null);
            }
          }
        );

        unlistenRef.current = unlisten;

        // Mark as connected once we've set up the listener
        // (we'll get data on the next tick from the system services)
        if (mounted) {
          setIsConnected(true);
        }
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
    };
  }, [transform]);

  return { data, isConnected, error };
}
