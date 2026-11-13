import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, IndianRupee } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenBills, useRecordSupplierPayment } from "@/hooks/useDocuments";
import { formatINR, toPaise, toRupees } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";

const METHODS = [
  { value: "UPI", label: "UPI" },
  { value: "BANK", label: "Bank transfer (NEFT/RTGS/IMPS)" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

/**
 * Pay a supplier. Applied to their bills due first; the dialog shows
 * exactly how before saving.
 */
export default function SupplierPaymentDialog({
  vendor,
  open,
  onOpenChange,
}: {
  vendor: { _id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: invoices, isLoading } = useOpenBills(open ? vendor?._id : undefined);
  const record = useRecordSupplierPayment();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const totalDueP = (invoices ?? []).reduce((s, i) => s + toPaise(i.balanceDue), 0);
  const amountP = amount.trim() === "" ? totalDueP : toPaise(Number(amount));

  // Due first — same rule as the server
  const plan = useMemo(
    () =>
      (invoices ?? []).reduce<Array<{ inv: (typeof invoices & object)[number]; p: number; left: number }>>(
        (acc, inv) => {
          const left = acc.length ? acc[acc.length - 1].left : amountP;
          const p = Math.max(0, Math.min(left, toPaise(inv.balanceDue)));
          return [...acc, { inv, p, left: left - p }];
        },
        []
      ),
    [invoices, amountP]
  );

  const problem =
    !amountP || amountP <= 0
      ? "Enter the amount paid"
      : amountP > totalDueP
        ? `More than the ${formatINR(toRupees(totalDueP))} owed`
        : null;

  const reset = () => {
    setAmount("");
    setMethod("BANK");
    setReference("");
    setDate(format(new Date(), "yyyy-MM-dd"));
  };

  const submit = () => {
    if (!vendor) return;
    const today = format(new Date(), "yyyy-MM-dd");
    record.mutate(
      {
        vendor: vendor._id,
        amount: toRupees(amountP),
        method,
        reference: reference.trim(),
        // Today → the exact time; another day → noon that day
        paidAt: date === today ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString(),
      },
      {
        onSuccess: (payment) => {
          toast.success(`Payment ${payment.paymentNumber} recorded: ${formatINR(payment.amount)}`);
          reset();
          onOpenChange(false);
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't record the payment")),
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay supplier</DialogTitle>
          <DialogDescription>
            To {vendor?.name}. Applied to the bills due first.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : totalDueP === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing is owed to this supplier.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <div className="relative">
                  <IndianRupee className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pay-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    placeholder={toRupees(totalDueP).toFixed(2)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-7 tabular-nums"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">We owe {formatINR(toRupees(totalDueP))}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Paid on</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={date}
                  max={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Method</Label>
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
              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">Reference</Label>
                <Input
                  id="pay-ref"
                  placeholder={method === "CHEQUE" ? "Cheque no." : "UTR / txn id"}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Will settle</p>
              <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                {plan.map(({ inv, p }) => (
                  <div key={inv._id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-xs">{inv.supplierInvoiceNo} <span className="text-muted-foreground">· {inv.billNumber}</span></p>
                      <p className="text-[11px] text-muted-foreground">
                        Due {formatINR(inv.balanceDue)}
                        {inv.daysOverdue > 0 && (
                          <span className="text-red-600 dark:text-red-400"> · {inv.daysOverdue}d overdue</span>
                        )}
                      </p>
                    </div>
                    <span className={p > 0 ? "font-medium tabular-nums" : "text-xs text-muted-foreground"}>
                      {p > 0 ? formatINR(toRupees(p)) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {problem && amount.trim() !== "" && <p className="text-sm text-destructive">{problem}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={record.isPending || !!problem || totalDueP === 0}>
            {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {amountP > 0 && !problem ? formatINR(toRupees(amountP)) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
