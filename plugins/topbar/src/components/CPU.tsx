import { useSystemService } from "@m4cs/yaof-sdk";
import { CpuIcon } from "@phosphor-icons/react";

export function CPU() {
  const { data } = useSystemService();

  return (
    <div className="flex items-center justify-start gap-2 w-fit text-foreground">
      <CpuIcon size={14} />
      <span>{data?.cpu.usage ? `${data.cpu.usage.toFixed(0)}%` : "N/A"}</span>
    </div>
  );
}
