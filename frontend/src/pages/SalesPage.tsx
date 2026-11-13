import { useState } from "react";
import { useSales, useSale, useSaleReturns } from "@/hooks/useSales";
import ReturnDialog from "@/components/sales/ReturnDialog";
import { openPdf } from "@/lib/pdf";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Eye, RotateCcw, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import StatusBadge from "@/components/sales/StatusBadge";
import { formatINR, formatPrice } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";

export default function SalesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [returnOpen, setReturnOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  /** Open an invoice / credit note PDF in a new tab. */
  const showPdf = async (key: string, path: string, filename: string) => {
    setPdfLoading(key);
    try {
      await openPdf(path, filename);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't load the PDF"));
    } finally {
      setPdfLoading(null);
    }
  };

  const { data, isLoading } = useSales({
    page,
    limit: 15,
    status: status === "All" ? undefined : status,
    paymentMethod: paymentFilter === "All" ? undefined : paymentFilter,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const { data: saleDetail, isLoading: detailLoading } = useSale(selectedId);
  const { data: creditNotes = [] } = useSaleReturns(selectedId);
  const canReturn = saleDetail && ["COMPLETED", "PARTIALLY_RETURNED"].includes(saleDetail.status);

  const sales = data?.sales || data?.docs || [];

  // Pagination metadata lives under data.pagination in the API response.
  // Fall back to legacy top-level fields / derived values just in case
  // an older endpoint shape is ever hit.
  const pagination = data?.pagination;
  const total = pagination?.total ?? data?.total ?? data?.totalDocs ?? 0;
  const totalPages = pagination?.totalPages ?? Math.ceil(total / 15) ?? 1;
  const hasPrev = pagination?.hasPrev ?? page > 1;
  const hasNext = pagination?.hasNext ?? page < totalPages;

  const formatCurrency = formatINR;
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });


  const goPrev = () => {
    if (hasPrev) setPage((p) => Math.max(1, p - 1));
  };
  const goNext = () => {
    if (hasNext) setPage((p) => p + 1);
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
            <SelectItem value="PARTIALLY_RETURNED">Partly returned</SelectItem>
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
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
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
                <TableHead className="text-xs font-semibold hidden md:table-cell">Date</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Items</TableHead>
                <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">Payment</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-20 hidden sm:table-cell"></TableHead>
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
                  paymentStatus?: string;
                  balanceDue?: number;
                }) => (
                  <TableRow
                    key={sale._id}
                    className="border-border/30 hover:bg-muted/40 cursor-pointer"
                    onClick={() => setSelectedId(sale._id)}
                  >
                    <TableCell className="text-xs font-mono font-medium">
                      {sale.invoiceNumber}
                      <p className="md:hidden mt-0.5 font-sans font-normal text-[11px] text-muted-foreground">
                        {formatDate(sale.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                      {formatDate(sale.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs hidden md:table-cell">
                      {sale.items.length} item{sale.items.length !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatCurrency(sale.grandTotal)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px]">
                        {sale.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sale.status} />
                      {(sale.balanceDue ?? 0) > 0 && (
                        <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                          Due {formatCurrency(sale.balanceDue ?? 0)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
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
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={goNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedId && !returnOpen} onOpenChange={(open) => !open && setSelectedId(undefined)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <div className="mt-0.5"><StatusBadge status={saleDetail.status} /></div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment</p>
                  <p className="font-medium">
                    {saleDetail.paymentMethod === "CREDIT" ? "On credit" : saleDetail.paymentMethod}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cashier</p>
                  <p className="font-medium">{saleDetail.cashier?.name || "—"}</p>
                </div>
              </div>
              <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{saleDetail.customer?.name || "Walk-in"}</p>
                </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Line Items</p>
                <div className="space-y-2">
                  {saleDetail.items?.map(
                    (item: { name: string; sku: string; quantity: number; returnedQuantity?: number; unitPrice: number; lineTotal: number; hsnCode?: string; taxPercent?: number }, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.sku} — {formatPrice(item.unitPrice)} × {item.quantity}
                            {item.hsnCode && ` · HSN ${item.hsnCode}`}
                            {item.taxPercent ? ` · GST ${item.taxPercent}%` : ""}
                          </p>
                          {!!item.returnedQuantity && (
                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              {item.returnedQuantity} of {item.quantity} returned
                            </p>
                          )}
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
                  <span>Gross amount</span>
                  <span>{formatCurrency(saleDetail.subtotal)}</span>
                </div>
                {saleDetail.discountTotal > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span>-{formatCurrency(saleDetail.discountTotal)}</span>
                  </div>
                )}
                {saleDetail.loyaltyDiscountTotal > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>
                      Loyalty ({saleDetail.loyaltyTier} {saleDetail.loyaltyDiscountPercent}%)
                    </span>
                    <span>-{formatCurrency(saleDetail.loyaltyDiscountTotal)}</span>
                  </div>
                )}
                {saleDetail.taxableTotal > 0 ? (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxable value</span>
                      <span>{formatCurrency(saleDetail.taxableTotal)}</span>
                    </div>
                    {saleDetail.interState ? (
                      <div className="flex justify-between text-muted-foreground">
                        <span>IGST</span>
                        <span>{formatCurrency(saleDetail.igstTotal)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-muted-foreground">
                          <span>CGST</span>
                          <span>{formatCurrency(saleDetail.cgstTotal)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>SGST</span>
                          <span>{formatCurrency(saleDetail.sgstTotal)}</span>
                        </div>
                      </>
                    )}
                    {saleDetail.pricesIncludeTax && (
                      <p className="text-right text-[11px] text-muted-foreground">Prices include GST</p>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatCurrency(saleDetail.taxTotal)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-lg font-bold">
                  <span>Grand Total</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatCurrency(saleDetail.grandTotal)}</span>
                </div>
                {(saleDetail.balanceDue > 0 || saleDetail.paymentMethod === "CREDIT" || saleDetail.paymentStatus === "PARTIAL") && (
                  <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Paid</span>
                      <span className="tabular-nums">{formatCurrency(saleDetail.amountPaid ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Balance due</span>
                      <span className={saleDetail.balanceDue > 0 ? "text-amber-600 dark:text-amber-400 tabular-nums" : "tabular-nums"}>
                        {formatCurrency(saleDetail.balanceDue ?? 0)}
                      </span>
                    </div>
                    {saleDetail.balanceDue > 0 && saleDetail.dueDate && (
                      <p className="text-right text-[11px] text-muted-foreground">
                        Due {new Date(saleDetail.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        {new Date(saleDetail.dueDate) < new Date() && (
                          <span className="font-medium text-red-600 dark:text-red-400"> · overdue</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
                {saleDetail.placeOfSupply?.name && (
                  <p className="text-right text-[11px] text-muted-foreground">
                    Place of supply: {saleDetail.placeOfSupply.name} ({saleDetail.placeOfSupply.code})
                  </p>
                )}
              </div>
              {creditNotes.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">Credit notes</p>
                      <p className="text-xs text-muted-foreground">
                        Returned {formatCurrency(saleDetail.returnedTotal ?? 0)} · Net{" "}
                        {formatCurrency(saleDetail.grandTotal - (saleDetail.returnedTotal ?? 0))}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {creditNotes.map((cn) => (
                        <div key={cn._id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-mono text-xs">{cn.creditNoteNumber}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {cn.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")} · {cn.reason}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-sm font-medium tabular-nums">-{formatCurrency(cn.total)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Credit note PDF"
                              aria-label={`Open credit note ${cn.creditNoteNumber}`}
                              disabled={pdfLoading === cn._id}
                              onClick={() => showPdf(cn._id, `/credit-notes/${cn._id}/pdf`, cn.creditNoteNumber)}
                            >
                              {pdfLoading === cn._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FileText className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {saleDetail && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => showPdf("invoice", `/sales/${saleDetail._id}/invoice`, saleDetail.invoiceNumber)}
                disabled={pdfLoading === "invoice"}
              >
                {pdfLoading === "invoice" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Tax invoice (PDF)
              </Button>
            )}
            {canReturn && (
              <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Return items
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {saleDetail && canReturn && (
        <ReturnDialog key={saleDetail._id} sale={saleDetail} open={returnOpen} onOpenChange={setReturnOpen} />
      )}
    </div>
  );
}