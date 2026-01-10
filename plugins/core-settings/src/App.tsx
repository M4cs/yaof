import { useState } from "react";
import { SidebarProvider, SidebarInset } from "@yaof/ui/components/ui/sidebar";
import { ScrollArea } from "@yaof/ui/components/ui/scroll-area";
import { AppSidebar } from "./components/sidebar";
import { PluginList } from "./pages/plugin-list";
import { PluginSettings } from "./pages/plugin-settings";
import { GlobalSettings } from "./pages/global-settings";
import { About } from "./pages/about";

export type Page =
  | { type: "plugins" }
  | { type: "plugin-settings"; pluginId: string }
  | { type: "global" }
  | { type: "about" };

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>({ type: "plugins" });

  const renderPage = () => {
    switch (currentPage.type) {
      case "plugins":
        return (
          <PluginList
            onSelectPlugin={(id) =>
              setCurrentPage({ type: "plugin-settings", pluginId: id })
            }
          />
        );
      case "plugin-settings":
        return (
          <PluginSettings
            pluginId={currentPage.pluginId}
            onBack={() => setCurrentPage({ type: "plugins" })}
          />
        );
      case "global":
        return <GlobalSettings />;
      case "about":
        return <About />;
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <SidebarInset className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <main className="p-6 max-w-7xl">{renderPage()}</main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
