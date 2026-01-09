import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useState } from "react";

export interface UseOverlayReturn {
  isVisible: boolean;
  show: () => Promise<void>;
  hide: () => Promise<void>;
  toggle: () => Promise<void>;
  setPosition: (x: number, y: number, type?: "Physical" | "Logical") => Promise<void>;
  setSize: (width: number, height: number, type?: "Physical" | "Logical") => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  close: () => Promise<void>;
}

export function useOverlay(): UseOverlayReturn {
  const [isVisible, setIsVisible] = useState(false);
  const window = getCurrentWebviewWindow();

  useEffect(() => {
    window.isVisible().then(setIsVisible);

    const unlisten = window.onCloseRequested(() => {
      setIsVisible(false);
    });

    return () => {
      unlisten.then((fn) => fn);
    };
  }, []);

  const show = useCallback(async () => {
    await window.show();
    setIsVisible(true);
  }, []);

  const hide = useCallback(async () => {
    await window.hide();
    setIsVisible(false);
  }, []);

  const toggle = useCallback(async () => {
    if (isVisible) {
      await hide();
    } else {
      await show();
    }
  }, [isVisible, show, hide]);

  const setPosition = useCallback(async (x: number, y: number, type: "Physical" | "Logical" = "Physical") => {
    await window.setPosition(type === "Physical" ? new PhysicalPosition(x, y) : new LogicalPosition(x, y));
  }, []);

  const setSize = useCallback(async (width: number, height: number, type: "Physical" | "Logical" = "Physical") => {
    await window.setSize(type === "Physical" ? new PhysicalSize(width, height) : new LogicalSize(width, height));
  }, []);

  const setClickThrough = useCallback(async (enabled: boolean) => {
    await invoke("overlay_set_click_through", {
      windowLabel: window.label,
      enabled,
    });
  }, []);

  const close = useCallback(async () => {
    await window.close();
  }, []);

  return {
    isVisible,
    show,
    hide,
    toggle,
    setPosition,
    setSize,
    setClickThrough,
    close,
  };
}
