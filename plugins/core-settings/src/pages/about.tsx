import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@yaof/ui/components/ui/card";
import { Button } from "@yaof/ui/components/ui/button";
import { Separator } from "@yaof/ui/components/ui/separator";
import { Badge } from "@yaof/ui/components/ui/badge";
import { GithubLogo, Bug, BookOpen, Crosshair } from "@phosphor-icons/react";

export function About() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">About YAOF</h2>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="rounded-full bg-primary/10 p-6">
              <Crosshair className="size-12 text-primary" weight="duotone" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                Yet Another Overlay Framework
              </h3>
              <Badge variant="secondary">Version 0.1.0</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            YAOF is a cross-platform desktop overlay framework that lets you
            create beautiful, always-on-top widgets for your desktop. Build
            custom overlays using React and TypeScript with full access to
            system APIs.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links</CardTitle>
          <CardDescription>Resources and documentation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-auto py-3"
          >
            <a
              href="https://github.com/M4cs/yaof"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubLogo className="size-5" weight="duotone" />
              <div className="flex flex-col items-start">
                <span className="font-medium">GitHub Repository</span>
                <span className="text-xs text-muted-foreground">
                  View source code and contribute
                </span>
              </div>
            </a>
          </Button>

          <Separator />

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-auto py-3"
          >
            <a
              href="https://github.com/M4cs/yaof/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Bug className="size-5" weight="duotone" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Report an Issue</span>
                <span className="text-xs text-muted-foreground">
                  Found a bug? Let us know
                </span>
              </div>
            </a>
          </Button>

          <Separator />

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-auto py-3"
          >
            <a
              href="https://github.com/M4cs/yaof/wiki"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen className="size-5" weight="duotone" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Documentation</span>
                <span className="text-xs text-muted-foreground">
                  Learn how to build plugins
                </span>
              </div>
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">License</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">MIT License © 2024</p>
        </CardContent>
      </Card>
    </div>
  );
}
