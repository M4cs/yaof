import { useState, useEffect } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@yaof/ui/components/ui/card";
import { Switch } from "@yaof/ui/components/ui/switch";
import { Input } from "@yaof/ui/components/ui/input";
import { Label } from "@yaof/ui/components/ui/label";
import { Separator } from "@yaof/ui/components/ui/separator";
import { Skeleton } from "@yaof/ui/components/ui/skeleton";
import { Kbd } from "@yaof/ui/components/ui/kbd";

interface GlobalSettingsData {
  startOnLogin: boolean;
  showTrayIcon: boolean;
  globalHotkey: string;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalSettingsData = {
  startOnLogin: false,
  showTrayIcon: true,
  globalHotkey: "CommandOrControl+Shift+O",
};

export function GlobalSettings() {
  const [store, setStore] = useState<Store | null>(null);
  const [settings, setSettings] = useState<GlobalSettingsData>(
    DEFAULT_GLOBAL_SETTINGS
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const s = await load("yaof-global-settings.json");
      setStore(s);

      const loaded: GlobalSettingsData = { ...DEFAULT_GLOBAL_SETTINGS };
      for (const key of Object.keys(
        DEFAULT_GLOBAL_SETTINGS
      ) as (keyof GlobalSettingsData)[]) {
        const value = await s.get<unknown>(key);
        if (value !== null && value !== undefined) {
          (loaded as any)[key] = value;
        }
      }
      setSettings(loaded);
    } catch (error) {
      console.error("Failed to load global settings:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateSetting<K extends keyof GlobalSettingsData>(
    key: K,
    value: GlobalSettingsData[K]
  ) {
    if (!store) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    await store.set(key, value);
    await store.save();
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Global Settings
        </h2>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Global Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Startup</CardTitle>
          <CardDescription>
            Configure how YAOF behaves when your system starts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="start-on-login" className="text-sm font-medium">
                Start on Login
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically start YAOF when you log in
              </p>
            </div>
            <Switch
              id="start-on-login"
              checked={settings.startOnLogin}
              onCheckedChange={(checked) =>
                updateSetting("startOnLogin", checked)
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="show-tray" className="text-sm font-medium">
                Show Tray Icon
              </Label>
              <p className="text-xs text-muted-foreground">
                Show YAOF icon in the system tray
              </p>
            </div>
            <Switch
              id="show-tray"
              checked={settings.showTrayIcon}
              onCheckedChange={(checked) =>
                updateSetting("showTrayIcon", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hotkeys</CardTitle>
          <CardDescription>Configure global keyboard shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="global-hotkey" className="text-sm font-medium">
                Open Settings
              </Label>
              <p className="text-xs text-muted-foreground">
                Global hotkey to open this settings window
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="global-hotkey"
                type="text"
                value={settings.globalHotkey}
                onChange={(e) => updateSetting("globalHotkey", e.target.value)}
                placeholder="CommandOrControl+Shift+O"
                className="w-56 font-mono text-sm"
              />
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">
              Current shortcut:
            </p>
            <div className="flex items-center gap-1">
              {settings.globalHotkey.split("+").map((key, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground">+</span>}
                  <Kbd>{key.replace("CommandOrControl", "⌘/Ctrl")}</Kbd>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
