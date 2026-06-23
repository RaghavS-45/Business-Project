import { usePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, PackageCheck } from "lucide-react";

interface Props {
  poId: string;
  onStatusChange: (
    id: string,
    status: "approved" | "rejected" | "received",
    poNumber: string
  ) => void;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">Pending</Badge>;
    case "approved":
      return <Badge className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">Approved</Badge>;
    case "received":
      return <Badge className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Received</Badge>;
    case "rejected":
      return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export default function PurchaseOrderDetail({ poId, onStatusChange }: Props) {
  const { data: po, isLoading } = usePurchaseOrder(poId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!po) return null;

  const totalAmount = po.items?.reduce(
    (sum: number, item: { quantity: number; unitCost: number }) =>
      sum + item.quantity * item.unitCost,
    0
  ) ?? 0;

  return (
    <div className="space-y-5">
      {/* Status + metadata */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Status</p>
          {statusBadge(po.status)}
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Vendor</p>
          <p className="font-medium">{po.vendor?.name || "—"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-muted-foreground">
            {new Date(po.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        {po.expectedDelivery && (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Expected delivery</p>
            <p className="text-muted-foreground">
              {new Date(po.expectedDelivery).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        )}
        {po.receivedAt && (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Received on</p>
            <p className="text-emerald-400 text-xs">
              {new Date(po.receivedAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        )}
      </div>

      {/* Vendor info */}
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm space-y-1">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Vendor details</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {po.vendor?.contactPerson && (
            <>
              <span className="text-muted-foreground">Contact person</span>
              <span>{po.vendor.contactPerson}</span>
            </>
          )}
          {po.vendor?.email && (
            <>
              <span className="text-muted-foreground">Email</span>
              <span>{po.vendor.email}</span>
            </>
          )}
          {po.vendor?.phone && (
            <>
              <span className="text-muted-foreground">Phone</span>
              <span>{po.vendor.phone}</span>
            </>
          )}
          {po.vendor?.paymentTerms && (
            <>
              <span className="text-muted-foreground">Payment terms</span>
              <span>{po.vendor.paymentTerms}</span>
            </>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 bg-muted/30">
              <TableHead className="text-xs font-semibold">Product</TableHead>
              <TableHead className="text-xs font-semibold">SKU</TableHead>
              <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
              <TableHead className="text-xs font-semibold text-right">Unit cost</TableHead>
              <TableHead className="text-xs font-semibold text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.items?.map(
              (item: {
                _id: string;
                productName: string;
                productSku: string;
                quantity: number;
                unitCost: number;
                product?: { stock: number };
              }) => (
                <TableRow key={item._id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.productSku}
                  </TableCell>
                  <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    ₹{item.unitCost.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    ₹{(item.quantity * item.unitCost).toLocaleString("en-IN")}
                  </TableCell>
                </TableRow>
              )
            )}
            <TableRow className="bg-muted/20 border-border/30">
              <TableCell colSpan={4} className="text-right text-sm font-semibold">
                Total
              </TableCell>
              <TableCell className="text-right text-sm font-bold">
                ₹{totalAmount.toLocaleString("en-IN")}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
          <p className="text-sm text-muted-foreground">{po.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {po.status === "pending" && (
          <>
            <Button
              size="sm"
              className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
              onClick={() => onStatusChange(po._id, "approved", po.poNumber)}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => onStatusChange(po._id, "rejected", po.poNumber)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </>
        )}
        {po.status === "approved" && (
          <Button
            size="sm"
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
            onClick={() => onStatusChange(po._id, "received", po.poNumber)}
          >
            <PackageCheck className="mr-2 h-4 w-4" />
            Mark as received — update inventory
          </Button>
        )}
        {po.status === "received" && (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <PackageCheck className="h-4 w-4" />
            Inventory was updated when this PO was received
          </p>
        )}
      </div>
    </div>
  );
}