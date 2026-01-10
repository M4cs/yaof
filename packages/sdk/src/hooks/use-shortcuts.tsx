import { useCallback, useEffect, useRef, useState } from "react";
import {
  register,
  unregister,
  isRegistered,
  type ShortcutEvent,
} from "@tauri-apps/plugin-global-shortcut";
import { useOverlayContext } from "../context";

/** Shortcut registration info */
export interface ShortcutInfo {
  /** Unique identifier for this shortcut */
  id: string;
  /** The accelerator string (e.g., "CommandOrControl+Shift+T") */
  accelerator: string;
  /** Human-readable description */
  description?: string;
  /** Whether the shortcut is currently registered */
  isActive: boolean;
}

/** Callback function for shortcut triggers */
export type ShortcutCallback = () => void | Promise<void>;

export interface UseShortcutsReturn {
  /** Register a global shortcut */
  registerShortcut: (
    id: string,
    accelerator: string,
    callback: ShortcutCallback,
    description?: string
  ) => Promise<boolean>;
  /** Unregister a shortcut by ID */
  unregisterShortcut: (id: string) => Promise<void>;
  /** Update a shortcut's accelerator */
  updateShortcut: (id: string, newAccelerator: string) => Promise<boolean>;
  /** Check if a shortcut is registered */
  isShortcutRegistered: (accelerator: string) => Promise<boolean>;
  /** Unregister all shortcuts for this plugin */
  unregisterAllShortcuts: () => Promise<void>;
  /** List of currently registered shortcuts */
  shortcuts: ShortcutInfo[];
  /** Whether shortcuts are loading */
  isLoading: boolean;
}

/**
 * Hook for managing global keyboard shortcuts.
 *
 * @example
 * ```tsx
 * function MyOverlay() {
 *   const { registerShortcut, shortcuts } = useShortcuts();
 *
 *   useEffect(() => {
 *     registerShortcut(
 *       'toggle-visibility',
 *       'CommandOrControl+Shift+T',
 *       () => console.log('Shortcut triggered!'),
 *       'Toggle overlay visibility'
 *     );
 *   }, []);
 *
 *   return <div>Shortcuts: {shortcuts.length}</div>;
 * }
 * ```
 */
export function useShortcuts(): UseShortcutsReturn {
  const { pluginId } = useOverlayContext();
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Store callbacks in a ref to avoid re-registering on callback changes
  const callbacksRef = useRef<Map<string, ShortcutCallback>>(new Map());

  // Store accelerators by ID for cleanup
  const acceleratorsRef = useRef<Map<string, string>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Unregister all shortcuts when component unmounts
      const accelerators = Array.from(acceleratorsRef.current.values());
      accelerators.forEach((acc) => {
        unregister(acc).catch(console.error);
      });
    };
  }, []);

  // Initialize
  useEffect(() => {
    setIsLoading(false);
  }, []);

  const registerShortcut = useCallback(
    async (
      id: string,
      accelerator: string,
      callback: ShortcutCallback,
      description?: string
    ): Promise<boolean> => {
      try {
        // Check if already registered globally
        const alreadyRegistered = await isRegistered(accelerator);
        if (alreadyRegistered) {
          // Check if it's our own shortcut
          const existingAcc = acceleratorsRef.current.get(id);
          if (existingAcc === accelerator) {
            // Just update the callback
            callbacksRef.current.set(id, callback);
            return true;
          }
          console.warn(
            `[useShortcuts] Shortcut "${accelerator}" is already registered`
          );
          return false;
        }

        // If this ID had a different accelerator, unregister the old one
        const oldAccelerator = acceleratorsRef.current.get(id);
        if (oldAccelerator && oldAccelerator !== accelerator) {
          await unregister(oldAccelerator);
        }

        // Store the callback
        callbacksRef.current.set(id, callback);
        acceleratorsRef.current.set(id, accelerator);

        // Register the shortcut
        await register(accelerator, (event: ShortcutEvent) => {
          if (event.state === "Pressed") {
            const cb = callbacksRef.current.get(id);
            if (cb) {
              Promise.resolve(cb()).catch(console.error);
            }
          }
        });

        // Update state
        setShortcuts((prev) => {
          const existing = prev.find((s) => s.id === id);
          if (existing) {
            return prev.map((s) =>
              s.id === id
                ? { ...s, accelerator, description, isActive: true }
                : s
            );
          }
          return [...prev, { id, accelerator, description, isActive: true }];
        });

        console.log(
          `[useShortcuts] Registered shortcut "${id}" with accelerator "${accelerator}"`
        );
        return true;
      } catch (error) {
        console.error(
          `[useShortcuts] Failed to register shortcut "${id}":`,
          error
        );
        return false;
      }
    },
    []
  );

  const unregisterShortcut = useCallback(async (id: string): Promise<void> => {
    try {
      const accelerator = acceleratorsRef.current.get(id);
      if (accelerator) {
        await unregister(accelerator);
        acceleratorsRef.current.delete(id);
        callbacksRef.current.delete(id);

        setShortcuts((prev) => prev.filter((s) => s.id !== id));
        console.log(`[useShortcuts] Unregistered shortcut "${id}"`);
      }
    } catch (error) {
      console.error(
        `[useShortcuts] Failed to unregister shortcut "${id}":`,
        error
      );
    }
  }, []);

  const updateShortcut = useCallback(
    async (id: string, newAccelerator: string): Promise<boolean> => {
      try {
        const oldAccelerator = acceleratorsRef.current.get(id);
        const callback = callbacksRef.current.get(id);

        if (!callback) {
          console.warn(`[useShortcuts] No callback found for shortcut "${id}"`);
          return false;
        }

        // Check if new accelerator is already in use
        const alreadyRegistered = await isRegistered(newAccelerator);
        if (alreadyRegistered && oldAccelerator !== newAccelerator) {
          console.warn(
            `[useShortcuts] Shortcut "${newAccelerator}" is already registered`
          );
          return false;
        }

        // Unregister old accelerator
        if (oldAccelerator) {
          await unregister(oldAccelerator);
        }

        // Register new accelerator
        acceleratorsRef.current.set(id, newAccelerator);
        await register(newAccelerator, (event: ShortcutEvent) => {
          if (event.state === "Pressed") {
            const cb = callbacksRef.current.get(id);
            if (cb) {
              Promise.resolve(cb()).catch(console.error);
            }
          }
        });

        // Update state
        setShortcuts((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, accelerator: newAccelerator } : s
          )
        );

        console.log(
          `[useShortcuts] Updated shortcut "${id}" to "${newAccelerator}"`
        );
        return true;
      } catch (error) {
        console.error(
          `[useShortcuts] Failed to update shortcut "${id}":`,
          error
        );
        return false;
      }
    },
    []
  );

  const isShortcutRegistered = useCallback(
    async (accelerator: string): Promise<boolean> => {
      try {
        return await isRegistered(accelerator);
      } catch (error) {
        console.error(
          `[useShortcuts] Failed to check if shortcut is registered:`,
          error
        );
        return false;
      }
    },
    []
  );

  const unregisterAllShortcuts = useCallback(async (): Promise<void> => {
    try {
      const accelerators = Array.from(acceleratorsRef.current.values());
      for (const acc of accelerators) {
        await unregister(acc);
      }
      acceleratorsRef.current.clear();
      callbacksRef.current.clear();
      setShortcuts([]);
      console.log(`[useShortcuts] Unregistered all shortcuts`);
    } catch (error) {
      console.error(
        `[useShortcuts] Failed to unregister all shortcuts:`,
        error
      );
    }
  }, []);

  return {
    registerShortcut,
    unregisterShortcut,
    updateShortcut,
    isShortcutRegistered,
    unregisterAllShortcuts,
    shortcuts,
    isLoading,
  };
}

/**
 * Hook for using a shortcut that's tied to a setting value.
 * Automatically updates the shortcut when the setting changes.
 *
 * @example
 * ```tsx
 * function MyOverlay() {
 *   const { settings } = usePluginSettings(schema);
 *
 *   useSettingShortcut(
 *     'toggle-visibility',
 *     settings.toggleShortcut,
 *     () => setVisible(v => !v),
 *     'Toggle overlay visibility'
 *   );
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useSettingShortcut(
  id: string,
  accelerator: string | undefined,
  callback: ShortcutCallback,
  description?: string
): { isActive: boolean; error: string | null } {
  const { registerShortcut, unregisterShortcut, shortcuts } = useShortcuts();
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Register/update shortcut when accelerator changes
  useEffect(() => {
    if (!accelerator) {
      // No accelerator set, unregister if exists
      unregisterShortcut(id);
      setError(null);
      return;
    }

    const register = async () => {
      const success = await registerShortcut(
        id,
        accelerator,
        () => callbackRef.current(),
        description
      );
      if (!success) {
        setError(`Failed to register shortcut "${accelerator}"`);
      } else {
        setError(null);
      }
    };

    register();

    return () => {
      unregisterShortcut(id);
    };
  }, [id, accelerator, description, registerShortcut, unregisterShortcut]);

  const shortcutInfo = shortcuts.find((s) => s.id === id);

  return {
    isActive: shortcutInfo?.isActive ?? false,
    error,
  };
}
