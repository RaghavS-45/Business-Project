import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Loader2,
  LogOut,
  Moon,
  Package,
  Palette as PaletteIcon,
  Plus,
  Receipt,
  ShoppingCart,
  Sun,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";
import api from "@/lib/axios";
import { navItems } from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { useLogout } from "@/hooks/useAuth";
import { useTheme, PALETTES } from "@/hooks/useTheme";
import { formatINR, formatPrice } from "@/lib/pricing";
import type { PricedProduct } from "@/lib/unitPricing";

type Role = "ADMIN" | "MANAGER" | "CASHIER";

interface FoundProduct extends PricedProduct {
  _id: string;
  name: string;
  sku: string;
  stock: number;
  costPrice: number;
  taxRate?: number;
  images?: Array<{ url: string }>;
}
interface FoundCustomer {
  _id: string;
  name: string;
  phone?: string;
  gstin?: string;
  outstanding?: number;
}
interface FoundSale {
  _id: string;
  invoiceNumber: string;
  grandTotal: number;
  createdAt: string;
  buyer?: { name?: string };
  status: string;
}

/** Unique link each time, so choosing the same result twice still opens it. */
const fresh = (path: string) => `${path}&t=${Date.now()}`;

/** Wait until typing pauses before searching the server. */
function useDebounced<T>(value: T, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const matches = (query: string, ...texts: string[]) => {
  const q = query.trim().toLowerCase();
  return !q || texts.some((t) => t.toLowerCase().includes(q));
};

/**
 * Ctrl+K / ⌘K: jump to any page, run common actions, or find a product,
 * customer or invoice by typing part of its name, SKU, phone, GSTIN or
 * invoice number.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.user?.role) as Role | undefined;
  const addItem = useCartStore((s) => s.addItem);
  const logout = useLogout();
  const { theme, toggle, palette, setPalette } = useTheme();

  const canManage = role === "ADMIN" || role === "MANAGER";
  const search = useDebounced(query.trim());
  const searching = search.length >= 2;

  // ── Shortcut + external open ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:open", onOpen);
    };
  }, []);

  // ── Server results ───────────────────────────────────────
  const products = useQuery({
    queryKey: ["command", "products", search],
    queryFn: async () =>
      (await api.get("/products", { params: { search, limit: 6 } })).data.data.products as FoundProduct[],
    enabled: open && searching,
    staleTime: 30_000,
  });
  const customers = useQuery({
    queryKey: ["command", "customers", search],
    queryFn: async () =>
      (await api.get("/customers", { params: { search, limit: 5 } })).data.data.customers as FoundCustomer[],
    enabled: open && searching,
    staleTime: 30_000,
  });
  const sales = useQuery({
    queryKey: ["command", "sales", search],
    queryFn: async () =>
      (await api.get("/sales", { params: { search, limit: 5, sortBy: "createdAt", sortOrder: "desc" } })).data.data
        .sales as FoundSale[],
    enabled: open && searching && canManage,
    staleTime: 30_000,
  });
  const loading = searching && (products.isFetching || customers.isFetching || sales.isFetching);

  // ── Pages & actions (filtered locally) ───────────────────
  const pages = useMemo(
    () => navItems.filter((i) => role && i.roles.includes(role) && matches(query, i.label, i.section)),
    [role, query]
  );

  const actions = useMemo(() => {
    const list = [
      { id: "sale", label: "New sale", hint: "Open the POS", icon: ShoppingCart, run: () => navigate("/pos"), show: true },
      { id: "payment", label: "Record a payment", hint: "Collect dues", icon: Wallet, run: () => navigate("/receivables"), show: canManage },
      { id: "product", label: "Add product", hint: "", icon: Plus, run: () => navigate(fresh("/products?new=1")), show: canManage },
      { id: "customer", label: "Add customer", hint: "", icon: UserPlus, run: () => navigate(fresh("/customers?new=1")), show: true },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        hint: "",
        icon: theme === "dark" ? Sun : Moon,
        run: toggle,
        show: true,
      },
      ...PALETTES.filter((p) => p.id !== palette).map((p) => ({
        id: `palette-${p.id}`,
        label: `Use ${p.name} colours`,
        hint: "",
        icon: PaletteIcon,
        run: () => setPalette(p.id),
        show: true,
      })),
      { id: "logout", label: "Sign out", hint: "", icon: LogOut, run: () => logout.mutate(), show: true },
    ];
    return list.filter((a) => a.show && matches(query, a.label, a.hint));
  }, [query, canManage, theme, palette, navigate, toggle, setPalette, logout]);

  // ── What selecting a result does ─────────────────────────
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const run = (fn: () => void) => {
    close();
    fn();
  };

  const openProduct = (p: FoundProduct) => {
    // At the till (or for cashiers) a product goes straight into the cart
    if (!canManage || location.pathname.startsWith("/pos")) {
      if (p.stock <= 0) {
        toast.error(`${p.name} is out of stock`);
        return;
      }
      addItem({
        product: p._id,
        name: p.name,
        sku: p.sku,
        costPrice: p.costPrice,
        stock: p.stock,
        taxPercent: p.taxRate ?? 0,
        image: p.images?.[0]?.url,
        pricing: {
          unit: p.unit ?? "pcs",
          sellingPrice: p.sellingPrice,
          packs: p.packs ?? [],
          levelPrices: p.levelPrices,
          priceSlabs: p.priceSlabs ?? [],
        },
      });
      toast.success(`Added ${p.name}`);
      navigate("/pos");
      return;
    }
    navigate(fresh(`/products?search=${encodeURIComponent(p.name)}&edit=${p._id}`));
  };

  const openCustomer = (c: FoundCustomer) =>
    navigate(canManage ? `/customers/${c._id}/statement` : `/customers?search=${encodeURIComponent(c.name)}`);

  const productHint = !canManage || location.pathname.startsWith("/pos") ? "Add to cart" : "Open";
  const nothing =
    !loading &&
    pages.length === 0 &&
    actions.length === 0 &&
    (!searching || (!products.data?.length && !customers.data?.length && !sales.data?.length));

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title="Search"
      description="Search pages, actions, products, customers and invoices"
      className="sm:max-w-xl"
    >
      {/* Filtering is done here (local) and on the server (remote), not by cmdk */}
      <CommandRoot query={query} setQuery={setQuery}>
          <CommandList className="max-h-[min(60vh,420px)]">
            {nothing && <CommandEmpty>No results for “{query}”</CommandEmpty>}
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}

            {searching && !!products.data?.length && (
              <CommandGroup heading="Products">
                {products.data.map((p) => (
                  <CommandItem key={p._id} value={`product-${p._id}`} onSelect={() => run(() => openProduct(p))}>
                    <Package />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.sku} · {formatPrice(p.sellingPrice)}/{p.unit ?? "pcs"} ·{" "}
                        <span className={p.stock <= 0 ? "text-destructive" : ""}>
                          {p.stock <= 0 ? "out of stock" : `${p.stock} ${p.unit ?? ""} in stock`}
                        </span>
                      </p>
                    </div>
                    <CommandShortcut>{productHint}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searching && !!customers.data?.length && (
              <CommandGroup heading="Customers">
                {customers.data.map((c) => (
                  <CommandItem key={c._id} value={`customer-${c._id}`} onSelect={() => run(() => openCustomer(c))}>
                    <User />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.phone, c.gstin].filter(Boolean).join(" · ") || "No phone"}
                      </p>
                    </div>
                    {(c.outstanding ?? 0) > 0 && (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        owes {formatINR(c.outstanding ?? 0)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {searching && !!sales.data?.length && (
              <CommandGroup heading="Invoices">
                {sales.data.map((s) => (
                  <CommandItem key={s._id} value={`sale-${s._id}`} onSelect={() => run(() => navigate(fresh(`/sales?sale=${s._id}`)))}>
                    <Receipt />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13px]">{s.invoiceNumber}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.buyer?.name || "Walk-in"} · {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                    <span className="text-xs font-medium tabular-nums">{formatINR(s.grandTotal)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {actions.length > 0 && (
              <>
                {searching && <CommandSeparator />}
                <CommandGroup heading="Actions">
                  {actions.map((a) => (
                    <CommandItem key={a.id} value={`action-${a.id}`} onSelect={() => run(a.run)}>
                      <a.icon />
                      <span className="flex-1">{a.label}</span>
                      {a.hint && <CommandShortcut>{a.hint}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {pages.length > 0 && (
              <CommandGroup heading="Go to">
                {pages.map((p) => (
                  <CommandItem key={p.path} value={`page-${p.path}`} onSelect={() => run(() => navigate(p.path))}>
                    <p.icon />
                    <span className="flex-1">{p.label}</span>
                    <CommandShortcut>{p.section}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>Type 2+ letters to search products, customers{canManage ? " and invoices" : ""}</span>
            <span className="hidden sm:inline">
              <kbd className="rounded border bg-muted px-1">↑</kbd> <kbd className="rounded border bg-muted px-1">↓</kbd> to move ·{" "}
              <kbd className="rounded border bg-muted px-1">Enter</kbd> to open
            </span>
          </div>
      </CommandRoot>
    </CommandDialog>
  );
}

/** cmdk root with its own filtering turned off (we filter above). */
function CommandRoot({
  query,
  setQuery,
  children,
}: {
  query: string;
  setQuery: (q: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Command shouldFilter={false} className="rounded-none! bg-transparent p-0">
      <div className="p-2">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search products, customers, invoices or type a command…"
          className="h-10"
        />
      </div>
      {children}
    </Command>
  );
}
