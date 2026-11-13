import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Loader2, Plus, ReceiptText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PurchaseOrderDialog, { type PoDraft } from "@/components/purchaseOrders/PurchaseOrderDialog";
import PurchaseOrderView from "@/components/purchaseOrders/PurchaseOrderView";
import PoStatusBadge from "@/components/purchaseOrders/PoStatusBadge";
import { EmptyList, ListToolbar, Pager } from "@/components/documents/ListBits";
import {
  usePurchaseOrders,
  usePurchaseOrderStats,
  useReorderSuggestions,
  useUpdatePurchaseOrderStatus,
  type POStatus,
  type PurchaseOrder,
  type ReorderSuggestion,
} from "@/hooks/usePurchaseOrders";
import { useDebouncedValue } from "@/hooks/usePos";
import { formatINR } from "@/lib/pricing";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * Purchase orders: what to reorder, what needs approval, what's on the way.
 *
 *   create → approve (send the PDF to the supplier) → goods arrive → enter the bill
 */
export default function PurchaseOrdersPage() {
  const [status, setStatus] = useState<POStatus | "">("");
  const [page, setPage] = useState(1);
  const { value: search, debouncedValue: q, onChange: setSearch } = useDebouncedValue(250);
  const [draft, setDraft] = useState<{ key: string; value: PoDraft } | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  // Links: ?new=1, ?po=<id>
  const [params] = useSearchParams();
  const linkKey = params.toString();
  const [handledLink, setHandledLink] = useState("");
  if (linkKey && linkKey !== handledLink) {
    setHandledLink(linkKey);
    if (params.get("new")) setDraft({ key: `new-${linkKey}`, value: {} });
    if (params.get("po")) setSelectedId(params.get("po") ?? undefined);
  }

  const { data, isLoading } = usePurchaseOrders({
    page,
    limit: 15,
    status: status || undefined,
    search: q || undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const { data: stats } = usePurchaseOrderStats();
  const { data: suggestions = [] } = useReorderSuggestions();
  const counts = stats?.counts ?? { pending: 0, approved: 0, received: 0, rejected: 0 };
  const rows: PurchaseOrder[] = data?.purchaseOrders ?? [];

  const tabs = [
    { value: "", label: "All" },
    { value: "pending", label: `Needs approval${counts.pending ? ` (${counts.pending})` : ""}` },
    { value: "approved", label: `Waiting for goods${counts.approved ? ` (${counts.approved})` : ""}` },
    { value: "received", label: "Received" },
    { value: "rejected", label: "Rejected" },
  ];

  const openNew = (value: PoDraft = {}) => setDraft({ key: `n${Date.now()}`, value });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Order from suppliers → approve and send → goods arrive →{" "}
            <Link to="/purchase-bills" className="text-primary hover:underline">
              enter the bill
            </Link>
          </p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus className="mr-1.5 h-4 w-4" />
          New purchase order
        </Button>
      </div>

      <ReorderPanel suggestions={suggestions} onDraft={(vendor, items) => openNew({ vendor, suggestions: items })} />

      <ListToolbar
        tabs={tabs}
        value={status}
        onChange={(v) => {
          setStatus(v as POStatus | "");
          setPage(1);
        }}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="PO no., supplier or product"
      />

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <EmptyList
            title={status || q ? "No purchase orders match" : "No purchase orders yet"}
            hint="Create one when you need stock. Low-stock items can be added in one click."
            action={
              !status && !q ? (
                <Button size="sm" onClick={() => openNew()}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New purchase order
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Order</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="hidden text-xs lg:table-cell">Items</TableHead>
                  <TableHead className="text-right text-xs">Total</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Needed by</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((po) => (
                  <PoRow key={po._id} po={po} onOpen={() => setSelectedId(po._id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager page={page} totalPages={data?.pagination?.totalPages ?? 1} total={data?.pagination?.total ?? 0} onPage={setPage} />
      </div>

      {draft && (
        <PurchaseOrderDialog
          key={draft.key}
          open
          draft={draft.value}
          onOpenChange={(o) => !o && setDraft(null)}
          onSaved={(po) => setSelectedId(po._id)}
        />
      )}
      <PurchaseOrderView
        id={selectedId}
        onClose={() => setSelectedId(undefined)}
        onEdit={(po) => {
          setSelectedId(undefined);
          setDraft({ key: `e${po._id}${Date.now()}`, value: { editing: po } });
        }}
      />
    </div>
  );
}

function PoRow({ po, onOpen }: { po: PurchaseOrder; onOpen: () => void }) {
  const approve = useUpdatePurchaseOrderStatus();
  const [today] = useState(() => new Date(new Date().toDateString()));
  const late = po.status === "approved" && po.expectedDelivery && new Date(po.expectedDelivery) < today;
  const names = po.items.map((i) => i.productName);

  return (
    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onOpen}>
      <TableCell>
        <p className="font-mono text-xs font-medium">{po.poNumber}</p>
        <p className="text-[11px] text-muted-foreground">{format(new Date(po.createdAt), "d MMM yyyy")}</p>
      </TableCell>
      <TableCell className="text-sm font-medium">{po.vendor?.name ?? "—"}</TableCell>
      <TableCell className="hidden max-w-56 text-xs text-muted-foreground lg:table-cell">
        <span className="line-clamp-2">
          {names.slice(0, 2).join(", ")}
          {names.length > 2 ? ` +${names.length - 2} more` : ""}
        </span>
      </TableCell>
      <TableCell className="text-right text-sm font-semibold tabular-nums">{formatINR(po.totalAmount)}</TableCell>
      <TableCell className={cn("hidden text-xs md:table-cell", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
        {po.expectedDelivery && po.status !== "rejected" ? format(new Date(po.expectedDelivery), "d MMM") : "—"}
        {late && " · late"}
      </TableCell>
      <TableCell>
        <PoStatusBadge status={po.status} />
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        {po.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(
                { id: po._id, status: "approved" },
                {
                  onSuccess: () => toast.success(`${po.poNumber} approved — send it to ${po.vendor.name}`),
                  onError: (e) => toast.error(getErrorMessage(e, "Couldn't approve")),
                }
              )
            }
          >
            {approve.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}
            Approve
          </Button>
        )}
        {po.status === "approved" && (
          <Button size="sm" className="h-7 text-xs" asChild>
            <Link to={`/purchase-bills?po=${po._id}`}>
              <ReceiptText className="mr-1 h-3 w-3" />
              Goods arrived
            </Link>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Low-stock products grouped by their usual supplier, each a click from a draft PO. */
function ReorderPanel({
  suggestions,
  onDraft,
}: {
  suggestions: ReorderSuggestion[];
  onDraft: (vendor: { _id: string; name: string } | null, items: ReorderSuggestion[]) => void;
}) {
  if (!suggestions.length) return null;
  const groups = new Map<string, { vendor: { _id: string; name: string } | null; items: ReorderSuggestion[] }>();
  for (const s of suggestions) {
    const key = s.vendor?._id ?? "none";
    const g = groups.get(key) ?? { vendor: s.vendor, items: [] };
    g.items.push(s);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => (a.vendor ? 0 : 1) - (b.vendor ? 0 : 1));

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-semibold">
          {suggestions.length} product{suggestions.length === 1 ? " is" : "s are"} running low
        </p>
        <span className="text-xs text-muted-foreground">(already on order is taken into account)</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => {
          const total = g.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
          return (
            <div key={g.vendor?._id ?? "none"} className="flex flex-col justify-between gap-2 rounded-lg border border-border/60 bg-card p-3">
              <div>
                <p className="text-sm font-medium">{g.vendor?.name ?? "No usual supplier set"}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {g.items.slice(0, 3).map((i) => (
                    <li key={i.product} className="flex justify-between gap-2">
                      <span className="truncate">{i.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {i.stock} {i.baseUnit} left → {i.quantity} {i.unit}
                      </span>
                    </li>
                  ))}
                  {g.items.length > 3 && <li>+{g.items.length - 3} more</li>}
                </ul>
              </div>
              <Button size="sm" variant="outline" className="h-7 self-start text-xs" onClick={() => onDraft(g.vendor, g.items)}>
                <Sparkles className="mr-1 h-3 w-3" />
                Draft PO · ~{formatINR(total)}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
