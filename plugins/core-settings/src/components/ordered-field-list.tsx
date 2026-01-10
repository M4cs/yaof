"use client";

import * as React from "react";
import {
  DotsSixVerticalIcon,
  XIcon,
  CaretUpIcon,
  CaretDownIcon,
} from "@phosphor-icons/react";
import { cn } from "@yaof/ui/lib/utils";
import { Button } from "@yaof/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yaof/ui/components/ui/popover";

interface OrderedListFieldProps<T extends string> {
  value: T[];
  onChange: (value: T[]) => void;
  enumObj: Record<string, T>;
  label?: string;
  description?: string;
  className?: string;
}

export function OrderedListField<T extends string>({
  value,
  onChange,
  enumObj,
  label,
  description,
  className,
}: OrderedListFieldProps<T>) {
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const [isAddPopoverOpen, setIsAddPopoverOpen] = React.useState(false);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (
      draggedIndex !== null &&
      dragOverIndex !== null &&
      draggedIndex !== dragOverIndex
    ) {
      const newValue = [...value];
      const [removed] = newValue.splice(draggedIndex, 1);
      newValue.splice(dragOverIndex, 0, removed);
      onChange(newValue);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleRemove = (index: number) => {
    const newValue = value.filter((_, i) => i !== index);
    onChange(newValue);
  };

  const handleShiftUp = (index: number) => {
    if (index > 0) {
      const newValue = [...value];
      [newValue[index - 1], newValue[index]] = [
        newValue[index],
        newValue[index - 1],
      ];
      onChange(newValue);
    }
  };

  const handleShiftDown = (index: number) => {
    if (index < value.length - 1) {
      const newValue = [...value];
      [newValue[index], newValue[index + 1]] = [
        newValue[index + 1],
        newValue[index],
      ];
      onChange(newValue);
    }
  };

  const handleAdd = (enumValue: T) => {
    if (!value.includes(enumValue)) {
      onChange([...value, enumValue]);
      setIsAddPopoverOpen(false);
    }
  };

  const availableItems = Object.entries(enumObj).filter(
    ([_, val]) => !value.includes(val as T)
  );

  // Get enum name from value
  const getEnumName = (enumValue: T): string => {
    const entry = Object.entries(enumObj).find(([_, val]) => val === enumValue);
    return entry ? entry[0] : enumValue;
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="space-y-0.5">
          <label className="text-sm font-medium text-foreground">{label}</label>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {value.map((item, index) => (
          <div
            key={`${item}-${index}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDragLeave={handleDragLeave}
            className={cn(
              "group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-all",
              "hover:shadow-sm",
              draggedIndex === index && "opacity-40"
            )}
          >
            <div className="cursor-grab active:cursor-grabbing">
              <DotsSixVerticalIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>

            <span className="flex-1 text-sm font-medium text-card-foreground">
              {getEnumName(item)}
            </span>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(index);
                }}
                title="Remove"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShiftDown(index);
                }}
                disabled={index === value.length - 1}
                title="Shift down"
              >
                <CaretDownIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShiftUp(index);
                }}
                disabled={index === 0}
                title="Shift up"
              >
                <CaretUpIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {availableItems.length > 0 && (
          <Popover open={isAddPopoverOpen} onOpenChange={setIsAddPopoverOpen}>
            <PopoverTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-dashed border-border bg-card px-3 py-2.5 transition-all",
                  "hover:bg-accent/50 cursor-pointer"
                )}
              >
                <div className="h-4 w-4" />
                <span className="flex-1 text-sm font-medium text-muted-foreground">
                  Add Item
                </span>
                <div className="h-7 w-7" />
                <div className="h-7 w-7" />
                <div className="h-7 w-7" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="space-y-1">
                {availableItems.map(([name, val]) => (
                  <Button
                    key={val}
                    type="button"
                    variant="ghost"
                    className="w-full justify-start text-sm font-normal"
                    onClick={() => handleAdd(val as T)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
