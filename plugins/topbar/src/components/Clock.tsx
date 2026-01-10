import { usePluginConfig } from "@m4cs/yaof-sdk";
import { useEffect, useState } from "react";
import { topbarConfigSchema, type TopbarConfig } from "../config";

export function Clock() {
  const { config, isLoading } = usePluginConfig(topbarConfigSchema);
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const updateTime = () => setTime(new Date());
    updateTime(); // Initial update

    const interval = setInterval(updateTime, config.refreshInterval);
    return () => clearInterval(interval);
  }, [isLoading, config.refreshInterval]);

  if (isLoading) {
    return <div className="w-fit text-foreground">--:--</div>;
  }

  if (!config.showClock) {
    return null;
  }

  return (
    <div className="w-fit text-foreground">
      {time ? formatTime(time, config.clockFormat) : "--:--"}
    </div>
  );
}

function formatTime(
  date: Date,
  format: TopbarConfig["clockFormat"],
  includeAmPm = false,
  use24hour = true
) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();

  const amPm = includeAmPm ? (hours < 12 ? "AM" : "PM") : "";

  if (!use24hour) {
    hours %= 12;
  }

  switch (format) {
    case "HH:MM":
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")} ${amPm}`;
    case "HH:MM:SS":
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")} ${amPm}`;
    case "HH:MM:SS:MS":
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${milliseconds
        .toString()
        .padStart(3, "0")} ${amPm}`;
    default:
      return "Invalid format";
  }
}

export function ClockWithTimezone() {
  const [time, setTime] = useState<Date | null>(null);

  const updateTime = () => {
    setTime(new Date());
  };

  useEffect(() => {
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-fit text-foreground">
      {time
        ? formatTime(time, "HH:MM", true) + " " + time.toLocaleTimeString()
        : "--:--"}
    </div>
  );
}
