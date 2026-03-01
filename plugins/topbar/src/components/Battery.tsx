import { useSystemService } from "@m4cs/yaof-sdk";
import { useMemo } from "react";
import {
  BatteryCharging,
  BatteryEmpty,
  BatteryFull,
  BatteryHigh,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
} from "@phosphor-icons/react";

interface BatteryData {
  percentage: number;
  charging: boolean;
  time_remaining: string | null;
  available: boolean;
}

export function Battery() {
  const { data } = useSystemService(
    (status) =>
      (status as unknown as Record<string, unknown>)
        .battery as BatteryData | undefined
  );

  const icon = useMemo(() => {
    if (!data?.available) return <BatteryEmpty size={16} />;

    if (data.charging) return <BatteryCharging size={16} />;

    const pct = data.percentage;
    if (pct <= 10) return <BatteryWarning size={16} />;
    if (pct <= 25) return <BatteryLow size={16} />;
    if (pct <= 50) return <BatteryMedium size={16} />;
    if (pct <= 75) return <BatteryHigh size={16} />;
    return <BatteryFull size={16} />;
  }, [data]);

  if (!data?.available) {
    return null;
  }

  return (
    <div className="flex items-center justify-start gap-1 w-fit text-foreground">
      {icon}
      <span className="text-xs">{data.percentage}%</span>
    </div>
  );
}
