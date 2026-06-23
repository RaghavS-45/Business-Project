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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Products",
    icon: Package,
    path: "/products",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "POS Terminal",
    icon: ShoppingCart,
    path: "/pos",
    roles: ["ADMIN", "MANAGER", "CASHIER"],
    highlight: true,
  },
  {
    label: "Sales",
    icon: Receipt,
    path: "/sales",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Customers",
    icon: Users,
    path: "/customers",
    roles: ["ADMIN", "MANAGER", "CASHIER"],
  },
  {
    label: "Vendors",
    icon: Truck,
    path: "/vendors",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Purchase Orders",
    icon: ClipboardList,
    path: "/purchase-orders",
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Team",
    icon: UserCog,  // import from lucide-react
    path: "/users",
    roles: ["ADMIN"],
  },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border/50 bg-sidebar transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-border/50 px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/20">
            <Package className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-bold tracking-tight text-foreground">
                Inventory POS
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                Management System
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);

          const link = (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-gradient-to-b from-indigo-500 to-violet-600" />
              )}
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive ? "text-indigo-400" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {!collapsed && item.highlight && (
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] px-1.5 py-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                >
                  POS
                </Badge>
              )}
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
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border/50 p-3">
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
