import { NavLink, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, SECTIONS } from "./navItems";
import BrandMark from "@/components/brand/BrandMark";
import { useStoreSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Rendered inside the mobile drawer: fills it, no collapse button. */
  mobile?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobile, onNavigate }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const { data: store } = useStoreSettings();
  const storeName = store?.tradeName || store?.legalName || "Inventory POS";
  const location = useLocation();

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar-fill text-sidebar-foreground",
        mobile
          ? "h-full w-full"
          : "fixed inset-y-0 left-0 z-30 border-r border-sidebar-border transition-[width] duration-300 ease-in-out",
        !mobile && (collapsed ? "w-[68px]" : "w-[240px]")
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <BrandMark />
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate font-heading text-[15px] font-bold text-sidebar-accent-foreground">
                {storeName}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/60">Billing &amp; inventory</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.filter((section) => visibleItems.some((item) => item.section === section)).map((section, sectionIndex) => {
          const items = visibleItems.filter((item) => item.section === section);
          return (
            <div key={section} className={cn(sectionIndex > 0 && "mt-5")}>
              {collapsed ? (
                sectionIndex > 0 && <div className="mx-2 mb-3 h-px bg-sidebar-border" />
              ) : (
                <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/45">
                  {section}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive =
                    item.path === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.path);

                  const link = (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      aria-label={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      {isActive && !collapsed && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                      )}
                      <item.icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          isActive ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-accent-foreground"
                        )}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.path} delayDuration={0}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return link;
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={cn("border-t border-sidebar-border p-3", mobile && "hidden")}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
