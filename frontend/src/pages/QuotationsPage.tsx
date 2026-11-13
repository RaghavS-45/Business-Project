import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileText, Loader2, Plus, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/sales/StatusBadge";
import DocLines from "@/components/documents/DocLines";
import SellDocumentDialog from "@/components/documents/SellDocumentDialog";
import { EmptyList, ListToolbar, Pager } from "@/components/documents/ListBits";
import { useCreateChallan, useQuotation, useQuotations, useSetQuotationStatus, type Quotation } from "@/hooks/useDocuments";
import { useDebouncedValue } from "@/hooks/usePos";
import { useShowPdf } from "@/hooks/useShowPdf";
import { useCartStore } from "@/stores/cartStore";
import api from "@/lib/axios";
import { formatINR } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";
import type { CatalogProduct } from "@/lib/editorLines";

const TABS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CONVERTED", label: "Converted" },
  { value: "DECLINED", label: "Declined" },
];

const shownStatus = (q: Pick<Quotation, "status" | "isExpired">) => (q.isExpired ? "EXPIRED" : q.status);
const customerId = (q: Quotation) => (q.customer ? (typeof q.customer === "string" ? q.customer : q.customer._id) : null);

/** Priced offers to buyers; billed at the POS or dispatched on a challan. */
export default function QuotationsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { value: search, debouncedValue: q, onChange: setSearch } = useDebouncedValue(250);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  // Links from the command palette: ?new=1, ?quote=<id>
  const [params] = useSearchParams();
  const linkKey = params.toString();
  const [handledLink, setHandledLink] = useState("");
  if (linkKey && linkKey !== handledLink) {
    setHandledLink(linkKey);
    if (params.get("new")) setCreating(true);
    if (params.get("quote")) setSelectedId(params.get("quote") ?? undefined);
  }

  const { data, isLoading } = useQuotations({ page, status: status || undefined, search: q || undefined });
  const rows = data?.quotations ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quotations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Price offers to buyers. Bill them at the POS or send the goods on a challan.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New quotation
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
        placeholder="Quote no. or party"
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
            title={status || q ? "No quotations match" : "No quotations yet"}
            hint="Quote a buyer their price (with their price level and bulk rates) before they order."
            action={
              !status && !q ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New quotation
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Quote</TableHead>
                  <TableHead className="text-xs">For</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Valid until</TableHead>
                  <TableHead className="text-right text-xs">Total</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r._id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(r._id)}>
                    <TableCell>
                      <p className="font-mono text-xs font-medium">{r.quoteNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(r.createdAt), "d MMM yyyy")}</p>
                    </TableCell>
                    <TableCell className="text-sm">{r.buyer.name}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{format(new Date(r.validUntil), "d MMM yyyy")}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatINR(r.grandTotal)}</TableCell>
                    <TableCell>
                      <StatusBadge status={shownStatus(r)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager page={page} totalPages={data?.pagination.totalPages ?? 1} total={data?.pagination.total ?? 0} onPage={setPage} />
      </div>

      <SellDocumentDialog kind="quotation" open={creating} onOpenChange={setCreating} onCreated={(d) => setSelectedId(d._id)} />
      <QuotationDetail id={selectedId} onClose={() => setSelectedId(undefined)} />
    </div>
  );
}

function QuotationDetail({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { data: quote, isLoading } = useQuotation(id);
  const setStatus = useSetQuotationStatus();
  const createChallan = useCreateChallan();
  const { show, loading: pdfLoading } = useShowPdf();
  const loadQuotation = useCartStore((s) => s.loadQuotation);
  const navigate = useNavigate();
  const [loadingPos, setLoadingPos] = useState(false);

  const live = quote && ["OPEN", "ACCEPTED"].includes(quote.status);

  const mark = (status: "OPEN" | "ACCEPTED" | "DECLINED") =>
    quote &&
    setStatus.mutate(
      { id: quote._id, status },
      { onError: (e) => toast.error(getErrorMessage(e, "Couldn't update the quotation")) }
    );

  /** Put the quote's lines and customer in the POS cart. */
  const billAtPos = async () => {
    if (!quote) return;
    setLoadingPos(true);
    try {
      const custId = customerId(quote);
      const [products, customer] = await Promise.all([
        Promise.all(
          [...new Set(quote.items.map((i) => i.product))].map(
            async (pid) => (await api.get(`/products/${pid}`)).data.data.product as CatalogProduct & { images?: Array<{ url: string }> }
          )
        ),
        custId ? api.get(`/customers/${custId}`).then((r) => r.data.data.customer) : Promise.resolve(null),
      ]);
      const byId = new Map(products.map((p) => [p._id, p]));
      const { skipped } = loadQuotation({
        quotation: { id: quote._id, number: quote.quoteNumber },
        customer: customer
          ? { id: customer._id, name: customer.name, loyaltyPoints: customer.loyaltyPoints, priceLevel: customer.priceLevel }
          : null,
        lines: quote.items.map((i) => {
          const p = byId.get(i.product)!;
          return {
            product: p._id,
            name: p.name,
            sku: p.sku,
            costPrice: p.costPrice,
            stock: p.stock,
            taxPercent: p.taxRate ?? 0,
            image: p.images?.[0]?.url,
            unit: i.unit,
            quantity: i.quantity,
            discountPercent: i.discountPercent,
            pricing: { unit: p.unit, sellingPrice: p.sellingPrice, packs: p.packs ?? [], levelPrices: p.levelPrices, priceSlabs: p.priceSlabs ?? [] },
          };
        }),
      });
      if (skipped.length) toast.warning(`Check quantities: ${skipped.join(", ")}`, { duration: 8000 });
      if (!custId) toast.info(`${quote.buyer.name} isn't a saved customer; this bills as a walk-in sale.`);
      navigate("/pos");
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't load the quotation"));
    } finally {
      setLoadingPos(false);
    }
  };

  const dispatch = () =>
    quote &&
    createChallan.mutate(
      { quotation: quote._id },
      {
        onSuccess: (c) => {
          toast.success(`Challan ${c.challanNumber} created; stock taken`);
          navigate(`/challans?challan=${c._id}`);
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't create the challan")),
      }
    );

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        {isLoading || !quote ? (
          <>
              <DialogTitle className="sr-only">Loading</DialogTitle>
              <Skeleton className="h-64 w-full" />
            </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{quote.quoteNumber}</span>
                <StatusBadge status={shownStatus(quote)} />
              </DialogTitle>
              <DialogDescription>
                For {quote.buyer.name}
                {quote.buyer.phone ? ` · ${quote.buyer.phone}` : ""} · made {format(new Date(quote.createdAt), "d MMM yyyy")} · valid until{" "}
                {format(new Date(quote.validUntil), "d MMM yyyy")}
              </DialogDescription>
            </DialogHeader>

            {quote.status === "CONVERTED" && quote.convertedTo?.number && (
              <p className="rounded-md bg-violet-500/10 px-3 py-2 text-sm">
                {quote.convertedTo.kind === "SALE" ? "Billed as invoice " : "Dispatched on challan "}
                <Link
                  className="font-mono font-medium text-primary hover:underline"
                  to={quote.convertedTo.kind === "SALE" ? `/sales?sale=${quote.convertedTo.id}` : `/challans?challan=${quote.convertedTo.id}`}
                >
                  {quote.convertedTo.number}
                </Link>
              </p>
            )}

            <DocLines items={quote.items} totals={quote} totalLabel="Quoted total" />
            {quote.notes && <p className="text-sm text-muted-foreground">Notes: {quote.notes}</p>}

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => show("q", `/quotations/${quote._id}/pdf`, quote.quoteNumber)} disabled={pdfLoading === "q"}>
                  {pdfLoading === "q" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                  PDF
                </Button>
                {quote.status === "OPEN" && (
                  <Button variant="outline" size="sm" onClick={() => mark("ACCEPTED")} disabled={setStatus.isPending}>
                    Mark accepted
                  </Button>
                )}
                {live && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => mark("DECLINED")} disabled={setStatus.isPending}>
                    Declined
                  </Button>
                )}
                {quote.status === "DECLINED" && (
                  <Button variant="outline" size="sm" onClick={() => mark("OPEN")} disabled={setStatus.isPending}>
                    Reopen
                  </Button>
                )}
              </div>
              {live && (
                <div className="flex flex-wrap gap-2">
                  {customerId(quote) && (
                    <Button variant="outline" size="sm" onClick={dispatch} disabled={createChallan.isPending}>
                      {createChallan.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Truck className="mr-1.5 h-3.5 w-3.5" />}
                      Dispatch on challan
                    </Button>
                  )}
                  <Button size="sm" onClick={billAtPos} disabled={loadingPos}>
                    {loadingPos ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />}
                    Bill at POS
                  </Button>
                </div>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
