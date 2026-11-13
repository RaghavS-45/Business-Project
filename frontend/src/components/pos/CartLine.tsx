import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCartStore, isLooseLine, maxQuantity, type CartItem } from "@/stores/cartStore";
import { formatINR, formatPrice } from "@/lib/pricing";

/**
 * One cart line: unit picker (pcs / carton / ...), quantity (decimals for
 * loose items like kg), the price that applies and why, and the line total.
 */
export default function CartLine({ item }: { item: CartItem }) {
  const { removeItem, updateQuantity, setLineUnit, getLineTotal, getLinePrice } = useCartStore();
  // Typed text, so "2." or "0.2" can be entered before it's a valid number
  const [draft, setDraft] = useState<string | null>(null);

  const loose = isLooseLine(item);
  const max = maxQuantity(item);
  const step = 1;
  const { unitPrice, priceSource } = getLinePrice(item.key);
  const units = [
    { name: item.baseUnit, label: item.baseUnit },
    ...(item.pricing.packs ?? []).map((p) => ({ name: p.name, label: `${p.name} (${p.size} ${item.baseUnit})` })),
  ];
  const specialPrice = priceSource && priceSource !== "Retail";

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) updateQuantity(item.key, n);
    setDraft(null);
  };

  return (
    <div className="group rounded-lg border border-border/40 bg-muted/10 p-3 transition-colors hover:border-border/60">
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {formatPrice(unitPrice)}/{item.unit}
            {item.taxPercent > 0 && ` · GST ${item.taxPercent}%`}
          </p>
          {specialPrice && (
            <span className="mt-0.5 inline-flex rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              {priceSource}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => removeItem(item.key)}
          aria-label={`Remove ${item.name}`}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => updateQuantity(item.key, item.quantity - step)}
            disabled={item.quantity <= (loose ? 0.001 : 1) || item.quantity - step <= 0}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="text"
            inputMode={loose ? "decimal" : "numeric"}
            value={draft ?? String(item.quantity)}
            onChange={(e) => setDraft(e.target.value.replace(loose ? /[^\d.]/g : /\D/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="h-7 w-14 px-1 text-center text-sm tabular-nums"
            aria-label={`Quantity of ${item.name} in ${item.unit}`}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => updateQuantity(item.key, item.quantity + step)}
            disabled={item.quantity + step > max}
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </Button>
          {units.length > 1 ? (
            <Select value={item.unit} onValueChange={(u) => setLineUnit(item.key, u)}>
              <SelectTrigger className="h-7 w-auto min-w-0 gap-1 px-2 text-xs" aria-label="Unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.name} value={u.name} className="text-xs">
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="ml-1 text-xs text-muted-foreground">{item.unit}</span>
          )}
        </div>
        <p className="text-sm font-semibold tabular-nums">{formatINR(getLineTotal(item.key))}</p>
      </div>
    </div>
  );
}
