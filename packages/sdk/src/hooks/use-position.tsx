import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, currentMonitor } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useState } from "react";

export type PositionPreset =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface Position {
  x: number;
  y: number;
}

export interface ScreenInfo {
  width: number;
  height: number;
  scaleFactor: number;
}

export interface UsePositionReturn {
  /** Move window to a preset position */
  setPreset: (preset: PositionPreset, padding?: number) => Promise<void>;
  /** Move window to exact coordinates */
  setCustom: (x: number, y: number) => Promise<void>;
  /** Current window position (null until loaded) */
  currentPosition: Position | null;
  /** Current screen info */
  screen: ScreenInfo | null;
}

/**
 * Hook for managing overlay window position with preset support.
 */
export function usePosition(): UsePositionReturn {
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [screen, setScreen] = useState<ScreenInfo | null>(null);
  const [windowSize, setWindowSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const window = getCurrentWebviewWindow();

  // Load initial position and screen info
  useEffect(() => {
    async function init() {
      try {
        // Get current monitor info
        const monitor = await currentMonitor();
        if (monitor) {
          setScreen({
            width: monitor.size.width,
            height: monitor.size.height,
            scaleFactor: monitor.scaleFactor,
          });
        }

        // Get current window position
        const position = await window.outerPosition();
        setCurrentPosition({ x: position.x, y: position.y });

        // Get window size
        const size = await window.outerSize();
        setWindowSize({ width: size.width, height: size.height });
      } catch (err) {
        console.error("[usePosition] Failed to initialize:", err);
      }
    }

    init();
  }, []);

  const setCustom = useCallback(async (x: number, y: number) => {
    await window.setPosition(new LogicalPosition(x, y));
    setCurrentPosition({ x, y });
  }, []);

  const setPreset = useCallback(
    async (preset: PositionPreset, padding: number = 20) => {
      if (!screen || !windowSize) {
        console.warn("[usePosition] Screen or window size not available yet");
        return;
      }

      const { width: screenWidth, height: screenHeight } = screen;
      const { width: winWidth, height: winHeight } = windowSize;

      let x: number;
      let y: number;

      // Calculate horizontal position
      if (preset.includes("left")) {
        x = padding;
      } else if (preset.includes("right")) {
        x = screenWidth - winWidth - padding;
      } else {
        x = (screenWidth - winWidth) / 2;
      }

      // Calculate vertical position
      if (preset.includes("top")) {
        y = padding;
      } else if (preset.includes("bottom")) {
        y = screenHeight - winHeight - padding;
      } else {
        y = (screenHeight - winHeight) / 2;
      }

      await setCustom(x, y);
    },
    [screen, windowSize, setCustom]
  );

  return {
    setPreset,
    setCustom,
    currentPosition,
    screen,
  };
}
