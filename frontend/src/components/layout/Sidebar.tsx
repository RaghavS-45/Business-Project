import { NavLink, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  ChevronLeft,
  ChevronRight,
  UserCog,
  ClipboardList,
  Settings,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Rendered inside the mobile drawer: fills it, no collapse button. */
  mobile?: boolean;
  onNavigate?: () => void;
}

const SECTIONS = ["Overview", "Sell", "Inventory", "Admin"] as const;

const navItems = [
  {
    label: "Dashboard",
    section: "Overview",
    icon: LayoutDashboard,
    path: "/",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Products",
    section: "Inventory",
    icon: Package,
    path: "/products",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "POS Terminal",
    section: "Sell",
    icon: ShoppingCart,
    path: "/pos",
    roles: ["ADMIN", "MANAGER", "CASHIER"],
  },
  {
    label: "Sales",
    section: "Sell",
    icon: Receipt,
    path: "/sales",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Customers",
    section: "Sell",
    icon: Users,
    path: "/customers",
    roles: ["ADMIN", "MANAGER", "CASHIER"],
  },
  {
    label: "Dues",
    section: "Sell",
    icon: Wallet,
    path: "/receivables",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Vendors",
    section: "Inventory",
    icon: Truck,
    path: "/vendors",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Purchase Orders",
    section: "Inventory",
    icon: ClipboardList,
    path: "/purchase-orders",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Team",
    section: "Admin",
    icon: UserCog,
    path: "/users",
    roles: ["ADMIN"],
  },
  {
    label: "Store Settings",
    section: "Admin",
    icon: Settings,
    path: "/settings",
    roles: ["ADMIN"],
  },
];

export default function Sidebar({ collapsed, onToggle, mobile, onNavigate }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar",
        mobile
          ? "h-full w-full"
          : "fixed inset-y-0 left-0 z-30 border-r border-border/50 transition-[width] duration-300 ease-in-out",
        !mobile && (collapsed ? "w-[68px]" : "w-[240px]")
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-border/50 px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-md shadow-blue-500/20">
            <Package className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-bold tracking-tight text-foreground">
                Inventory POS
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                Store management
              </span>
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
                sectionIndex > 0 && <div className="mx-2 mb-3 h-px bg-border/60" />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
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
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
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
      <div className={cn("border-t border-border/50 p-3", mobile && "hidden")}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center text-muted-foreground hover:text-foreground"
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
