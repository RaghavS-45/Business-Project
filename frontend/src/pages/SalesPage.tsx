import { useState } from "react";
import { useSales, useSale, useRefund } from "@/hooks/useSales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Eye, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SalesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const { data, isLoading } = useSales({
    page,
    limit: 15,
    status: status === "All" ? undefined : status,
    paymentMethod: paymentFilter === "All" ? undefined : paymentFilter,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const { data: saleDetail, isLoading: detailLoading } = useSale(selectedId);
  const refundMutation = useRefund();

  const sales = data?.sales || data?.docs || [];
  const total = data?.total || data?.totalDocs || 0;
  const totalPages = data?.totalPages || Math.ceil(total / 15) || 1;

  const formatCurrency = (v: number) =>
    `₹${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const statusColor: Record<string, string> = {
    COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    REFUNDED: "bg-red-500/10 text-red-400 border-red-500/20",
    VOID: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  const handleRefund = () => {
    if (!selectedId || !refundReason.trim()) {
      toast.error("Please provide a reason for the refund");
      return;
    }
    refundMutation.mutate(
      { id: selectedId, reason: refundReason },
      {
        onSuccess: () => {
          toast.success("Refund processed");
          setRefundOpen(false);
          setRefundReason("");
          setSelectedId(undefined);
        },
        onError: () => toast.error("Failed to process refund"),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage all transactions ({total} total)
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Status</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
            <SelectItem value="VOID">Void</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Payments</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="CARD">Card</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="text-xs font-semibold">Invoice</TableHead>
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold">Items</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold">Payment</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map(
                (sale: {
                  _id: string;
                  invoiceNumber: string;
                  createdAt: string;
                  items: Array<unknown>;
                  grandTotal: number;
                  paymentMethod: string;
                  status: string;
                }) => (
                  <TableRow key={sale._id} className="border-border/30 hover:bg-muted/20">
                    <TableCell className="text-xs font-mono font-medium">
                      {sale.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(sale.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(sale.grandTotal)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {sale.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusColor[sale.status] || ""}`}
                      >
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedId(sale._id)}
                        className="text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              )}
              {sales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No sales found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedId && !refundOpen} onOpenChange={(open) => !open && setSelectedId(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale Details</DialogTitle>
            <DialogDescription>
              {saleDetail?.invoiceNumber || "Loading..."}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : saleDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(saleDetail.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`text-xs ${statusColor[saleDetail.status] || ""}`}>
                    {saleDetail.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment</p>
                  <p className="font-medium">{saleDetail.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cashier</p>
                  <p className="font-medium">{saleDetail.cashier?.name || "—"}</p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Line Items</p>
                <div className="space-y-2">
                  {saleDetail.items?.map(
                    (item: { name: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.sku} — ₹{item.unitPrice} × {item.quantity}
                          </p>
                        </div>
                        <p className="font-medium">{formatCurrency(item.lineTotal)}</p>
                      </div>
                    )
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(saleDetail.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatCurrency(saleDetail.taxTotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>-{formatCurrency(saleDetail.discountTotal)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2">
                  <span>Grand Total</span>
                  <span className="text-indigo-400">{formatCurrency(saleDetail.grandTotal)}</span>
                </div>
              </div>

              {saleDetail.receiptUrl && (
                <a
                  href={saleDetail.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-indigo-400 hover:underline"
                >
                  View Receipt PDF →
                </a>
              )}
            </div>
          ) : null}

          <DialogFooter>
            {saleDetail?.status === "COMPLETED" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRefundOpen(true)}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Process Refund
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              This will reverse the sale and restore stock.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for refund..."
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRefund}
              disabled={refundMutation.isPending || !refundReason.trim()}
            >
              {refundMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
