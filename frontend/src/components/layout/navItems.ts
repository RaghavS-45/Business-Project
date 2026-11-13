import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  UserCog,
  ClipboardList,
  Settings,
  Wallet,
} from "lucide-react";

/** Pages in the sidebar (and the command palette), by role. */
export const SECTIONS = ["Overview", "Sell", "Inventory", "Admin"] as const;

export const navItems = [
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
