import React, { type ReactNode } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

// Re-export shortcut components
export {
  ShortcutRecorder,
  ShortcutDisplay,
  parseAccelerator,
  type ShortcutRecorderProps,
  type ShortcutDisplayProps,
} from "./ShortcutRecorder";

// ============================================
// Form Context for field components
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = any;

interface SettingsFormContextValue {
  form: AnyForm;
}

const SettingsFormContext =
  React.createContext<SettingsFormContextValue | null>(null);

function useSettingsFormContext(): SettingsFormContextValue {
  const ctx = React.useContext(SettingsFormContext);
  if (!ctx) throw new Error("Field must be used inside SettingsForm");
  return ctx;
}

// ============================================
// SettingsForm - Main form wrapper
// ============================================

export interface SettingsFormProps<TValues extends Record<string, unknown>> {
  schema: z.ZodType<TValues>;
  defaultValues: TValues;
  onSubmit: (values: TValues) => void | Promise<void>;
  onChange?: (values: TValues) => void;
  children: ReactNode;
}

export function SettingsForm<TValues extends Record<string, unknown>>({
  schema,
  defaultValues,
  onSubmit,
  onChange,
  children,
}: SettingsFormProps<TValues>) {
  const form = useForm({
    defaultValues,
    validators: {
      // Cast to any to work around Zod v4 Standard Schema type incompatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange: schema as any,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  // Notify on changes
  React.useEffect(() => {
    if (onChange) {
      const unsubscribe = form.store.subscribe(() => {
        onChange(form.state.values);
      });
      return unsubscribe;
    }
  }, [form, onChange]);

  return (
    <SettingsFormContext.Provider value={{ form }}>
      <form
        className="yaof-settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {children}
      </form>
    </SettingsFormContext.Provider>
  );
}

// ============================================
// SettingsSection
// ============================================

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <fieldset className="yaof-settings-section">
      <legend className="yaof-settings-section-title">{title}</legend>
      {description && (
        <p className="yaof-settings-section-desc">{description}</p>
      )}
      <div className="yaof-settings-section-content">{children}</div>
    </fieldset>
  );
}

// ============================================
// Field wrapper with error handling
// ============================================

interface FieldWrapperProps {
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
}

function FieldWrapper({
  label,
  description,
  error,
  children,
}: FieldWrapperProps) {
  return (
    <div className={`yaof-field ${error ? "yaof-field-error" : ""}`}>
      <label className="yaof-field-label">
        {label}
        {description && <span className="yaof-field-desc">{description}</span>}
      </label>
      <div className="yaof-field-control">{children}</div>
      {error && <span className="yaof-field-error-msg">{error}</span>}
    </div>
  );
}

// Helper to extract error message from field errors
function getFieldError(
  errors: Array<string | { message?: string }> | undefined
): string | undefined {
  if (!errors || errors.length === 0) return undefined;
  const firstError = errors[0];
  if (typeof firstError === "string") return firstError;
  if (firstError && typeof firstError === "object" && "message" in firstError) {
    return firstError.message;
  }
  return String(firstError);
}

// Field state type for render props
interface FieldRenderProps {
  state: {
    value: unknown;
    meta: { errors?: Array<string | { message?: string }> };
  };
  handleChange: (value: unknown) => void;
  handleBlur: () => void;
}

// ============================================
// SettingsToggle
// ============================================

export interface SettingsToggleProps {
  name: string;
  label: string;
  description?: string;
}

export function SettingsToggle({
  name,
  label,
  description,
}: SettingsToggleProps) {
  const { form } = useSettingsFormContext();

  return (
    <form.Field name={name}>
      {(field: FieldRenderProps) => (
        <FieldWrapper
          label={label}
          description={description}
          error={getFieldError(field.state.meta.errors)}
        >
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(field.state.value)}
            className={`yaof-toggle ${
              field.state.value ? "yaof-toggle-on" : ""
            }`}
            onClick={() => field.handleChange(!field.state.value)}
          >
            <span className="yaof-toggle-thumb" />
          </button>
        </FieldWrapper>
      )}
    </form.Field>
  );
}

// ============================================
// SettingsSelect
// ============================================

export interface SettingsSelectProps {
  name: string;
  label: string;
  description?: string;
  options: { value: string; label: string }[];
}

export function SettingsSelect({
  name,
  label,
  description,
  options,
}: SettingsSelectProps) {
  const { form } = useSettingsFormContext();

  return (
    <form.Field name={name}>
      {(field: FieldRenderProps) => (
        <FieldWrapper
          label={label}
          description={description}
          error={getFieldError(field.state.meta.errors)}
        >
          <select
            className="yaof-select"
            value={String(field.state.value ?? "")}
            onChange={(e) => field.handleChange(e.currentTarget.value)}
            onBlur={field.handleBlur}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldWrapper>
      )}
    </form.Field>
  );
}

// ============================================
// SettingsInput
// ============================================

export interface SettingsInputProps {
  name: string;
  label: string;
  description?: string;
  type?: "text" | "number";
  placeholder?: string;
}

export function SettingsInput({
  name,
  label,
  description,
  type = "text",
  placeholder,
}: SettingsInputProps) {
  const { form } = useSettingsFormContext();

  return (
    <form.Field name={name}>
      {(field: FieldRenderProps) => (
        <FieldWrapper
          label={label}
          description={description}
          error={getFieldError(field.state.meta.errors)}
        >
          <input
            type={type}
            className="yaof-input"
            value={field.state.value != null ? String(field.state.value) : ""}
            placeholder={placeholder}
            onChange={(e) => {
              const v =
                type === "number"
                  ? Number(e.currentTarget.value)
                  : e.currentTarget.value;
              field.handleChange(v);
            }}
            onBlur={field.handleBlur}
          />
        </FieldWrapper>
      )}
    </form.Field>
  );
}

// ============================================
// SettingsSlider
// ============================================

export interface SettingsSliderProps {
  name: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step?: number;
}

export function SettingsSlider({
  name,
  label,
  description,
  min,
  max,
  step = 1,
}: SettingsSliderProps) {
  const { form } = useSettingsFormContext();

  return (
    <form.Field name={name}>
      {(field: FieldRenderProps) => (
        <FieldWrapper
          label={label}
          description={description}
          error={getFieldError(field.state.meta.errors)}
        >
          <div className="yaof-slider-wrap">
            <input
              type="range"
              className="yaof-slider"
              value={Number(field.state.value ?? min)}
              min={min}
              max={max}
              step={step}
              onChange={(e) =>
                field.handleChange(Number(e.currentTarget.value))
              }
            />
            <span className="yaof-slider-value">
              {String(field.state.value)}
            </span>
          </div>
        </FieldWrapper>
      )}
    </form.Field>
  );
}

// ============================================
// SettingsColor
// ============================================

export interface SettingsColorProps {
  name: string;
  label: string;
  description?: string;
}

export function SettingsColor({
  name,
  label,
  description,
}: SettingsColorProps) {
  const { form } = useSettingsFormContext();

  return (
    <form.Field name={name}>
      {(field: FieldRenderProps) => (
        <FieldWrapper
          label={label}
          description={description}
          error={getFieldError(field.state.meta.errors)}
        >
          <input
            type="color"
            className="yaof-color"
            value={String(field.state.value ?? "#000000")}
            onChange={(e) => field.handleChange(e.currentTarget.value)}
          />
        </FieldWrapper>
      )}
    </form.Field>
  );
}

// ============================================
// SettingsSubmit
// ============================================

interface FormState {
  canSubmit: boolean;
  isSubmitting: boolean;
}

export function SettingsSubmit({
  children = "Save",
}: {
  children?: ReactNode;
}) {
  const { form } = useSettingsFormContext();

  return (
    <form.Subscribe
      selector={(state: FormState) => [state.canSubmit, state.isSubmitting]}
    >
      {([canSubmit, isSubmitting]: [boolean, boolean]) => (
        <button
          type="submit"
          disabled={!canSubmit}
          className="yaof-btn yaof-btn-primary"
        >
          {isSubmitting ? "Saving..." : children}
        </button>
      )}
    </form.Subscribe>
  );
}
