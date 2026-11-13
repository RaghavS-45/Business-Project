import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, CheckCircle, FileText, Loader2, PackageCheck, Pencil, ReceiptText, Trash2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PoStatusBadge from "@/components/purchaseOrders/PoStatusBadge";
import {
  useDeletePurchaseOrder,
  usePurchaseOrder,
  useUpdatePurchaseOrderStatus,
  type PurchaseOrder,
} from "@/hooks/usePurchaseOrders";
import { usePurchaseBills } from "@/hooks/useDocuments";
import { useShowPdf } from "@/hooks/useShowPdf";
import { formatINR, formatPrice } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Confirm = "reject" | "delete" | "receive" | null;

/** One purchase order: where it is in the process, and the next step. */
export default function PurchaseOrderView({
  id,
  onClose,
  onEdit,
}: {
  id: string | undefined;
  onClose: () => void;
  onEdit: (po: PurchaseOrder) => void;
}) {
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: billData } = usePurchaseBills({ search: po?.poNumber }, !!po);
  const bill = po ? billData?.bills.find((b) => b.poNumber === po.poNumber && b.status === "POSTED") : undefined;
  const setStatus = useUpdatePurchaseOrderStatus();
  const remove = useDeletePurchaseOrder();
  const { show, loading: pdfLoading } = useShowPdf();
  const [confirm, setConfirm] = useState<Confirm>(null);

  const move = (status: "approved" | "rejected" | "received") =>
    po &&
    setStatus.mutate(
      { id: po._id, status },
      {
        onSuccess: () => {
          setConfirm(null);
          toast.success(
            status === "approved"
              ? `${po.poNumber} approved — send it to ${po.vendor.name}`
              : status === "received"
                ? `${po.poNumber} received — stock updated`
                : `${po.poNumber} rejected`
          );
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't update the purchase order")),
      }
    );

  const doDelete = () =>
    po &&
    remove.mutate(po._id, {
      onSuccess: () => {
        toast.success(`${po.poNumber} deleted`);
        onClose();
      },
      onError: (e) => toast.error(getErrorMessage(e, "Couldn't delete the purchase order")),
    });

  const steps = po
    ? [
        { label: "Created", done: true, when: po.createdAt },
        { label: "Approved", done: ["approved", "received"].includes(po.status), when: po.approvedAt, failed: po.status === "rejected" },
        { label: "Goods received", done: po.status === "received", when: po.receivedAt },
        { label: "Bill entered", done: !!bill, when: bill?.billDate },
      ]
    : [];
  const late = po?.status === "approved" && po.expectedDelivery && new Date(po.expectedDelivery) < new Date(new Date().toDateString());
  const busy = setStatus.isPending || remove.isPending;

  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => {
        if (!o) {
          setConfirm(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        {isLoading || !po ? (
          <>
            <DialogTitle className="sr-only">Loading</DialogTitle>
            <Skeleton className="h-64 w-full" />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{po.poNumber}</span>
                <PoStatusBadge status={po.status} />
              </DialogTitle>
              <DialogDescription>
                To {po.vendor.name}
                {po.vendor.phone ? ` · ${po.vendor.phone}` : ""} · created {format(new Date(po.createdAt), "d MMM yyyy")}
                {po.createdBy?.name ? ` by ${po.createdBy.name}` : ""}
              </DialogDescription>
            </DialogHeader>

            {/* Progress */}
            <ol className="grid grid-cols-4 gap-1" aria-label="Progress">
              {steps.map((s, i) => (
                <li key={s.label} className="flex flex-col gap-1.5">
                  <div className={cn("h-1.5 rounded-full", s.failed ? "bg-red-500/70" : s.done ? "bg-primary" : "bg-muted")} />
                  <div className="flex items-center gap-1 text-[11px]">
                    {s.done ? <Check className="h-3 w-3 text-primary" /> : s.failed ? <XCircle className="h-3 w-3 text-red-500" /> : <span className="text-muted-foreground">{i + 1}.</span>}
                    <span className={cn(s.done ? "font-medium" : "text-muted-foreground")}>{s.failed ? "Rejected" : s.label}</span>
                  </div>
                  {s.when && s.done && <span className="text-[10px] text-muted-foreground">{format(new Date(s.when), "d MMM")}</span>}
                </li>
              ))}
            </ol>

            {po.expectedDelivery && po.status !== "rejected" && (
              <p className={cn("text-sm", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                Needed by {format(new Date(po.expectedDelivery), "EEE, d MMM yyyy")}
                {late && " — overdue, follow up with the supplier"}
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-right text-xs">Qty</TableHead>
                    <TableHead className="text-right text-xs">Cost</TableHead>
                    <TableHead className="text-right text-xs">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items.map((it) => {
                    const p = typeof it.product === "string" ? null : it.product;
                    return (
                      <TableRow key={it._id}>
                        <TableCell className="py-2">
                          <p className="text-sm font-medium">{it.productName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {it.productSku}
                            {it.unitSize && it.unitSize !== 1 ? ` · ${it.unit} of ${it.unitSize}${p?.unit ? ` ${p.unit}` : ""}` : ""}
                            {p && po.status !== "received" ? ` · in stock ${p.stock}${p.unit ? ` ${p.unit}` : ""}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                          {it.quantity} {it.unit}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatPrice(it.unitCost)}</TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">{formatINR(it.quantity * it.unitCost)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={3} className="text-right text-sm font-semibold">
                      Total <span className="font-normal text-muted-foreground">(before GST)</span>
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums">{formatINR(po.totalAmount)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {po.notes && <p className="text-sm text-muted-foreground">Notes: {po.notes}</p>}

            {bill && (
              <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
                Billed as{" "}
                <Link to={`/purchase-bills?bill=${bill._id}`} className="font-medium text-primary hover:underline">
                  {bill.supplierInvoiceNo}
                </Link>{" "}
                · {formatINR(bill.grandTotal)} incl. GST
                {bill.balanceDue > 0 ? ` · ${formatINR(bill.balanceDue)} to pay` : " · paid"}
              </p>
            )}

            {/* In-place confirmation for the steps that can't be undone */}
            {confirm && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm">
                  {confirm === "reject" && `Reject ${po.poNumber}? It can't be approved after that.`}
                  {confirm === "delete" && `Delete ${po.poNumber}? This can't be undone.`}
                  {confirm === "receive" &&
                    "Add these goods to stock now and enter the supplier's bill later? (If you have the bill, use “Goods arrived — enter bill” instead.)"}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    variant={confirm === "receive" ? "default" : "destructive"}
                    disabled={busy}
                    onClick={() => (confirm === "delete" ? doDelete() : move(confirm === "reject" ? "rejected" : "received"))}
                  >
                    {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {confirm === "reject" ? "Reject" : confirm === "delete" ? "Delete" : "Add to stock"}
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => show("po", `/purchase-orders/${po._id}/pdf`, po.poNumber)} disabled={pdfLoading === "po"}>
                  {pdfLoading === "po" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                  PDF for supplier
                </Button>
                {po.status === "pending" && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => onEdit(po)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm("reject")}>
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm("delete")} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {po.status === "approved" && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirm("receive")}>
                    <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                    Received, bill later
                  </Button>
                )}
              </div>
              {po.status === "pending" && (
                <Button size="sm" onClick={() => move("approved")} disabled={busy}>
                  {setStatus.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1.5 h-3.5 w-3.5" />}
                  Approve
                </Button>
              )}
              {(po.status === "approved" || (po.status === "received" && !bill)) && (
                <Button size="sm" asChild>
                  <Link to={`/purchase-bills?po=${po._id}`}>
                    <ReceiptText className="mr-1.5 h-3.5 w-3.5" />
                    {po.status === "approved" ? "Goods arrived — enter bill" : "Enter the bill"}
                  </Link>
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
