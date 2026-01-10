import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@yaof/ui/components/ui/sidebar";
import { PackageIcon, GearIcon, InfoIcon } from "@phosphor-icons/react";
import type { Page } from "../App";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export function AppSidebar({ currentPage, onNavigate }: SidebarProps) {
  const isActive = (type: Page["type"]) => {
    if (type === "plugin-settings")
      return currentPage.type === "plugin-settings";
    return currentPage.type === type;
  };

  const navItems = [
    {
      type: "plugins" as const,
      label: "Plugins",
      icon: PackageIcon,
    },
    {
      type: "global" as const,
      label: "Global Settings",
      icon: GearIcon,
    },
    {
      type: "about" as const,
      label: "About",
      icon: InfoIcon,
    },
  ];

  return (
    <ShadcnSidebar collapsible="none" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-4 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-wide text-primary">YAOF</h1>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Settings
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.type}>
                  <SidebarMenuButton
                    isActive={
                      isActive(item.type) ||
                      (item.type === "plugins" && isActive("plugin-settings"))
                    }
                    onClick={() => onNavigate({ type: item.type })}
                    tooltip={item.label}
                  >
                    <item.icon className="size-4" weight="duotone" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">v0.1.0</span>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
