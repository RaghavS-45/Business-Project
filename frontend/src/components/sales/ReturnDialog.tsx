import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateReturn } from "@/hooks/useSales";
import { formatINR, formatPrice, toPaise, toRupees } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export interface ReturnableSale {
  _id: string;
  invoiceNumber: string;
  paymentMethod: string;
  balanceDue?: number;
  items: Array<{
    product: string;
    name: string;
    sku: string;
    quantity: number;
    returnedQuantity?: number;
    unitPrice: number;
    taxableValue?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    lineTotal: number;
  }>;
}

/**
 * Same maths as the server (return.service.js): the returned units' share of
 * each invoice line, with cumulative rounding so all returns add up exactly.
 */
function refundForLine(item: ReturnableSale["items"][number], qty: number) {
  if (qty <= 0) return 0;
  const already = item.returnedQuantity ?? 0;
  const share = (rupees = 0) =>
    Math.round((toPaise(rupees) * (already + qty)) / item.quantity) -
    Math.round((toPaise(rupees) * already) / item.quantity);
  const hasGst = item.taxableValue || item.cgst || item.sgst || item.igst;
  return hasGst
    ? share(item.taxableValue) + share(item.cgst) + share(item.sgst) + share(item.igst)
    : share(item.lineTotal);
}

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other / bank" },
] as const;

export default function ReturnDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: ReturnableSale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createReturn = useCreateReturn();
  const lines = sale.items.map((i) => ({ ...i, left: i.quantity - (i.returnedQuantity ?? 0) }));

  const [qty, setQty] = useState<Record<string, number>>({});
  const [damaged, setDamaged] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(sale.paymentMethod);

  const setLineQty = (product: string, value: number, max: number) =>
    setQty((q) => ({ ...q, [product]: Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0)) }));

  const selectAll = () =>
    setQty(Object.fromEntries(lines.filter((l) => l.left > 0).map((l) => [l.product, l.left])));

  const refundPaise = useMemo(
    () => lines.reduce((sum, l) => sum + refundForLine(l, qty[l.product] ?? 0), 0),
    [lines, qty]
  );
  const chosen = lines.filter((l) => (qty[l.product] ?? 0) > 0);
  // Unpaid balance on the invoice is reduced first (server does the same)
  const dueP = toPaise(sale.balanceDue ?? 0);

  const reset = () => {
    setQty({});
    setDamaged({});
    setReason("");
    setMethod(sale.paymentMethod);
  };

  const submit = () => {
    createReturn.mutate(
      {
        saleId: sale._id,
        items: chosen.map((l) => ({
          product: l.product,
          quantity: qty[l.product],
          restock: !damaged[l.product],
        })),
        reason: reason.trim(),
        refundMethod: method,
      },
      {
        onSuccess: ({ creditNote }) => {
          toast.success(`Credit note ${creditNote.creditNoteNumber} issued for ${formatINR(creditNote.total)}`);
          reset();
          onOpenChange(false);
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't process the return")),
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return items</DialogTitle>
          <DialogDescription>
            Against invoice <span className="font-mono">{sale.invoiceNumber}</span>. A credit note is issued for
            the returned goods.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Items</Label>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={selectAll}>
              Return everything left
            </Button>
          </div>
          {lines.map((l) => {
            const q = qty[l.product] ?? 0;
            return (
              <div
                key={l.product}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  q > 0 ? "border-primary/40 bg-primary/5" : "border-border/60",
                  l.left === 0 && "opacity-50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(l.unitPrice)} · sold {l.quantity}
                      {l.returnedQuantity ? ` · ${l.returnedQuantity} already returned` : ""}
                    </p>
                  </div>
                  {l.left > 0 ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLineQty(l.product, q - 1, l.left)}
                        disabled={q <= 0}
                        aria-label={`Return one fewer ${l.name}`}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={q}
                        min={0}
                        max={l.left}
                        onChange={(e) => setLineQty(l.product, parseInt(e.target.value, 10), l.left)}
                        className="h-7 w-14 px-1 text-center text-sm"
                        aria-label={`Quantity of ${l.name} to return`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLineQty(l.product, q + 1, l.left)}
                        disabled={q >= l.left}
                        aria-label={`Return one more ${l.name}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">All returned</span>
                  )}
                </div>
                {q > 0 && (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                        checked={!!damaged[l.product]}
                        onChange={(e) => setDamaged((d) => ({ ...d, [l.product]: e.target.checked }))}
                      />
                      Damaged — don't put back in stock
                    </label>
                    <span className="font-medium tabular-nums">{formatINR(toRupees(refundForLine(l, q)))}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div className="space-y-1.5">
            <Label htmlFor="return-reason">Reason</Label>
            <Textarea
              id="return-reason"
              rows={2}
              placeholder="e.g. Damaged in transit, wrong item sent"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Refund via</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Credit note total (incl. GST)</span>
            <span className="text-lg font-semibold tabular-nums">{formatINR(toRupees(refundPaise))}</span>
          </div>
          {dueP > 0 && refundPaise > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatINR(toRupees(Math.min(dueP, refundPaise)))} comes off the unpaid balance
              {refundPaise > dueP ? (
                <>
                  ; refund <span className="font-medium text-foreground">{formatINR(toRupees(refundPaise - dueP))}</span>
                </>
              ) : (
                "; nothing to pay back"
              )}
              .
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={createReturn.isPending || chosen.length === 0 || reason.trim().length < 3}
          >
            {createReturn.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
