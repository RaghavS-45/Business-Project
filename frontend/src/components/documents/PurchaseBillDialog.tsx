import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LineItemsEditor from "@/components/documents/LineItemsEditor";
import { useCreatePurchaseBill, type PurchaseBill } from "@/hooks/useDocuments";
import { useVendors } from "@/hooks/useVendors";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { completeLines, newLine, num, type EditorLine } from "@/lib/editorLines";
import { getErrorMessage } from "@/lib/errors";

/** A purchase order as the bill form needs it. */
export interface BillablePo {
  _id: string;
  poNumber: string;
  status: string;
  vendor: string | { _id: string; name: string };
  items: Array<{ product: string | { _id: string }; quantity: number; unit?: string; unitCost: number }>;
}

const METHODS = [
  { value: "BANK", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

const idOf = (v: string | { _id: string }) => (typeof v === "string" ? v : v._id);

const linesFromPo = (po: BillablePo) =>
  po.items.map((i) => newLine({ product: idOf(i.product), unit: i.unit ?? "", quantity: String(i.quantity), unitCost: String(i.unitCost) }));

/**
 * Enter a supplier's bill: what came in, at what cost and GST. Posting it
 * adds the stock (unless its PO was already received) and what's unpaid to
 * what we owe the supplier.
 *
 * Mount with a `key` per PO so `fromPo` seeds the form afresh.
 */
export default function PurchaseBillDialog({
  open,
  onOpenChange,
  fromPo,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromPo?: BillablePo | null;
  onPosted?: (bill: PurchaseBill) => void;
}) {
  const create = useCreatePurchaseBill();
  const { data: vendorData } = useVendors({ limit: 100 });
  const vendors: Array<{ _id: string; name: string; paymentTermsDays?: number; gstin?: string }> = vendorData?.vendors ?? [];

  const [vendor, setVendor] = useState(fromPo ? idOf(fromPo.vendor) : "");
  const [poId, setPoId] = useState(fromPo?._id ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [billDate, setBillDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [lines, setLines] = useState<EditorLine[]>(() => (fromPo ? linesFromPo(fromPo) : [newLine()]));
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("BANK");
  const [notes, setNotes] = useState("");

  const { data: poData } = usePurchaseOrders(vendor ? { vendor, status: "approved", limit: 50 } : { limit: 1 });
  const openPos: BillablePo[] = vendor ? (poData?.purchaseOrders ?? []) : [];
  const poChoices = fromPo && !openPos.some((p) => p._id === fromPo._id) ? [fromPo, ...openPos] : openPos;

  const items = completeLines(lines).map((l) => ({
    product: l.product,
    quantity: num(l.quantity),
    unit: l.unit || undefined,
    unitCost: num(l.unitCost),
    discountPercent: num(l.discountPercent) || undefined,
    taxPercent: l.taxPercent.trim() === "" ? undefined : num(l.taxPercent),
  }));
  const problem = !vendor
    ? "Choose the supplier"
    : !invoiceNo.trim()
      ? "Enter the supplier's invoice number"
      : !items.length
        ? "Add at least one item"
        : null;

  const reset = () => {
    setVendor("");
    setPoId("");
    setInvoiceNo("");
    setBillDate(format(new Date(), "yyyy-MM-dd"));
    setLines([newLine()]);
    setPaid("");
    setMethod("BANK");
    setNotes("");
  };

  const submit = () => {
    if (problem) return;
    const paidNum = num(paid);
    create.mutate(
      {
        vendor,
        supplierInvoiceNo: invoiceNo.trim(),
        billDate: new Date(`${billDate}T12:00:00`).toISOString(),
        purchaseOrder: poId || undefined,
        items,
        amountPaid: paidNum || undefined,
        paymentMethod: paidNum > 0 ? method : undefined,
        notes: notes.trim(),
      },
      {
        onSuccess: (bill) => {
          toast.success(
            `Bill ${bill.billNumber} posted${bill.stockAdded ? " · stock added" : ""}${bill.balanceDue > 0 ? ` · ₹${bill.balanceDue.toLocaleString("en-IN")} to pay` : ""}`
          );
          reset();
          onOpenChange(false);
          onPosted?.(bill);
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't post the bill")),
      }
    );
  };

  const terms = vendors.find((v) => v._id === vendor)?.paymentTermsDays;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enter purchase bill</DialogTitle>
          <DialogDescription>Copy the supplier's invoice. Costs are before GST; GST is taken as input credit.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Supplier</Label>
              <Select
                value={vendor || undefined}
                onValueChange={(v) => {
                  setVendor(v);
                  setPoId("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose supplier" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v._id} value={v._id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-no">Supplier invoice no.</Label>
              <Input id="bill-no" placeholder="e.g. SI/2026/118" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-date">Bill date</Label>
              <Input id="bill-date" type="date" max={format(new Date(), "yyyy-MM-dd")} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </div>
          </div>

          {vendor && poChoices.length > 0 && (
            <div className="space-y-1.5">
              <Label>Against purchase order</Label>
              <Select
                value={poId || "none"}
                onValueChange={(v) => {
                  const id = v === "none" ? "" : v;
                  setPoId(id);
                  const po = poChoices.find((p) => p._id === id);
                  if (po) setLines(linesFromPo(po));
                }}
              >
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {poChoices.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.poNumber} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The PO is marked received when the bill is posted; edit the lines if the delivery differs.
              </p>
            </div>
          )}

          <LineItemsEditor mode="buy" lines={lines} onChange={setLines} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-paid">Paid now</Label>
              <Input id="bill-paid" inputMode="decimal" placeholder="0 (all on credit)" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))} />
              <p className="text-[11px] text-muted-foreground">
                The rest is due in {terms ?? 30} days (supplier's terms).
              </p>
            </div>
            {num(paid) > 0 && (
              <div className="space-y-1.5">
                <Label>Paid by</Label>
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
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bill-notes">Notes</Label>
              <Input id="bill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !!problem} title={problem ?? undefined}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
