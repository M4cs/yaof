import { HashRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Configuration for a single route in the YaofRouter
 */
export type RouteConfig = {
  /** The path for this route (e.g., "/", "/settings", "/mini") */
  path: string;
  /** The React element to render for this route */
  element: ReactNode;
};

/**
 * Props for the YaofRouter component
 */
export type YaofRouterProps = {
  /** Array of route configurations */
  routes: RouteConfig[];
  /** Optional fallback element for unmatched routes */
  fallback?: ReactNode;
  /** Optional children to render alongside routes (e.g., layout components) */
  children?: ReactNode;
};

/**
 * YaofRouter - A HashRouter-based router for YAOF plugins
 *
 * This component wraps react-router-dom's HashRouter to provide client-side
 * routing for plugins with multiple overlays. Each overlay can specify a
 * `route` in its manifest, and this router will render the appropriate
 * component based on the URL hash.
 *
 * @example
 * ```tsx
 * // In your plugin's main.tsx or App.tsx
 * import { YaofRouter } from '@m4cs/yaof-sdk';
 *
 * function App() {
 *   return (
 *     <YaofRouter
 *       routes={[
 *         { path: '/', element: <MainOverlay /> },
 *         { path: '/settings', element: <SettingsPanel /> },
 *         { path: '/mini', element: <MiniPlayer /> },
 *       ]}
 *       fallback={<div>Route not found</div>}
 *     />
 *   );
 * }
 * ```
 *
 * @example
 * ```json
 * // In your overlay.json manifest
 * {
 *   "overlays": {
 *     "main": { "route": "/", "width": 800, "height": 600 },
 *     "settings": { "route": "/settings", "width": 400, "height": 500 },
 *     "mini": { "route": "/mini", "width": 300, "height": 100 }
 *   }
 * }
 * ```
 */
export function YaofRouter({
  routes,
  fallback,
  children,
}: YaofRouterProps): ReactNode {
  return (
    <HashRouter>
      {children}
      <Routes>
        {routes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
        {fallback && <Route path="*" element={fallback} />}
      </Routes>
    </HashRouter>
  );
}

/**
 * Re-export useful react-router-dom hooks and components for convenience
 */
export {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Link,
  NavLink,
  Navigate,
  Outlet,
} from "react-router-dom";
