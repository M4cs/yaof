import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Get the current route from the URL hash
 * @returns The current route path (e.g., "/", "/settings")
 */
export function useOverlayRoute(): string {
  const [route, setRoute] = useState(() => {
    // Get initial route from hash, default to "/"
    const hash = window.location.hash;
    return hash ? hash.slice(1) : "/";
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setRoute(hash ? hash.slice(1) : "/");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}

/**
 * Get the overlay ID from the current Tauri window label
 * The window label follows the format: "{pluginId}-{overlayId}"
 *
 * @returns Object containing pluginId, overlayId, and the full window label
 */
export function useOverlayId(): {
  /** The full window label (e.g., "topbar-main") */
  windowLabel: string | null;
  /** The plugin ID extracted from the window label */
  pluginId: string | null;
  /** The overlay ID extracted from the window label */
  overlayId: string | null;
} {
  const [ids, setIds] = useState<{
    windowLabel: string | null;
    pluginId: string | null;
    overlayId: string | null;
  }>({
    windowLabel: null,
    pluginId: null,
    overlayId: null,
  });

  useEffect(() => {
    const window = getCurrentWindow();
    const label = window.label;

    // Parse the label to extract pluginId and overlayId
    // Format: "{pluginId}-{overlayId}"
    const lastDashIndex = label.lastIndexOf("-");
    if (lastDashIndex > 0) {
      setIds({
        windowLabel: label,
        pluginId: label.substring(0, lastDashIndex),
        overlayId: label.substring(lastDashIndex + 1),
      });
    } else {
      // Fallback if no dash found
      setIds({
        windowLabel: label,
        pluginId: label,
        overlayId: null,
      });
    }
  }, []);

  return ids;
}

/**
 * Navigate to a different route within the same overlay window
 * This is useful for single-page navigation within an overlay
 *
 * @returns A function to navigate to a new route
 */
export function useOverlayNavigate(): (route: string) => void {
  return useCallback((route: string) => {
    // Ensure route starts with /
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    window.location.hash = normalizedRoute;
  }, []);
}

/**
 * Parse route parameters from the current hash route
 * Supports patterns like "/user/:id" matching "/user/123"
 *
 * @param pattern - The route pattern with parameters (e.g., "/user/:id")
 * @returns Object with matched parameters, or null if pattern doesn't match
 */
export function useRouteParams(pattern: string): Record<string, string> | null {
  const route = useOverlayRoute();

  // Convert pattern to regex
  const paramNames: string[] = [];
  const regexPattern = pattern.replace(/:([^/]+)/g, (_, paramName) => {
    paramNames.push(paramName);
    return "([^/]+)";
  });

  const regex = new RegExp(`^${regexPattern}$`);
  const match = route.match(regex);

  if (!match) {
    return null;
  }

  // Build params object
  const params: Record<string, string> = {};
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1] ?? "";
  });

  return params;
}
