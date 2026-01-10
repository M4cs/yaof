import { useSystemService } from "@m4cs/yaof-sdk";
import { VinylRecordIcon } from "@phosphor-icons/react";
import { cn } from "../lib/utils";

export function NowPlaying() {
  const { data } = useSystemService();

  return (
    <div className="w-fit text-foreground flex items-center jusitfy-start gap-3">
      <VinylRecordIcon
        size={16}
        className={cn(data?.media.playing && "animate-spin")}
      />
      <p className="text-sm truncate max-w-sm">
        {data?.media.title ? data?.media.title : "Not Playing"}
        {data?.media.artist && " - " + data?.media.artist}
      </p>
      {data?.media.position_ms && data.media.duration_ms && (
        <div className="w-20 h-2 rounded-full bg-muted/80 border border-border relative">
          <div
            className={"rounded-full absolute top-0 left-0 h-full bg-white"}
            style={{
              width: `${parseInt(
                (
                  ((data?.media.position_ms ?? 0) /
                    (data?.media.duration_ms ?? 0)) *
                  100
                ).toString()
              )}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
