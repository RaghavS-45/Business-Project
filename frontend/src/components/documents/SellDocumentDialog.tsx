import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LineItemsEditor from "@/components/documents/LineItemsEditor";
import CustomerSelect from "@/components/documents/CustomerSelect";
import { useCreateChallan, useCreateQuotation, type Challan, type Quotation } from "@/hooks/useDocuments";
import { useStoreSettings } from "@/hooks/useSettings";
import { getTier } from "@/lib/loyalty";
import { getErrorMessage } from "@/lib/errors";
import { newLine, toSellLines, type BuyerCustomer, type EditorLine } from "@/lib/editorLines";

type Kind = "quotation" | "challan";

const COPY: Record<Kind, { title: string; description: string; submit: string }> = {
  quotation: {
    title: "New quotation",
    description: "A priced offer. No stock moves until it's billed or dispatched.",
    submit: "Create quotation",
  },
  challan: {
    title: "New delivery challan",
    description: "Goods leave now (stock is taken); raise the invoice later.",
    submit: "Create challan",
  },
};

/** Create a quotation or a delivery challan. */
export default function SellDocumentDialog({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (doc: Quotation | Challan) => void;
}) {
  const createQuote = useCreateQuotation();
  const createChallan = useCreateChallan();
  const { data: store } = useStoreSettings();
  const pending = createQuote.isPending || createChallan.isPending;

  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<BuyerCustomer | null>(null);
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [lines, setLines] = useState<EditorLine[]>(() => [newLine()]);
  const [validDays, setValidDays] = useState("15");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transporter, setTransporter] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setCustomerId("");
    setCustomer(null);
    setPartyName("");
    setPartyPhone("");
    setLines([newLine()]);
    setValidDays("15");
    setVehicleNumber("");
    setTransporter("");
    setDeliveryAddress("");
    setNotes("");
  };

  const items = toSellLines(lines);
  const other = customerId === "other";
  const problem = !customerId
    ? "Choose a customer"
    : other && !partyName.trim()
      ? "Enter who the quote is for"
      : !items.length
        ? "Add at least one item"
        : null;

  const done = (doc: Quotation | Challan, number: string) => {
    toast.success(`${kind === "quotation" ? "Quotation" : "Challan"} ${number} created`);
    reset();
    onOpenChange(false);
    onCreated?.(doc);
  };
  const fail = (e: unknown) => toast.error(getErrorMessage(e, `Couldn't create the ${kind}`));

  const submit = () => {
    if (problem) return;
    if (kind === "quotation") {
      createQuote.mutate(
        {
          ...(other ? { partyName: partyName.trim(), partyPhone: partyPhone.trim() || undefined } : { customer: customerId }),
          items,
          validDays: Number(validDays) || 15,
          notes: notes.trim(),
        },
        { onSuccess: (q) => done(q, q.quoteNumber), onError: fail }
      );
    } else {
      createChallan.mutate(
        {
          customer: customerId,
          items,
          vehicleNumber: vehicleNumber.trim(),
          transporter: transporter.trim(),
          deliveryAddress: deliveryAddress.trim(),
          notes: notes.trim(),
        },
        { onSuccess: (c) => done(c, c.challanNumber), onError: fail }
      );
    }
  };

  const copy = COPY[kind];
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-customer`}>{kind === "challan" ? "Deliver to" : "Quote for"}</Label>
              <CustomerSelect
                id={`${kind}-customer`}
                value={customerId}
                allowOther={kind === "quotation"}
                onChange={(id, c) => {
                  setCustomerId(id);
                  setCustomer(c);
                }}
              />
            </div>
            {kind === "quotation" ? (
              <div className="space-y-1.5">
                <Label htmlFor="quote-valid">Valid for (days)</Label>
                <Input id="quote-valid" inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/\D/g, ""))} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dc-vehicle">Vehicle no.</Label>
                  <Input id="dc-vehicle" placeholder="DL01AB1234" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dc-transporter">Transporter</Label>
                  <Input id="dc-transporter" value={transporter} onChange={(e) => setTransporter(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {other && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quote-party">Name</Label>
                <Input id="quote-party" placeholder="Shop or person" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-phone">Phone</Label>
                <Input id="quote-phone" inputMode="tel" value={partyPhone} onChange={(e) => setPartyPhone(e.target.value)} />
              </div>
            </div>
          )}
          {kind === "challan" && (
            <div className="space-y-1.5">
              <Label htmlFor="dc-address">Delivery address</Label>
              <Input
                id="dc-address"
                placeholder={customer ? "Customer's saved address" : ""}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
          )}

          <LineItemsEditor
            mode="sell"
            lines={lines}
            onChange={setLines}
            level={customer?.priceLevel ?? "RETAIL"}
            loyaltyPercent={customer ? getTier(customer.loyaltyPoints ?? 0).discount : 0}
            taxInclusive={Boolean(store?.pricesIncludeTax)}
            checkStock={kind === "challan"}
          />

          <div className="space-y-1.5">
            <Label htmlFor={`${kind}-notes`}>Notes</Label>
            <Input id={`${kind}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !!problem} title={problem ?? undefined}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
