import { useSystemService } from "@m4cs/yaof-sdk";
import { AppWindowIcon } from "@phosphor-icons/react";

export function ActiveWindow() {
  const { data } = useSystemService();
  return (
    <div className="w-fit text-foreground flex items-center justify-start gap-2 max-w-sm">
      <AppWindowIcon size={16} />
      <p className="text-sm truncate max-w-sm">
        {data?.window.app_name ? data?.window.title : "N/A"}
      </p>
    </div>
  );
}
