import { z } from "zod";
import type { SettingsSchema, SettingField } from "./settings";

type PluginOverlay = {
  width: number;
  height: number;
  /** Optional X position. If not set, will be calculated from defaultPosition. */
  x?: number;
  /** Optional Y position. If not set, will be calculated from defaultPosition. */
  y?: number;
  defaultPosition:
    | "top-left"
    | "top-center"
    | "top-right"
    | "center-left"
    | "center"
    | "center-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  clickThrough?: boolean;
  frameless?: boolean;
  /**
   * Optional route path for this overlay (used with HashRouter).
   * Defaults to "/" if not specified. Allows multiple overlays from the same
   * plugin to render different components based on the route.
   * @example "/settings", "/mini", "/dashboard"
   */
  route?: string;
};

type PluginProvider<T extends z.ZodType> = {
  id: string;
  schema: T;
};

/**
 * Plugin settings configuration in manifest
 */
export type PluginSettingsConfig = {
  /** Settings schema - map of field name to field definition */
  schema?: SettingsSchema;
  /** Optional path to custom settings component (relative to plugin root) */
  component?: string;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  entry: string;
  /** Whether this is a core plugin bundled with the app */
  core?: boolean;
  overlays: Record<string, PluginOverlay>;
  provides: Array<PluginProvider<z.ZodType>>;
  consumes: string[];
  permissions: string[];
  /** Plugin settings configuration */
  settings?: PluginSettingsConfig;
};
