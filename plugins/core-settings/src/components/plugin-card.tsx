import type { PluginManifest } from "@m4cs/yaof-sdk";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@yaof/ui/components/ui/card";
import { Switch } from "@yaof/ui/components/ui/switch";
import { Button } from "@yaof/ui/components/ui/button";
import { Badge } from "@yaof/ui/components/ui/badge";
import { Gear } from "@phosphor-icons/react";

interface PluginCardProps {
  plugin: PluginManifest;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
}

export function PluginCard({
  plugin,
  enabled,
  onToggle,
  onConfigure,
}: PluginCardProps) {
  const overlayCount = Object.keys(plugin.overlays).length;

  return (
    <Card
      className={`transition-all duration-200 ${!enabled ? "opacity-60" : ""}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="font-semibold text-base leading-none truncate">
              {plugin.name}
            </h3>
            <span className="text-xs text-muted-foreground">
              v{plugin.version}
            </span>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={enabled ? "Disable plugin" : "Enable plugin"}
          />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex flex-col gap-2">
          <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-md inline-block w-fit">
            {plugin.id}
          </code>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {overlayCount} overlay{overlayCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={onConfigure}
          className="w-full"
        >
          <Gear className="size-4 mr-2" weight="duotone" />
          Configure
        </Button>
      </CardFooter>
    </Card>
  );
}
