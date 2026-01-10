import { z } from "zod";

export type SettingType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "slider"
  | "keybind"
  | "multiChoice"
  | "orderedList"
  | "category";

export interface BaseSettingField {
  type: SettingType;
  label: string;
  description?: string;
  default?: unknown;
}

export interface StringSettingField extends BaseSettingField {
  type: "string";
  default?: string;
  placeholder?: string;
}

export interface NumberSettingField extends BaseSettingField {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanSettingField extends BaseSettingField {
  type: "boolean";
  default?: boolean;
}

export interface SelectSettingField extends BaseSettingField {
  type: "select";
  options: { value: string; label: string }[];
  default?: string;
}

export interface ColorSettingField extends BaseSettingField {
  type: "color";
  default?: string;
}

export interface SliderSettingField extends BaseSettingField {
  type: "slider";
  min: number;
  max: number;
  step?: number;
  default?: number;
}

export interface KeybindSettingField extends BaseSettingField {
  type: "keybind";
  default?: string;
  /**
   * Unique identifier for this shortcut.
   * Used when registering the shortcut with the global shortcut manager.
   * If not provided, the setting key will be used.
   */
  shortcutId?: string;
  /**
   * Whether this shortcut should be registered globally.
   * If true, the shortcut will be active even when the app is not focused.
   * Defaults to true.
   */
  global?: boolean;
}

export interface MultiChoiceSettingField extends BaseSettingField {
  type: "multiChoice";
  options: { value: string; label: string }[];
  default?: string[];
}

export interface OrderedListSettingField extends BaseSettingField {
  type: "orderedList";
  options: { value: string; label: string }[];
  default?: string[];
}

export interface CategorySettingField extends BaseSettingField {
  type: "category";
  fields: Record<string, SettingField>;
}

export type SettingField =
  | StringSettingField
  | NumberSettingField
  | BooleanSettingField
  | SelectSettingField
  | ColorSettingField
  | SliderSettingField
  | KeybindSettingField
  | MultiChoiceSettingField
  | OrderedListSettingField
  | CategorySettingField;

// Settings schema (field name -> field definition)
export type SettingsSchema = Record<string, SettingField>;

// Settings values (field name -> value)
export type SettingsValues<T extends SettingsSchema> = {
  [K in keyof T]: T[K] extends { default: infer D } ? D : unknown;
};
