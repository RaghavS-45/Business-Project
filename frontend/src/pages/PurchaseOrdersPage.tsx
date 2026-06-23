import { useState } from "react";
import {
  usePurchaseOrders,
  useUpdatePurchaseOrderStatus,
  useDeletePurchaseOrder,
} from "@/hooks/usePurchaseOrders";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  PackageCheck,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import PurchaseOrderForm from "@/components/purchaseOrders/PurchaseOrderForm";
import PurchaseOrderDetail from "../components/purchaseOrders/PurchaseOrderDetail";

type POStatus = "all" | "pending" | "approved" | "received" | "rejected";

const STATUS_OPTIONS: { label: string; value: POStatus }[] = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Received", value: "received" },
  { label: "Rejected", value: "rejected" },
];

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">Pending</Badge>;
    case "approved":
      return <Badge className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">Approved</Badge>;
    case "received":
      return <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Received</Badge>;
    case "rejected":
      return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

export default function PurchaseOrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<POStatus>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailPO, setDetailPO] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = usePurchaseOrders({
    page,
    limit: 15,
    status: statusFilter === "all" ? undefined : statusFilter,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const updateStatus = useUpdatePurchaseOrderStatus();
  const deletePO = useDeletePurchaseOrder();

  const purchaseOrders = data?.purchaseOrders || [];
  const total = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.totalPages || 1;

  const handleStatusChange = (
    id: string,
    status: "approved" | "rejected" | "received",
    poNumber: string
  ) => {
    const messages: Record<string, string> = {
      approved: `Approve "${poNumber}"?`,
      rejected: `Reject "${poNumber}"?`,
      received: `Mark "${poNumber}" as received? This will automatically update product stock.`,
    };
    if (!confirm(messages[status])) return;

    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => {
          const successMsg: Record<string, string> = {
            approved: `${poNumber} approved`,
            rejected: `${poNumber} rejected`,
            received: `${poNumber} received — inventory updated`,
          };
          toast.success(successMsg[status]);
          // Close detail dialog if open to show fresh table
          if (detailPO && (detailPO._id as string) === id) setDetailPO(null);
        },
        onError: () => toast.error("Failed to update status"),
      }
    );
  };

  const handleDelete = (id: string, poNumber: string) => {
    if (!confirm(`Delete "${poNumber}"? This cannot be undone.`)) return;
    deletePO.mutate(id, {
      onSuccess: () => toast.success(`${poNumber} deleted`),
      onError: () => toast.error("Failed to delete purchase order"),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} order{total !== 1 ? "s" : ""} — inventory updates automatically on receipt
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as POStatus);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
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
                <TableHead className="text-xs font-semibold">PO Number</TableHead>
                <TableHead className="text-xs font-semibold">Vendor</TableHead>
                <TableHead className="text-xs font-semibold text-center">Items</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders.map(
                (po: {
                  _id: string;
                  poNumber: string;
                  vendor: { _id: string; name: string };
                  items: unknown[];
                  status: string;
                  totalAmount: number;
                  createdAt: string;
                }) => (
                  <TableRow
                    key={po._id}
                    className="border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setDetailPO(po as unknown as Record<string, unknown>)}
                  >
                    <TableCell className="font-mono text-xs font-medium">
                      {po.poNumber}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {po.vendor?.name || "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {po.items.length}
                    </TableCell>
                    <TableCell>{statusBadge(po.status)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      ₹{(po.totalAmount || 0).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(po.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setDetailPO(po as unknown as Record<string, unknown>)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {po.status === "pending" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(po._id, "approved", po.poNumber)}
                              >
                                <CheckCircle className="mr-2 h-4 w-4 text-blue-400" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(po._id, "rejected", po.poNumber)}
                                className="text-destructive focus:text-destructive"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          {po.status === "approved" && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(po._id, "received", po.poNumber)}
                            >
                              <PackageCheck className="mr-2 h-4 w-4 text-emerald-400" />
                              Mark as received
                            </DropdownMenuItem>
                          )}
                          {po.status === "pending" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(po._id, po.poNumber)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              )}
              {purchaseOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No purchase orders found
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
            Page {page} of {totalPages} ({total} items)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <PurchaseOrderForm onSuccess={() => setCreateDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPO} onOpenChange={(open) => !open && setDetailPO(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">
              {detailPO?.poNumber as string}
            </DialogTitle>
          </DialogHeader>
          {detailPO && (
            <PurchaseOrderDetail
            poId={detailPO._id as string}
            onStatusChange={handleStatusChange}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}