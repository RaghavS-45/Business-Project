import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInvoiceChallan, type Challan } from "@/hooks/useDocuments";
import { formatINR } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";

const METHODS = [
  { value: "CREDIT", label: "Credit (pay later)" },
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

/**
 * Raise the invoice for a delivery challan. The server prices it again
 * with today's rules; stock is not taken a second time.
 */
export default function InvoiceChallanDialog({
  challan,
  open,
  onOpenChange,
  onInvoiced,
}: {
  challan: Challan | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInvoiced?: (invoiceNumber: string) => void;
}) {
  const invoice = useInvoiceChallan();
  const [method, setMethod] = useState("CREDIT");
  const [paid, setPaid] = useState("");

  const paidNum = paid.trim() === "" ? null : Number(paid);
  const total = challan?.grandTotal ?? 0;
  const problem = paidNum !== null && (paidNum < 0 || paidNum > total) ? `Enter between ₹0 and ${formatINR(total)}` : null;

  const submit = () => {
    if (!challan || problem) return;
    invoice.mutate(
      { id: challan._id, paymentMethod: method, amountPaid: method !== "CREDIT" && paidNum !== null ? paidNum : undefined },
      {
        onSuccess: (sale) => {
          toast.success(`Invoice ${sale.invoiceNumber} raised: ${formatINR(sale.grandTotal)}`);
          setPaid("");
          onOpenChange(false);
          onInvoiced?.(sale.invoiceNumber);
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't raise the invoice")),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Raise invoice</DialogTitle>
          <DialogDescription>
            For challan {challan?.challanNumber} to {challan?.buyer.name}. The goods already left, so stock won't change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            Challan value <span className="float-right font-semibold tabular-nums">{formatINR(total)}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
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
          {method !== "CREDIT" && (
            <div className="space-y-1.5">
              <Label htmlFor="inv-paid">Amount received</Label>
              <Input id="inv-paid" inputMode="decimal" placeholder={total.toFixed(2)} value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))} />
              <p className="text-[11px] text-muted-foreground">Leave blank if paid in full. Anything less goes on credit.</p>
            </div>
          )}
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          <p className="text-[11px] text-muted-foreground">
            The invoice uses today's prices for this customer; it matches the challan unless prices changed since.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={invoice.isPending || !!problem}>
            {invoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Raise invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
