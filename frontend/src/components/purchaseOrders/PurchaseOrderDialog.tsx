import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import LineItemsEditor from "@/components/documents/LineItemsEditor";
import {
  useCreatePurchaseOrder,
  useReorderSuggestions,
  useUpdatePurchaseOrder,
  type PurchaseOrder,
  type ReorderSuggestion,
} from "@/hooks/usePurchaseOrders";
import { useVendors } from "@/hooks/useVendors";
import { completeLines, newLine, num, type EditorLine } from "@/lib/editorLines";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** What the dialog starts from: a blank PO, low-stock suggestions, or a PO being edited. */
export interface PoDraft {
  vendor?: { _id: string; name: string } | null;
  suggestions?: ReorderSuggestion[];
  editing?: PurchaseOrder;
}

const fromSuggestion = (s: ReorderSuggestion) =>
  newLine({ product: s.product, unit: s.unit, quantity: String(s.quantity), unitCost: String(s.unitCost) });

const productId = (p: PurchaseOrder["items"][number]["product"]) => (typeof p === "string" ? p : p._id);

/**
 * Create or edit a purchase order. Mount with a `key` per draft so the
 * form starts from that draft.
 */
export default function PurchaseOrderDialog({
  open,
  onOpenChange,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: PoDraft;
  onSaved?: (po: PurchaseOrder) => void;
}) {
  const editing = draft?.editing;
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const { data: suggestions = [] } = useReorderSuggestions(open);

  const [vendor, setVendor] = useState<{ _id: string; name: string } | null>(
    editing ? { _id: editing.vendor._id, name: editing.vendor.name } : (draft?.vendor ?? null)
  );
  const [lines, setLines] = useState<EditorLine[]>(() =>
    editing
      ? editing.items.map((i) =>
          newLine({ product: productId(i.product), unit: i.unit ?? "", quantity: String(i.quantity), unitCost: String(i.unitCost) })
        )
      : draft?.suggestions?.length
        ? draft.suggestions.map(fromSuggestion)
        : [newLine()]
  );
  const [expected, setExpected] = useState(editing?.expectedDelivery ? format(new Date(editing.expectedDelivery), "yyyy-MM-dd") : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  // Low-stock items from this supplier that aren't on the order yet
  const onOrder = new Set(lines.map((l) => l.product));
  const addable = suggestions.filter((s) => !onOrder.has(s.product) && (!vendor || !s.vendor || s.vendor._id === vendor._id));

  const items = completeLines(lines).map((l) => ({
    product: l.product,
    quantity: num(l.quantity),
    unit: l.unit || undefined,
    unitCost: num(l.unitCost),
  }));
  const problem = !vendor ? "Choose the supplier" : !items.length ? "Add at least one item" : null;
  const pending = create.isPending || update.isPending;

  const submit = () => {
    if (problem || !vendor) return;
    const body = {
      vendor: vendor._id,
      items,
      notes: notes.trim(),
      expectedDelivery: expected || (editing ? null : undefined),
    };
    const done = (po: PurchaseOrder, verb: string) => {
      toast.success(`${po.poNumber} ${verb}`);
      onOpenChange(false);
      onSaved?.(po);
    };
    const fail = (e: unknown) => toast.error(getErrorMessage(e, "Couldn't save the purchase order"));
    if (editing) {
      update.mutate({ id: editing._id, ...body }, { onSuccess: (po) => done(po, "updated"), onError: fail });
    } else {
      create.mutate(body, { onSuccess: (po) => done(po, "created — approve it to send"), onError: fail });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.poNumber}` : "New purchase order"}</DialogTitle>
          <DialogDescription>
            Order in cartons, bags or loose units. Costs are before GST; stock comes in when the goods arrive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <VendorPicker value={vendor} onChange={setVendor} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-expected">Needed by</Label>
              <Input
                id="po-expected"
                type="date"
                min={format(new Date(), "yyyy-MM-dd")}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </div>
          </div>

          {addable.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{addable.length} low-stock item{addable.length === 1 ? "" : "s"}</span>
                <span className="text-muted-foreground">
                  {vendor ? ` usually bought from ${vendor.name}` : ""}: {addable.slice(0, 3).map((s) => s.name).join(", ")}
                  {addable.length > 3 ? "…" : ""}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setLines([...completeLines(lines), ...addable.map(fromSuggestion)])}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                Add them
              </Button>
            </div>
          )}

          <LineItemsEditor mode="order" lines={lines} onChange={setLines} />

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Notes for the supplier</Label>
            <Input id="po-notes" placeholder="e.g. Deliver to the back gate before noon" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !!problem} title={problem ?? undefined}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create purchase order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorPicker({ value, onChange }: { value: { _id: string; name: string } | null; onChange: (v: { _id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useVendors({ limit: 100 });
  const vendors: Array<{ _id: string; name: string; contactPerson?: string; paymentTermsDays?: number }> = data?.vendors ?? [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.name ?? "Search suppliers…"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Supplier name…" />
          <CommandList>
            <CommandEmpty>No supplier found. Add one on the Vendors page.</CommandEmpty>
            <CommandGroup>
              {vendors.map((v) => (
                <CommandItem
                  key={v._id}
                  value={`${v.name} ${v.contactPerson ?? ""}`}
                  onSelect={() => {
                    onChange({ _id: v._id, name: v.name });
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-3.5 w-3.5", value?._id === v._id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{v.name}</span>
                  {v.paymentTermsDays !== undefined && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{v.paymentTermsDays}d terms</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
