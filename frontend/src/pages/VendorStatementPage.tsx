import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ArrowDownUp } from "lucide-react";
import SupplierPaymentDialog from "@/components/documents/SupplierPaymentDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useVendorLedger } from "@/hooks/useDocuments";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Everything billed by and paid to one supplier, with a running balance. */
export default function VendorStatementPage() {
  const { id } = useParams();
  const { data, isLoading } = useVendorLedger(id);
  const [newestFirst, setNewestFirst] = useState(true);
  const [paying, setPaying] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const v = data.vendor;
  const entries = newestFirst ? [...data.entries].reverse() : data.entries;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/payables" className="mb-2 inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3 w-3" />
            Payables
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{v.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[v.gstin && `GSTIN ${v.gstin}`, v.phone, `pays in ${v.paymentTermsDays} days`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">You owe</p>
            <p className="text-2xl font-bold tabular-nums">{formatINR(data.closing)}</p>
            {data.overdue > 0 && <p className="text-xs font-medium text-red-600 dark:text-red-400">{formatINR(data.overdue)} overdue</p>}
          </div>
          {data.closing > 0 && <Button onClick={() => setPaying(true)}>Pay</Button>}
        </div>
      </div>

      {data.openBills.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card">
          <p className="border-b border-border/50 px-4 py-2 text-sm font-medium">Unpaid bills</p>
          <ul className="divide-y divide-border/40">
            {data.openBills.map((b) => (
              <li key={b._id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link to={`/purchase-bills?bill=${b._id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">{b.supplierInvoiceNo}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {format(new Date(b.billDate), "d MMM")} · of {formatINR(b.grandTotal)}
                  </span>
                </Link>
                <span className="text-right">
                  <span className="font-semibold tabular-nums">{formatINR(b.balanceDue)}</span>
                  <span className={cn("ml-2 text-xs", b.daysOverdue > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                    {b.daysOverdue > 0 ? `${b.daysOverdue}d overdue` : b.dueDate ? `due ${format(new Date(b.dueDate), "d MMM")}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
          <p className="text-sm font-medium">Statement</p>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewestFirst((x) => !x)}>
            <ArrowDownUp className="mr-1 h-3 w-3" />
            {newestFirst ? "Newest first" : "Oldest first"}
          </Button>
        </div>
        {!entries.length ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No bills from this supplier yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Details</TableHead>
                  <TableHead className="text-right text-xs">Billed</TableHead>
                  <TableHead className="text-right text-xs">Paid</TableHead>
                  <TableHead className="text-right text-xs">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={`${e.ref}-${e.type}-${i}`}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{format(new Date(e.date), "d MMM yyyy")}</TableCell>
                    <TableCell>
                      <p className="font-mono text-xs">{e.ref}</p>
                      <p className="text-[11px] text-muted-foreground">{e.description}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{e.billed ? formatINR(e.billed) : ""}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">{e.paid ? formatINR(e.paid) : ""}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">{formatINR(e.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <SupplierPaymentDialog vendor={{ _id: v._id, name: v.name }} open={paying} onOpenChange={setPaying} />
    </div>
  );
}
