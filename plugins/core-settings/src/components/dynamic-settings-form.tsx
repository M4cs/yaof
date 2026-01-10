import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type {
  SettingField,
  SettingsSchema,
  MultiChoiceSettingField,
  OrderedListSettingField,
  CategorySettingField,
} from "@m4cs/yaof-sdk";
import { ShortcutRecorder } from "@m4cs/yaof-sdk";
import { OrderedListField } from "./ordered-field-list";
import { Button } from "@yaof/ui/components/ui/button";
import { Input } from "@yaof/ui/components/ui/input";
import { Label } from "@yaof/ui/components/ui/label";
import { Switch } from "@yaof/ui/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yaof/ui/components/ui/select";
import { Slider } from "@yaof/ui/components/ui/slider";
import { Checkbox } from "@yaof/ui/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@yaof/ui/components/ui/collapsible";
import { Separator } from "@yaof/ui/components/ui/separator";
import { Skeleton } from "@yaof/ui/components/ui/skeleton";
import { X, CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";

interface DynamicSettingsFormProps {
  pluginId: string;
  schema: SettingsSchema;
  onSave?: () => void;
}

/**
 * Dynamically renders a settings form based on a schema definition.
 * Reads/writes settings via Tauri commands for cross-plugin settings access.
 */
// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500;

export function DynamicSettingsForm({
  pluginId,
  schema,
  onSave,
}: DynamicSettingsFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Ref to track the debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track the latest values for debounced save
  const latestValuesRef = useRef<Record<string, unknown>>({});

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [pluginId, schema]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  async function loadSettings() {
    setIsLoading(true);
    try {
      const stored = await invoke<Record<string, unknown>>(
        "plugin:yaof|plugin_settings_get_all",
        { pluginId }
      );

      // Merge with defaults from schema
      const merged: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(schema)) {
        merged[key] = stored[key] ?? getDefaultValue(field);
      }
      latestValuesRef.current = merged;
      setValues(merged);
    } catch (error) {
      console.error("Failed to load settings:", error);
      // Fall back to defaults
      const defaults: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(schema)) {
        defaults[key] = getDefaultValue(field);
      }
      setValues(defaults);
    } finally {
      setIsLoading(false);
    }
  }

  function getDefaultValue(field: SettingField): unknown {
    switch (field.type) {
      case "string":
        return field.default ?? "";
      case "number":
        return field.default ?? 0;
      case "boolean":
        return field.default ?? false;
      case "select":
        return field.default ?? field.options?.[0]?.value ?? "";
      case "color":
        return field.default ?? "#000000";
      case "slider":
        return field.default ?? field.min ?? 0;
      case "keybind":
        return field.default ?? "";
      case "multiChoice":
        return field.default ?? [];
      case "orderedList":
        return field.default ?? [];
      case "category":
        // For categories, return an object with defaults for each nested field
        const categoryDefaults: Record<string, unknown> = {};
        for (const [key, nestedField] of Object.entries(field.fields)) {
          categoryDefaults[key] = getDefaultValue(nestedField);
        }
        return categoryDefaults;
      default:
        return undefined;
    }
  }

  // Debounced save function that saves and emits event
  const debouncedSave = useCallback(
    async (valuesToSave: Record<string, unknown>) => {
      setIsSaving(true);
      try {
        await invoke("plugin:yaof|plugin_settings_set_all", {
          pluginId,
          values: valuesToSave,
        });

        // Emit settings changed event for other plugins to pick up
        await emit(`yaof:settings:changed:${pluginId}`, {
          pluginId,
          values: valuesToSave,
        });

        setHasChanges(false);
        onSave?.();
      } catch (error) {
        console.error("Failed to save settings:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [pluginId, onSave]
  );

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const newValues = { ...latestValuesRef.current, [key]: value };
      latestValuesRef.current = newValues;
      setValues(newValues);
      setHasChanges(true);

      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer for auto-save
      debounceTimerRef.current = setTimeout(() => {
        debouncedSave(latestValuesRef.current);
      }, DEBOUNCE_DELAY);
    },
    [debouncedSave]
  );

  // Immediate save (for Save button - cancels debounce and saves immediately)
  async function handleSave() {
    // Cancel any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    setIsSaving(true);
    try {
      await invoke("plugin:yaof|plugin_settings_set_all", {
        pluginId,
        values,
      });

      // Emit settings changed event for other plugins to pick up
      await emit(`yaof:settings:changed:${pluginId}`, {
        pluginId,
        values,
      });

      setHasChanges(false);
      onSave?.();
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    // Cancel any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const defaults: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema)) {
      defaults[key] = getDefaultValue(field);
    }
    latestValuesRef.current = defaults;
    setValues(defaults);
    setHasChanges(true);

    // Trigger debounced save for reset values
    debounceTimerRef.current = setTimeout(() => {
      debouncedSave(latestValuesRef.current);
    }, DEBOUNCE_DELAY);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const schemaEntries = Object.entries(schema);

  if (schemaEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This plugin has no settings configured.
      </p>
    );
  }

  // Separate category fields from regular fields
  const regularFields = schemaEntries.filter(
    ([, field]) => field.type !== "category"
  );
  const categoryFields = schemaEntries.filter(
    ([, field]) => field.type === "category"
  );

  return (
    <div className="space-y-6">
      {/* Regular fields */}
      <div className="space-y-4">
        {regularFields.map(([key, field]) => (
          <SettingFieldRenderer
            key={key}
            fieldKey={key}
            field={field}
            value={values[key]}
            onChange={(value) => handleChange(key, value)}
          />
        ))}
      </div>

      {/* Category fields */}
      {categoryFields.map(([key, field]) => (
        <CategoryRenderer
          key={key}
          fieldKey={key}
          field={field as CategorySettingField}
          value={values[key] as Record<string, unknown>}
          onChange={(value) => handleChange(key, value)}
        />
      ))}

      <Separator />

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset} disabled={isSaving}>
          Reset to Defaults
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Individual Field Renderers
// ============================================

interface SettingFieldRendererProps {
  fieldKey: string;
  field: SettingField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function SettingFieldRenderer({
  fieldKey,
  field,
  value,
  onChange,
}: SettingFieldRendererProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <Label htmlFor={fieldKey} className="text-sm font-medium">
          {field.label}
        </Label>
        {field.description && (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        )}
      </div>
      {renderControl(fieldKey, field, value, onChange)}
    </div>
  );
}

function renderControl(
  fieldKey: string,
  field: SettingField,
  value: unknown,
  onChange: (value: unknown) => void
) {
  switch (field.type) {
    case "string":
      return (
        <Input
          id={fieldKey}
          type="text"
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          className="max-w-sm"
        />
      );

    case "number":
      return (
        <Input
          id={fieldKey}
          type="number"
          value={Number(value ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(Number(e.target.value))
          }
          className="max-w-32 font-mono"
        />
      );

    case "boolean":
      return (
        <Switch
          id={fieldKey}
          checked={Boolean(value)}
          onCheckedChange={(checked: boolean) => onChange(checked)}
        />
      );

    case "select":
      return (
        <Select
          value={String(value ?? "")}
          onValueChange={(val: string | null) => onChange(val)}
        >
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "color":
      return (
        <div className="flex items-center gap-3">
          <input
            id={fieldKey}
            type="color"
            value={String(value ?? "#000000")}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
          />
          <code className="text-sm font-mono text-muted-foreground">
            {String(value ?? "#000000")}
          </code>
        </div>
      );

    case "slider":
      return (
        <div className="flex items-center gap-4 max-w-sm">
          <Slider
            id={fieldKey}
            value={[Number(value ?? field.min ?? 0)]}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onValueChange={(vals: number | readonly number[]) =>
              onChange(Array.isArray(vals) ? vals[0] : vals)
            }
            className="flex-1"
          />
          <span className="text-sm font-mono text-muted-foreground min-w-10 text-right">
            {String(value)}
          </span>
        </div>
      );

    case "keybind":
      return (
        <ShortcutRecorder
          value={String(value ?? "")}
          onChange={(v) => onChange(v)}
          placeholder="Click to record shortcut"
        />
      );

    case "multiChoice":
      return (
        <MultiChoiceInput
          field={field}
          value={(value as string[]) ?? []}
          onChange={onChange}
        />
      );

    case "orderedList": {
      // Convert options array to enumObj format for OrderedListField
      const enumObj: Record<string, string> = {};
      for (const opt of field.options) {
        enumObj[opt.label] = opt.value;
      }
      return (
        <OrderedListField
          value={(value as string[]) ?? []}
          onChange={(newValue) => onChange(newValue)}
          enumObj={enumObj}
        />
      );
    }

    case "category":
      // Categories are rendered separately
      return null;

    default:
      return (
        <span className="text-sm text-muted-foreground italic">
          Unsupported field type
        </span>
      );
  }
}

// ============================================
// Keybind Input Component
// ============================================

interface KeybindInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

function KeybindInput({ id, value, onChange }: KeybindInputProps) {
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Cmd");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    // Add the actual key if it's not a modifier
    if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }

    if (
      parts.length > 0 &&
      !["Control", "Alt", "Shift", "Meta"].includes(e.key)
    ) {
      onChange(parts.join("+"));
      setIsRecording(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="text"
        value={value || "Not set"}
        readOnly
        onKeyDown={handleKeyDown}
        onFocus={() => setIsRecording(true)}
        onBlur={() => setIsRecording(false)}
        placeholder={isRecording ? "Press keys..." : "Click to record"}
        className={`max-w-48 font-mono text-center cursor-pointer ${
          isRecording ? "ring-2 ring-primary" : ""
        }`}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange("")}
          className="h-8 w-8"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

// ============================================
// Multi-Choice Input Component
// ============================================

interface MultiChoiceInputProps {
  field: MultiChoiceSettingField;
  value: string[];
  onChange: (value: string[]) => void;
}

function MultiChoiceInput({ field, value, onChange }: MultiChoiceInputProps) {
  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {field.options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Checkbox
            checked={value.includes(opt.value)}
            onCheckedChange={() => handleToggle(opt.value)}
          />
          <span className="text-sm">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

// ============================================
// Category Renderer Component
// ============================================

interface CategoryRendererProps {
  fieldKey: string;
  field: CategorySettingField;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}

function CategoryRenderer({
  fieldKey,
  field,
  value,
  onChange,
}: CategoryRendererProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleFieldChange = (nestedKey: string, nestedValue: unknown) => {
    onChange({
      ...value,
      [nestedKey]: nestedValue,
    });
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="rounded-lg border bg-card overflow-hidden">
        <CollapsibleTrigger>
          <button
            type="button"
            className="flex items-center gap-3 w-full px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            {isExpanded ? (
              <CaretDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <CaretRightIcon className="size-4 text-muted-foreground" />
            )}
            <span className="font-medium text-sm">{field.label}</span>
            {field.description && (
              <span className="text-xs text-muted-foreground ml-auto">
                {field.description}
              </span>
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4 space-y-4 border-t">
            {Object.entries(field.fields).map(([nestedKey, nestedField]) => (
              <SettingFieldRenderer
                key={`${fieldKey}.${nestedKey}`}
                fieldKey={`${fieldKey}.${nestedKey}`}
                field={nestedField}
                value={value?.[nestedKey]}
                onChange={(v) => handleFieldChange(nestedKey, v)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
