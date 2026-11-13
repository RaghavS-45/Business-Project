import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useProducts } from "@/hooks/useProducts";
import { allowsDecimal, resolveLine, type PriceLevel } from "@/lib/unitPricing";
import { formatINR, formatPrice, priceLine, toRupees } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { newLine, type CatalogProduct, type EditorLine } from "@/lib/editorLines";

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

interface Props {
  /** sell: price from the product · buy: cost + GST from a bill · order: cost only (purchase orders) */
  mode: "sell" | "buy" | "order";
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  /** Selling: the buyer's price level and loyalty discount, for the estimate */
  level?: PriceLevel;
  loyaltyPercent?: number;
  taxInclusive?: boolean;
  /** Selling from stock (challans): warn when a line needs more than is in stock */
  checkStock?: boolean;
}

/**
 * Line items for quotations, challans (mode "sell": the price comes from the
 * product, as at the POS) and purchase bills (mode "buy": cost and GST typed
 * from the supplier's bill). Shows a running estimate; the server works out
 * the final figures.
 */
export default function LineItemsEditor({ mode, lines, onChange, level = "RETAIL", loyaltyPercent = 0, taxInclusive = false, checkStock = false }: Props) {
  const { data } = useProducts({ limit: 100 });
  const products: CatalogProduct[] = data?.products ?? [];
  const byId = new Map(products.map((p) => [p._id, p]));

  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pick = (key: string, p: CatalogProduct) =>
    update(key, {
      product: p._id,
      unit: p.unit,
      quantity: "1",
      unitCost: mode !== "sell" ? String(p.costPrice ?? "") : "",
      taxPercent: mode === "buy" ? String(p.taxRate ?? 0) : "",
    });

  // Price every line the same way the server will
  const priced = lines.map((l) => {
    const p = byId.get(l.product);
    if (!p || !(num(l.quantity) > 0)) return null;
    const qty = num(l.quantity);
    if (mode === "order") {
      const size = !l.unit || l.unit === p.unit ? 1 : (p.packs?.find((x) => x.name === l.unit)?.size ?? 1);
      const line = priceLine({ quantity: qty, unitPrice: num(l.unitCost) });
      return { line, unitPrice: num(l.unitCost), source: "", baseQty: qty * size, product: p };
    }
    if (mode === "buy") {
      const size = !l.unit || l.unit === p.unit ? 1 : (p.packs?.find((x) => x.name === l.unit)?.size ?? 1);
      // Blank GST = the product's own rate (what the server uses too)
      const taxPercent = l.taxPercent.trim() === "" ? (p.taxRate ?? 0) : num(l.taxPercent);
      const line = priceLine({ quantity: qty, unitPrice: num(l.unitCost), discountPercent: num(l.discountPercent), taxPercent });
      return { line, unitPrice: num(l.unitCost), source: "", baseQty: qty * size, product: p };
    }
    const r = resolveLine(p, { unit: l.unit, quantity: qty, level });
    if (!r) return null;
    const line = priceLine(
      { quantity: qty, unitPrice: r.unitPrice, discountPercent: num(l.discountPercent), taxPercent: p.taxRate ?? 0 },
      loyaltyPercent,
      { taxInclusive }
    );
    return { line, unitPrice: r.unitPrice, source: r.priceSource, baseQty: r.baseQty, product: p };
  });
  const sum = (k: "taxable" | "tax" | "total") => priced.reduce((s, x) => s + (x?.line[k] ?? 0), 0);

  const cols =
    mode === "buy"
      ? "sm:grid-cols-[minmax(0,1fr)_70px_96px_96px_60px_56px_88px_32px]"
      : mode === "order"
        ? "sm:grid-cols-[minmax(0,1fr)_76px_120px_104px_100px_32px]"
        : "sm:grid-cols-[minmax(0,1fr)_70px_96px_60px_96px_32px]";

  /** Changing pack ⇄ loose rescales the cost (1 carton of 12 = 12 × piece cost). */
  const changeUnit = (l: EditorLine, p: CatalogProduct | undefined, unit: string) => {
    if (!p || mode === "sell") return update(l.key, { unit });
    const sizeOf = (u: string) => (u === p.unit ? 1 : (p.packs?.find((x) => x.name === u)?.size ?? 1));
    const perBase = num(l.unitCost) / sizeOf(l.unit || p.unit);
    const cost = Math.round(perBase * sizeOf(unit) * 100) / 100;
    update(l.key, { unit, unitCost: l.unitCost.trim() === "" ? "" : String(cost) });
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className={cn("hidden sm:grid gap-2 bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground", cols)}>
          <span>Product</span>
          <span>Qty</span>
          <span>Unit</span>
          {mode === "buy" ? (
            <>
              <span>Cost / unit</span>
              <span>Disc %</span>
              <span>GST %</span>
            </>
          ) : mode === "order" ? (
            <span>Cost / unit</span>
          ) : (
            <span>Disc %</span>
          )}
          <span className="text-right">Amount</span>
          <span />
        </div>

        <div className="divide-y divide-border/40">
          {lines.map((l, i) => {
            const p = byId.get(l.product);
            const est = priced[i];
            const units = p ? [p.unit, ...(p.packs ?? []).map((x) => x.name)] : [];
            const unit = l.unit || p?.unit || "";
            const loose = p && unit === p.unit && allowsDecimal(p.unit);
            const short = checkStock && p && est && est.baseQty > p.stock;
            return (
              <div key={l.key} className={cn("grid grid-cols-2 gap-2 px-3 py-2 items-start", cols)}>
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <ProductPicker products={products} value={p} onPick={(prod) => pick(l.key, prod)} />
                  {p && (
                    <p className={cn("mt-1 truncate text-[10px] text-muted-foreground", short && "text-destructive")}>
                      {mode === "sell" && est ? `${formatPrice(est.unitPrice)}/${unit}${est.source && est.source !== "Retail" ? ` · ${est.source}` : ""} · ` : ""}
                      stock {p.stock} {p.unit}
                      {short && " · not enough"}
                    </p>
                  )}
                </div>
                <Input
                  inputMode={loose ? "decimal" : "numeric"}
                  aria-label="Quantity"
                  className="h-8 text-xs tabular-nums"
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value.replace(loose ? /[^\d.]/g : /\D/g, "") })}
                />
                <Select value={unit || undefined} onValueChange={(u) => changeUnit(l, p, u)} disabled={!p}>
                  <SelectTrigger className="h-8 w-full text-xs" aria-label="Unit">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => {
                      const size = p?.packs?.find((x) => x.name === u)?.size;
                      return (
                        <SelectItem key={u} value={u} className="text-xs">
                          {size ? `${u} (${size} ${p?.unit})` : u}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {mode !== "sell" && (
                  <Input
                    inputMode="decimal"
                    aria-label="Cost per unit"
                    placeholder="₹"
                    className="h-8 text-xs tabular-nums"
                    value={l.unitCost}
                    onChange={(e) => update(l.key, { unitCost: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                )}
                {mode !== "order" && (
                <Input
                  inputMode="decimal"
                  aria-label="Discount percent"
                  placeholder="0"
                  className="h-8 text-xs tabular-nums"
                  value={l.discountPercent}
                  onChange={(e) => update(l.key, { discountPercent: e.target.value.replace(/[^\d.]/g, "") })}
                />
                )}
                {mode === "buy" && (
                  <Input
                    inputMode="decimal"
                    aria-label="GST percent"
                    placeholder={String(p?.taxRate ?? 0)}
                    className="h-8 text-xs tabular-nums"
                    value={l.taxPercent}
                    onChange={(e) => update(l.key, { taxPercent: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                )}
                <p className="flex h-8 items-center justify-end text-xs font-medium tabular-nums">
                  {est ? formatINR(toRupees(est.line.total)) : "—"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={lines.length === 1}
                  onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-3 py-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange([...lines, newLine()])}>
            <Plus className="mr-1 h-3 w-3" />
            Add line
          </Button>
          {mode === "order" ? (
            <div className="text-right text-xs tabular-nums">
              <span className="font-semibold">Total {formatINR(toRupees(sum("total")))}</span>
              <span className="text-muted-foreground"> before GST</span>
            </div>
          ) : (
            <div className="text-right text-xs tabular-nums">
              <span className="text-muted-foreground">
                Taxable {formatINR(toRupees(sum("taxable")))} · GST {formatINR(toRupees(sum("tax")))} ·{" "}
              </span>
              <span className="font-semibold">Total {formatINR(toRupees(sum("total")))}</span>
            </div>
          )}
        </div>
      </div>
      {mode === "sell" && (
        <p className="text-[11px] text-muted-foreground">
          Prices follow the customer's price level, bulk slabs and pack prices, the same as the POS.
        </p>
      )}
    </div>
  );
}

function ProductPicker({ products, value, onPick }: { products: CatalogProduct[]; value?: CatalogProduct; onPick: (p: CatalogProduct) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-8 w-full justify-between px-2 text-xs font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? value.name : "Choose product"}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search name or SKU…" className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p._id}
                  value={`${p.name} ${p.sku}`}
                  onSelect={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("h-3 w-3", value?._id === p._id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {p.stock} {p.unit}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
