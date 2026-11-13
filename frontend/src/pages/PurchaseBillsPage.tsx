import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/sales/StatusBadge";
import DocLines from "@/components/documents/DocLines";
import PurchaseBillDialog from "@/components/documents/PurchaseBillDialog";
import { EmptyList, ListToolbar, Pager } from "@/components/documents/ListBits";
import { useCancelPurchaseBill, usePurchaseBill, usePurchaseBills } from "@/hooks/useDocuments";
import { usePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useDebouncedValue } from "@/hooks/usePos";
import { formatINR } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";

const TABS = [
  { value: "", label: "All" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Part paid" },
  { value: "PAID", label: "Paid" },
];

/** Supplier bills: stock in, input GST, and what we owe. */
export default function PurchaseBillsPage() {
  const [payment, setPayment] = useState("");
  const [page, setPage] = useState(1);
  const { value: search, debouncedValue: q, onChange: setSearch } = useDebouncedValue(250);
  const [creating, setCreating] = useState(false);
  const [poId, setPoId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();

  // Links: ?new=1, ?po=<id> (enter the bill for a purchase order), ?bill=<id>
  const [params] = useSearchParams();
  const linkKey = params.toString();
  const [handledLink, setHandledLink] = useState("");
  if (linkKey && linkKey !== handledLink) {
    setHandledLink(linkKey);
    if (params.get("new")) setCreating(true);
    if (params.get("po")) {
      setPoId(params.get("po") ?? undefined);
      setCreating(true);
    }
    if (params.get("bill")) setSelectedId(params.get("bill") ?? undefined);
  }
  const { data: po, isLoading: poLoading } = usePurchaseOrder(poId);

  const { data, isLoading } = usePurchaseBills({ page, paymentStatus: payment || undefined, search: q || undefined });
  const rows = data?.bills ?? [];
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Supplier invoices. Posting one adds the stock and what's unpaid to{" "}
            <Link to="/payables" className="text-primary hover:underline">
              payables
            </Link>
            .
          </p>
        </div>
        <Button
          onClick={() => {
            setPoId(undefined);
            setCreating(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Enter bill
        </Button>
      </div>

      <ListToolbar
        tabs={TABS}
        value={payment}
        onChange={(v) => {
          setPayment(v);
          setPage(1);
        }}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Bill no., supplier or PO"
      />

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <EmptyList
            title={payment || q ? "No bills match" : "No purchase bills yet"}
            hint="Enter each supplier invoice when the goods arrive. Stock, average cost and what you owe update together."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Bill</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-right text-xs">Total</TableHead>
                  <TableHead className="hidden text-right text-xs md:table-cell">To pay</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Due</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => {
                  const overdue = b.status === "POSTED" && b.balanceDue > 0 && b.dueDate && new Date(b.dueDate).getTime() < now;
                  return (
                    <TableRow key={b._id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(b._id)}>
                      <TableCell>
                        <p className="text-sm font-medium">{b.supplierInvoiceNo}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {b.billNumber} · {format(new Date(b.billDate), "d MMM yyyy")}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.supplier.name}
                        {b.poNumber && <p className="font-mono text-[10px] text-muted-foreground">{b.poNumber}</p>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{formatINR(b.grandTotal)}</TableCell>
                      <TableCell className="hidden text-right text-sm tabular-nums md:table-cell">
                        {b.balanceDue > 0 ? formatINR(b.balanceDue) : "—"}
                      </TableCell>
                      <TableCell className={`hidden text-xs md:table-cell ${overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                        {b.dueDate && b.balanceDue > 0 ? format(new Date(b.dueDate), "d MMM") : "—"}
                        {overdue && " · overdue"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status === "CANCELLED" ? "CANCELLED" : b.paymentStatus} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager page={page} totalPages={data?.pagination.totalPages ?? 1} total={data?.pagination.total ?? 0} onPage={setPage} />
      </div>

      {/* Wait for the PO before seeding the form from it */}
      {!(poId && poLoading) && (
        <PurchaseBillDialog
          key={po?._id ?? "new"}
          open={creating}
          onOpenChange={(o) => {
            setCreating(o);
            if (!o) setPoId(undefined);
          }}
          fromPo={poId ? po : null}
          onPosted={(b) => setSelectedId(b._id)}
        />
      )}
      <BillDetail id={selectedId} onClose={() => setSelectedId(undefined)} />
    </div>
  );
}

function BillDetail({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { data: bill, isLoading } = usePurchaseBill(id);
  const cancel = useCancelPurchaseBill();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const canCancel = bill && bill.status === "POSTED" && bill.amountPaid === bill.paidAtBill;

  const doCancel = () =>
    bill &&
    cancel.mutate(
      { id: bill._id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Bill ${bill.billNumber} cancelled`);
          setCancelling(false);
          setReason("");
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't cancel the bill")),
      }
    );

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        {isLoading || !bill ? (
          <>
              <DialogTitle className="sr-only">Loading</DialogTitle>
              <Skeleton className="h-64 w-full" />
            </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {bill.supplierInvoiceNo}
                <StatusBadge status={bill.status === "CANCELLED" ? "CANCELLED" : bill.paymentStatus} />
              </DialogTitle>
              <DialogDescription>
                {bill.supplier.name} · {format(new Date(bill.billDate), "d MMM yyyy")} · our ref {bill.billNumber}
                {bill.poNumber ? ` · ${bill.poNumber}` : ""}
                {!bill.stockAdded && " · stock was added when the PO was received"}
              </DialogDescription>
            </DialogHeader>

            <DocLines items={bill.items ?? []} totals={bill} totalLabel="Bill total" />

            <div className="rounded-lg border border-border/60">
              <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 text-sm">
                <span className="font-medium">Payments</span>
                <span className="tabular-nums">
                  Paid {formatINR(bill.amountPaid)}
                  {bill.balanceDue > 0 && (
                    <>
                      {" "}
                      · <span className="font-semibold">to pay {formatINR(bill.balanceDue)}</span>
                      {bill.dueDate && ` by ${format(new Date(bill.dueDate), "d MMM yyyy")}`}
                    </>
                  )}
                </span>
              </div>
              <ul className="divide-y divide-border/40 text-sm">
                {bill.paidAtBill > 0 && (
                  <li className="flex justify-between px-3 py-1.5">
                    <span className="text-muted-foreground">With the bill ({bill.paymentMethod})</span>
                    <span className="tabular-nums">{formatINR(bill.paidAtBill)}</span>
                  </li>
                )}
                {bill.payments?.map((p) => (
                  <li key={p._id} className="flex justify-between px-3 py-1.5">
                    <span className="text-muted-foreground">
                      <span className="font-mono text-xs">{p.paymentNumber}</span> · {format(new Date(p.paidAt), "d MMM yyyy")} · {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span className="tabular-nums">{formatINR(p.amount)}</span>
                  </li>
                ))}
                {bill.paidAtBill === 0 && !bill.payments?.length && <li className="px-3 py-2 text-xs text-muted-foreground">Nothing paid yet.</li>}
              </ul>
            </div>

            {bill.status === "CANCELLED" && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Cancelled: {bill.cancelReason}</p>}

            {cancelling && (
              <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                <p className="text-sm">
                  {bill.stockAdded ? "Its stock is taken back out" : "Stock stays (it came in with the PO)"} and it's removed from what you owe. Why?
                </p>
                <Input autoFocus placeholder="e.g. Entered twice" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                    Keep bill
                  </Button>
                  <Button variant="destructive" size="sm" onClick={doCancel} disabled={cancel.isPending || reason.trim().length < 3}>
                    {cancel.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Cancel bill
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/vendors/${bill.vendor}/statement`}>Supplier statement</Link>
              </Button>
              {canCancel && !cancelling && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setCancelling(true)}>
                  Cancel bill
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
