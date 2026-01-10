import { Command } from "commander";
import * as fs from "fs-extra";
import * as path from "path";
import pc from "picocolors";

interface SettingField {
  type: string;
  label: string;
  description: string;
  default?: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  fields?: Record<string, SettingField>;
}

type SettingsSchema = Record<string, SettingField>;

/**
 * Convert camelCase to Title Case with spaces
 * e.g., "clockFormat" -> "Clock Format"
 * Handles consecutive capitals like "CPU" -> "CPU" (not "C P U")
 */
function camelToTitleCase(str: unknown): string {
  if (typeof str !== "string") {
    return String(str);
  }
  // Handle consecutive capitals (like CPU, API, etc.) by not splitting them
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space between lowercase and uppercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // Handle consecutive caps followed by lowercase
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Check if this is a Zod v4 schema (has _zod property with traits)
 */
function isZodV4(schema: any): boolean {
  return schema?._zod?.traits instanceof Set;
}

/**
 * Get the Zod type from a schema (supports both v3 and v4)
 */
function getZodType(schema: any): string {
  if (!schema) return "unknown";

  // Zod v4: check _zod.def.type or _def.type
  if (isZodV4(schema)) {
    const def = schema._zod?.def || schema._def;
    return def?.type || "unknown";
  }

  // Zod v3: check _def.typeName
  const def = schema._def;
  if (def?.typeName) {
    // Convert ZodString -> string, ZodNumber -> number, etc.
    return def.typeName.replace("Zod", "").toLowerCase();
  }

  return "unknown";
}

/**
 * Check if schema has a specific Zod trait (v4)
 */
function hasZodTrait(schema: any, trait: string): boolean {
  return schema?._zod?.traits?.has(trait) ?? false;
}

/**
 * Get the inner type from a wrapped Zod type (default, optional, etc.)
 */
function unwrapZodType(schema: any): any {
  if (!schema) return schema;

  const type = getZodType(schema);

  // Handle wrapped types
  if (type === "default" || type === "optional" || type === "nullable") {
    // Zod v4: inner type is in _zod.def.innerType or schema.innerType
    const innerType =
      schema._zod?.def?.innerType || schema._def?.innerType || schema.innerType;
    return unwrapZodType(innerType);
  }

  return schema;
}

/**
 * Get the default value from a Zod schema
 */
function getDefaultValue(schema: any): unknown {
  if (!schema) return undefined;

  const type = getZodType(schema);

  if (type === "default") {
    // Zod v4: default value is in _zod.def.defaultValue or _def.defaultValue
    const defaultValue =
      schema._zod?.def?.defaultValue ?? schema._def?.defaultValue;
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  }

  if (type === "optional" || type === "nullable") {
    const innerType =
      schema._zod?.def?.innerType || schema._def?.innerType || schema.innerType;
    return getDefaultValue(innerType);
  }

  return undefined;
}

/**
 * Extract enum values from a ZodEnum
 */
function getEnumValues(schema: any): string[] {
  const unwrapped = unwrapZodType(schema);
  if (!unwrapped) return [];

  const def = unwrapped._zod?.def || unwrapped._def;

  // Zod v4: For native enums, entries has bidirectional mapping
  // e.g., { "0": "ActiveWindow", "ActiveWindow": 0, ... }
  // We want the string keys that map to numbers (the enum names)
  if (def?.entries && typeof def.entries === "object") {
    const entries = def.entries;
    const stringKeys = Object.keys(entries).filter((key) => {
      // Keep keys that are not numeric AND whose value is a number
      // This gives us the enum names (e.g., "ActiveWindow" -> 0)
      return isNaN(Number(key)) && typeof entries[key] === "number";
    });

    // If we found string keys mapping to numbers, this is a native enum
    if (stringKeys.length > 0) {
      return stringKeys;
    }

    // Otherwise, it's a string enum like { "HH:MM": "HH:MM", ... }
    // Filter out numeric keys
    return Object.keys(entries).filter((key) => isNaN(Number(key)));
  }

  // Zod v4: options is directly on the schema object as an array
  // Filter out numeric values (which are indices in native enums)
  if (Array.isArray(unwrapped.options)) {
    return unwrapped.options.filter(
      (v: unknown): v is string => typeof v === "string"
    );
  }

  // Zod v4: values can be a Set in _zod.values
  if (unwrapped._zod?.values instanceof Set) {
    return Array.from(unwrapped._zod.values).filter(
      (v): v is string => typeof v === "string"
    );
  }

  if (def?.values) {
    // Handle both array and object (native enum)
    if (Array.isArray(def.values)) {
      return def.values.filter(
        (v: unknown): v is string => typeof v === "string"
      );
    }
    // Native enum - filter out reverse mappings
    return Object.keys(def.values).filter((key) => isNaN(Number(key)));
  }

  return [];
}

/**
 * Get min/max constraints from a ZodNumber
 */
function getNumberConstraints(schema: any): {
  min?: number;
  max?: number;
  step?: number;
} {
  const unwrapped = unwrapZodType(schema);
  if (!unwrapped) return {};

  const def = unwrapped._zod?.def || unwrapped._def;
  const constraints: { min?: number; max?: number; step?: number } = {};

  // Zod v4: checks are in def.checks array
  if (def?.checks) {
    for (const check of def.checks) {
      if (check.kind === "min") {
        constraints.min = check.value;
      } else if (check.kind === "max") {
        constraints.max = check.value;
      }
    }
  }

  // Also check for minimum/maximum properties directly
  if (def?.minimum !== undefined) constraints.min = def.minimum;
  if (def?.maximum !== undefined) constraints.max = def.maximum;

  return constraints;
}

/**
 * Get the element type of a ZodArray
 */
function getArrayElementSchema(schema: any): any {
  const unwrapped = unwrapZodType(schema);
  if (!unwrapped) return null;

  const def = unwrapped._zod?.def || unwrapped._def;

  // Zod v4: element type is in def.element
  return def?.element || def?.type;
}

/**
 * Get the shape of a ZodObject
 */
function getObjectShape(schema: any): Record<string, any> | null {
  const unwrapped = unwrapZodType(schema);
  if (!unwrapped) return null;

  // Zod v4: shape is a getter on the schema or in _zod.def.shape
  if (typeof unwrapped.shape === "object" && unwrapped.shape !== null) {
    return unwrapped.shape;
  }

  const def = unwrapped._zod?.def || unwrapped._def;

  if (typeof def?.shape === "function") {
    return def.shape();
  }

  if (typeof def?.shape === "object") {
    return def.shape;
  }

  return null;
}

/**
 * Convert a Zod schema field to a settings field definition
 */
function zodFieldToSettingField(
  key: string,
  schema: any,
  warnings: string[]
): SettingField | null {
  const unwrapped = unwrapZodType(schema);
  const type = getZodType(unwrapped);
  const defaultValue = getDefaultValue(schema);
  const label = camelToTitleCase(key);

  switch (type) {
    case "boolean":
      return {
        type: "boolean",
        label,
        description: "",
        default: defaultValue ?? false,
      };

    case "string":
      return {
        type: "string",
        label,
        description: "",
        default: defaultValue ?? "",
      };

    case "number": {
      const constraints = getNumberConstraints(schema);

      // If has both min and max, use slider
      if (constraints.min !== undefined && constraints.max !== undefined) {
        return {
          type: "slider",
          label,
          description: "",
          min: constraints.min,
          max: constraints.max,
          step: 1,
          default: defaultValue ?? constraints.min,
        };
      }

      // Otherwise use number input
      return {
        type: "number",
        label,
        description: "",
        min: constraints.min,
        max: constraints.max,
        default: defaultValue ?? 0,
      };
    }

    case "enum": {
      const values = getEnumValues(schema);
      return {
        type: "select",
        label,
        description: "",
        options: values.map((v) => ({ value: v, label: v })),
        default: defaultValue ?? values[0],
      };
    }

    case "array": {
      const elementSchema = getArrayElementSchema(schema);
      if (!elementSchema) {
        warnings.push(
          `Skipping "${key}": Could not determine array element type`
        );
        return null;
      }

      const elementType = getZodType(unwrapZodType(elementSchema));

      // Array of enum -> orderedList (for reorderable lists)
      if (elementType === "enum") {
        const values = getEnumValues(elementSchema);

        // Convert numeric default values to string enum key names
        let convertedDefault: string[] = [];
        const rawDefault = defaultValue as (string | number)[] | undefined;
        if (rawDefault && Array.isArray(rawDefault)) {
          convertedDefault = rawDefault.map((val) => {
            if (typeof val === "number") {
              // Numeric value - look up the enum key name by index
              return values[val] ?? String(val);
            }
            // Already a string - use as-is
            return val;
          });
        }

        return {
          type: "orderedList",
          label,
          description: "",
          options: values.map((v) => ({
            value: v,
            label: camelToTitleCase(v),
          })),
          default: convertedDefault,
        };
      }

      // Array of primitives -> multiChoice
      if (
        elementType === "string" ||
        elementType === "number" ||
        elementType === "boolean"
      ) {
        warnings.push(
          `Warning: "${key}" is an array of ${elementType}s without enum options. Consider using z.enum() for the array element type to auto-generate options.`
        );
        return {
          type: "multiChoice",
          label,
          description: "",
          options: [],
          default: (defaultValue as string[]) ?? [],
        };
      }

      // Array of objects -> skip with warning
      if (elementType === "object") {
        warnings.push(
          `Skipping "${key}": Arrays of objects are not supported in settings UI`
        );
        return null;
      }

      warnings.push(
        `Skipping "${key}": Unsupported array element type "${elementType}"`
      );
      return null;
    }

    case "object": {
      // Nested object -> category
      const shape = getObjectShape(schema);
      if (!shape) {
        warnings.push(`Skipping "${key}": Could not read object shape`);
        return null;
      }

      const fields: Record<string, SettingField> = {};
      for (const [fieldKey, fieldSchema] of Object.entries(shape)) {
        const field = zodFieldToSettingField(fieldKey, fieldSchema, warnings);
        if (field) {
          fields[fieldKey] = field;
        }
      }

      if (Object.keys(fields).length === 0) {
        warnings.push(`Skipping "${key}": Object has no supported fields`);
        return null;
      }

      return {
        type: "category",
        label,
        description: "",
        fields,
      };
    }

    default:
      warnings.push(`Skipping "${key}": Unsupported Zod type "${type}"`);
      return null;
  }
}

/**
 * Convert a Zod object schema to a settings schema
 */
function zodSchemaToSettingsSchema(
  zodSchema: any,
  warnings: string[]
): SettingsSchema {
  const type = getZodType(zodSchema);

  if (type !== "object" && !hasZodTrait(zodSchema, "ZodObject")) {
    throw new Error(
      `Config must export a Zod object schema (z.object({...})). Got type: ${type}`
    );
  }

  const shape = getObjectShape(zodSchema);
  if (!shape) {
    throw new Error("Could not read schema shape");
  }

  const schema: SettingsSchema = {};

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const field = zodFieldToSettingField(key, fieldSchema, warnings);
    if (field) {
      schema[key] = field;
    }
  }

  return schema;
}

/**
 * Find and extract the Zod schema from a module's exports
 */
function findZodSchema(moduleExports: any): any {
  // Look for common export names
  const schemaNames = [
    "schema",
    "configSchema",
    "config",
    "settingsSchema",
    "settings",
  ];

  // First, try exact matches (case-insensitive)
  for (const name of schemaNames) {
    for (const [key, value] of Object.entries(moduleExports)) {
      if (key.toLowerCase() === name && isZodSchema(value)) {
        return value;
      }
    }
  }

  // Then, try to find any export ending with "Schema" or "Config"
  for (const [key, value] of Object.entries(moduleExports)) {
    if (
      (key.endsWith("Schema") || key.endsWith("Config")) &&
      isZodSchema(value)
    ) {
      return value;
    }
  }

  // Finally, try to find any Zod object schema
  for (const value of Object.values(moduleExports)) {
    if (isZodSchema(value)) {
      return value;
    }
  }

  return null;
}

/**
 * Check if a value is a Zod schema (supports both v3 and v4)
 */
function isZodSchema(value: any): boolean {
  if (!value || typeof value !== "object") return false;

  // Zod v4: has _zod property with traits
  if (value._zod?.traits instanceof Set) {
    return true;
  }

  // Zod v3: has _def with typeName
  if (value._def?.typeName?.startsWith("Zod")) {
    return true;
  }

  return false;
}

export const generateCommand = new Command("generate")
  .description("Generate settings schema from a Zod config file")
  .requiredOption("-c, --config <path>", "Path to the Zod config file (.ts)")
  .option(
    "-o, --overlay <path>",
    "Path to overlay.json to update (if not provided, outputs to stdout)"
  )
  .option(
    "-e, --export <name>",
    "Name of the exported schema (auto-detected if not provided)"
  )
  .action(async (options) => {
    const configPath = path.resolve(process.cwd(), options.config);
    const overlayPath = options.overlay
      ? path.resolve(process.cwd(), options.overlay)
      : null;

    // Check if config file exists
    if (!(await fs.pathExists(configPath))) {
      console.error(pc.red(`Error: Config file not found: ${configPath}`));
      process.exit(1);
    }

    // Check if overlay file exists (if provided)
    if (overlayPath && !(await fs.pathExists(overlayPath))) {
      console.error(pc.red(`Error: Overlay file not found: ${overlayPath}`));
      process.exit(1);
    }

    try {
      console.log(pc.blue(`Loading config from: ${configPath}`));

      // Dynamically import the config file using Bun's native TS support
      const configModule = await import(configPath);

      // Find the Zod schema
      let zodSchema: any;
      if (options.export) {
        zodSchema = configModule[options.export];
        if (!zodSchema) {
          console.error(
            pc.red(`Error: Export "${options.export}" not found in config file`)
          );
          process.exit(1);
        }
      } else {
        zodSchema = findZodSchema(configModule);
        if (!zodSchema) {
          console.error(
            pc.red(
              "Error: Could not find a Zod schema in the config file. " +
                "Make sure you export a z.object() schema, or use --export to specify the export name."
            )
          );
          process.exit(1);
        }
      }

      // Convert to settings schema
      const warnings: string[] = [];
      const settingsSchema = zodSchemaToSettingsSchema(zodSchema, warnings);

      // Print warnings
      if (warnings.length > 0) {
        console.log(pc.yellow("\nWarnings:"));
        for (const warning of warnings) {
          console.log(pc.yellow(`  • ${warning}`));
        }
        console.log();
      }

      // Output or update
      if (overlayPath) {
        // Update overlay.json
        const overlay = await fs.readJson(overlayPath);
        overlay.settings = overlay.settings || {};
        overlay.settings.schema = settingsSchema;
        await fs.writeJson(overlayPath, overlay, { spaces: 2 });
        console.log(pc.green(`✓ Updated settings schema in: ${overlayPath}`));
      } else {
        // Output to stdout
        console.log(pc.green("\nGenerated settings schema:\n"));
        console.log(JSON.stringify(settingsSchema, null, 2));
      }

      // Summary
      const fieldCount = Object.keys(settingsSchema).length;
      console.log(pc.blue(`\n✓ Generated ${fieldCount} setting field(s)`));
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
  });
