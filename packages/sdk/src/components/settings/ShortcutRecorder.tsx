import { useState, useCallback, useRef, useEffect } from "react";

/** Props for the ShortcutRecorder component */
export interface ShortcutRecorderProps {
  /** Current shortcut value (e.g., "CommandOrControl+Shift+T") */
  value: string;
  /** Callback when shortcut changes */
  onChange: (value: string) => void;
  /** Placeholder text when no shortcut is set */
  placeholder?: string;
  /** Whether the recorder is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Error message to display */
  error?: string | null;
  /** Whether to show the clear button */
  showClear?: boolean;
}

/** Modifier key mappings */
const MODIFIER_KEYS = {
  Control: "Ctrl",
  Meta: "Cmd",
  Alt: "Alt",
  Shift: "Shift",
} as const;

/** Keys to ignore when recording */
const IGNORED_KEYS = new Set([
  "Control",
  "Meta",
  "Alt",
  "Shift",
  "CapsLock",
  "Tab",
  "Escape",
]);

/**
 * Parse an accelerator string into display parts
 */
export function parseAccelerator(accelerator: string): string[] {
  if (!accelerator) return [];

  return accelerator.split("+").map((part) => {
    // Handle special cases
    if (part === "CommandOrControl") {
      return navigator.platform.includes("Mac") ? "⌘" : "Ctrl";
    }
    if (part === "Cmd" || part === "Command") return "⌘";
    if (part === "Ctrl" || part === "Control") return "Ctrl";
    if (part === "Alt" || part === "Option")
      return navigator.platform.includes("Mac") ? "⌥" : "Alt";
    if (part === "Shift")
      return navigator.platform.includes("Mac") ? "⇧" : "Shift";
    if (part === "Space") return "Space";
    if (part === "Enter") return "↵";
    if (part === "Backspace") return "⌫";
    if (part === "Delete") return "Del";
    if (part === "Escape") return "Esc";
    if (part === "ArrowUp") return "↑";
    if (part === "ArrowDown") return "↓";
    if (part === "ArrowLeft") return "←";
    if (part === "ArrowRight") return "→";

    // Single character keys
    if (part.length === 1) return part.toUpperCase();

    // Function keys
    if (part.match(/^F\d+$/)) return part;

    return part;
  });
}

/**
 * Convert a keyboard event to an accelerator string
 */
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  // Add modifiers in consistent order
  if (e.metaKey || e.ctrlKey) {
    parts.push("CommandOrControl");
  }
  if (e.altKey) {
    parts.push("Alt");
  }
  if (e.shiftKey) {
    parts.push("Shift");
  }

  // Get the actual key
  let key = e.key;

  // Skip if only modifiers are pressed
  if (IGNORED_KEYS.has(key)) {
    return null;
  }

  // Normalize key names
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toUpperCase();

  parts.push(key);

  // Require at least one modifier for most keys
  if (parts.length === 1 && !key.match(/^F\d+$/)) {
    return null;
  }

  return parts.join("+");
}

/**
 * A component for recording keyboard shortcuts.
 * Click to start recording, then press the desired key combination.
 */
export function ShortcutRecorder({
  value,
  onChange,
  placeholder = "Click to record shortcut",
  disabled = false,
  className = "",
  error,
  showClear = true,
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLDivElement>(null);

  // Handle key down during recording
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      const accelerator = eventToAccelerator(e);
      if (accelerator) {
        onChange(accelerator);
        setIsRecording(false);
        setPendingKeys([]);
      } else {
        // Show pending modifiers
        const pending: string[] = [];
        if (e.metaKey || e.ctrlKey)
          pending.push(navigator.platform.includes("Mac") ? "⌘" : "Ctrl");
        if (e.altKey)
          pending.push(navigator.platform.includes("Mac") ? "⌥" : "Alt");
        if (e.shiftKey)
          pending.push(navigator.platform.includes("Mac") ? "⇧" : "Shift");
        setPendingKeys(pending);
      }
    },
    [isRecording, onChange]
  );

  // Handle key up during recording
  const handleKeyUp = useCallback(() => {
    if (isRecording) {
      setPendingKeys([]);
    }
  }, [isRecording]);

  // Handle click outside to cancel recording
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        isRecording &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsRecording(false);
        setPendingKeys([]);
      }
    },
    [isRecording]
  );

  // Handle escape to cancel recording
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (isRecording && e.key === "Escape") {
        e.preventDefault();
        setIsRecording(false);
        setPendingKeys([]);
      }
    },
    [isRecording]
  );

  // Set up event listeners
  useEffect(() => {
    if (isRecording) {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleEscape);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("keydown", handleEscape);
      };
    }
  }, [
    isRecording,
    handleKeyDown,
    handleKeyUp,
    handleClickOutside,
    handleEscape,
  ]);

  const handleClick = () => {
    if (!disabled) {
      setIsRecording(true);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsRecording(false);
    setPendingKeys([]);
  };

  const displayParts = isRecording
    ? pendingKeys.length > 0
      ? pendingKeys
      : []
    : parseAccelerator(value);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div
        ref={inputRef}
        onClick={handleClick}
        className={`
          inline-flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer
          transition-all duration-150 min-w-[200px] max-w-sm
          ${
            disabled
              ? "opacity-50 cursor-not-allowed bg-muted"
              : "hover:border-primary/50"
          }
          ${
            isRecording
              ? "ring-2 ring-primary border-primary"
              : "border-input bg-background"
          }
          ${error ? "border-destructive" : ""}
        `}
      >
        <div className="flex-1 flex items-center gap-1 min-h-[24px]">
          {isRecording ? (
            displayParts.length > 0 ? (
              <ShortcutDisplay parts={displayParts} />
            ) : (
              <span className="text-sm text-muted-foreground animate-pulse">
                Press keys...
              </span>
            )
          ) : displayParts.length > 0 ? (
            <ShortcutDisplay parts={displayParts} />
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
        </div>

        {showClear && value && !isRecording && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Clear shortcut"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

/** Props for ShortcutDisplay */
export interface ShortcutDisplayProps {
  /** The accelerator string or parsed parts */
  accelerator?: string;
  /** Pre-parsed parts (takes precedence over accelerator) */
  parts?: string[];
  /** Additional class name */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

/**
 * Display a keyboard shortcut using styled key badges.
 */
export function ShortcutDisplay({
  accelerator,
  parts: propParts,
  className = "",
  size = "md",
}: ShortcutDisplayProps) {
  const parts = propParts || (accelerator ? parseAccelerator(accelerator) : []);

  if (parts.length === 0) {
    return null;
  }

  const sizeClasses = {
    sm: "h-4 min-w-4 px-1 text-[10px]",
    md: "h-5 min-w-5 px-1.5 text-xs",
    lg: "h-6 min-w-6 px-2 text-sm",
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {parts.map((part, index) => (
        <kbd
          key={index}
          className={`
            inline-flex items-center justify-center rounded-sm
            bg-muted text-muted-foreground font-sans font-medium
            select-none pointer-events-none
            ${sizeClasses[size]}
          `}
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

export default ShortcutRecorder;
