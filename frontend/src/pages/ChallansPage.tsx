import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileText, Loader2, Plus, ReceiptText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/sales/StatusBadge";
import DocLines from "@/components/documents/DocLines";
import SellDocumentDialog from "@/components/documents/SellDocumentDialog";
import InvoiceChallanDialog from "@/components/documents/InvoiceChallanDialog";
import { EmptyList, ListToolbar, Pager } from "@/components/documents/ListBits";
import { useCancelChallan, useChallan, useChallans } from "@/hooks/useDocuments";
import { useDebouncedValue } from "@/hooks/usePos";
import { useShowPdf } from "@/hooks/useShowPdf";
import { formatINR } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";

const TABS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "To invoice" },
  { value: "INVOICED", label: "Invoiced" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Goods sent out ahead of the invoice. */
export default function ChallansPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { value: search, debouncedValue: q, onChange: setSearch } = useDebouncedValue(250);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  // Links: ?new=1, ?challan=<id>
  const [params] = useSearchParams();
  const linkKey = params.toString();
  const [handledLink, setHandledLink] = useState("");
  if (linkKey && linkKey !== handledLink) {
    setHandledLink(linkKey);
    if (params.get("new")) setCreating(true);
    if (params.get("challan")) setSelectedId(params.get("challan") ?? undefined);
  }

  const { data, isLoading } = useChallans({ page, status: status || undefined, search: q || undefined });
  const rows = data?.challans ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Delivery Challans</h1>
          <p className="mt-1 text-sm text-muted-foreground">Goods dispatched before the invoice. Stock leaves with the challan.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New challan
        </Button>
      </div>

      <ListToolbar
        tabs={TABS}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Challan, invoice or customer"
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
            title={status || q ? "No challans match" : "No challans yet"}
            hint="Send goods with a delivery challan when the invoice comes later, e.g. after the buyer checks the delivery."
            action={
              !status && !q ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New challan
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Challan</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Items</TableHead>
                  <TableHead className="text-right text-xs">Value</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r._id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(r._id)}>
                    <TableCell>
                      <p className="font-mono text-xs font-medium">{r.challanNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(r.createdAt), "d MMM yyyy, h:mm a")}</p>
                    </TableCell>
                    <TableCell className="text-sm">{r.buyer.name}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {r.items.length} line{r.items.length === 1 ? "" : "s"}
                      {r.vehicleNumber ? ` · ${r.vehicleNumber}` : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatINR(r.grandTotal)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.invoiceNumber && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{r.invoiceNumber}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager page={page} totalPages={data?.pagination.totalPages ?? 1} total={data?.pagination.total ?? 0} onPage={setPage} />
      </div>

      <SellDocumentDialog kind="challan" open={creating} onOpenChange={setCreating} onCreated={(d) => setSelectedId(d._id)} />
      <ChallanDetail id={selectedId} onClose={() => setSelectedId(undefined)} />
    </div>
  );
}

function ChallanDetail({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { data: challan, isLoading } = useChallan(id);
  const cancel = useCancelChallan();
  const { show, loading: pdfLoading } = useShowPdf();
  const [invoicing, setInvoicing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const doCancel = () =>
    challan &&
    cancel.mutate(
      { id: challan._id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Challan ${challan.challanNumber} cancelled; stock restored`);
          setCancelling(false);
          setReason("");
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't cancel the challan")),
      }
    );

  return (
    <>
      <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
          {isLoading || !challan ? (
            <>
              <DialogTitle className="sr-only">Loading</DialogTitle>
              <Skeleton className="h-64 w-full" />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{challan.challanNumber}</span>
                  <StatusBadge status={challan.status} />
                </DialogTitle>
                <DialogDescription>
                  To {challan.buyer.name} · {format(new Date(challan.createdAt), "d MMM yyyy, h:mm a")}
                  {challan.quoteNumber ? ` · from ${challan.quoteNumber}` : ""}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid gap-2 rounded-lg bg-muted/30 p-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Deliver to</dt>
                  <dd>{challan.deliveryAddress || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Vehicle</dt>
                  <dd className="font-mono">{challan.vehicleNumber || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Transporter</dt>
                  <dd>{challan.transporter || "—"}</dd>
                </div>
              </dl>

              {challan.status === "INVOICED" && challan.sale && (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
                  Invoiced as{" "}
                  <Link className="font-mono font-medium text-primary hover:underline" to={`/sales?sale=${challan.sale}`}>
                    {challan.invoiceNumber}
                  </Link>
                </p>
              )}
              {challan.status === "CANCELLED" && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Cancelled: {challan.cancelReason}</p>
              )}

              <DocLines items={challan.items} totals={challan} totalLabel="Value of goods" />

              {cancelling && (
                <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                  <p className="text-sm">The goods come back into stock. Why is it cancelled?</p>
                  <Input autoFocus placeholder="e.g. Buyer refused delivery" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                      Keep challan
                    </Button>
                    <Button variant="destructive" size="sm" onClick={doCancel} disabled={cancel.isPending || reason.trim().length < 3}>
                      {cancel.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Cancel challan
                    </Button>
                  </div>
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => show("c", `/challans/${challan._id}/pdf`, challan.challanNumber)}
                  disabled={pdfLoading === "c"}
                >
                  {pdfLoading === "c" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                  PDF
                </Button>
                {challan.status === "OPEN" && !cancelling && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setCancelling(true)}>
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                      Goods returned
                    </Button>
                    <Button size="sm" onClick={() => setInvoicing(true)}>
                      <ReceiptText className="mr-1.5 h-3.5 w-3.5" />
                      Raise invoice
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <InvoiceChallanDialog challan={challan ?? null} open={invoicing} onOpenChange={setInvoicing} />
    </>
  );
}
