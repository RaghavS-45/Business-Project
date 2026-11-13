import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, IndianRupee, Truck } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import SupplierPaymentDialog from "@/components/documents/SupplierPaymentDialog";
import { EmptyList } from "@/components/documents/ListBits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePayablesReport, type PayablesRow } from "@/hooks/useDocuments";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const BUCKETS: Array<{ key: keyof PayablesRow; label: string; tone: string }> = [
  { key: "current", label: "Not due", tone: "" },
  { key: "d1_30", label: "1–30 days", tone: "text-amber-600 dark:text-amber-400" },
  { key: "d31_60", label: "31–60", tone: "text-orange-600 dark:text-orange-400" },
  { key: "d61_90", label: "61–90", tone: "text-red-600 dark:text-red-400" },
  { key: "d90_plus", label: "90+", tone: "text-red-700 dark:text-red-400 font-semibold" },
];

/** What we owe suppliers, and when it falls due. */
export default function PayablesPage() {
  const { data, isLoading } = usePayablesReport();
  const navigate = useNavigate();
  const [paying, setPaying] = useState<{ _id: string; name: string } | null>(null);
  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payables</h1>
          <p className="mt-1 text-sm text-muted-foreground">What you owe suppliers on purchase bills</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/purchase-bills?new=1">Enter bill</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {isLoading || !t ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        ) : (
          <>
            <KpiCard title="Total to pay" value={formatINR(t.outstanding)} icon={<IndianRupee />} tone="blue" subtitle={`${t.vendors} supplier${t.vendors === 1 ? "" : "s"}`} />
            <KpiCard title="Due in 7 days" value={formatINR(t.dueThisWeek)} icon={<CalendarClock />} tone="emerald" subtitle="Plan this week's cash" />
            <KpiCard title="Overdue" value={formatINR(t.overdue)} icon={<AlertTriangle />} tone="amber" subtitle="Past the due date" />
            <KpiCard title="Not yet due" value={formatINR(t.current)} icon={<Truck />} tone="violet" subtitle="Within supplier terms" />
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.vendors.length ? (
          <EmptyList title="You don't owe any supplier" hint="Unpaid purchase bills show up here with their due dates." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-right text-xs">To pay</TableHead>
                  {BUCKETS.map((b) => (
                    <TableHead key={b.key} className="hidden text-right text-xs md:table-cell">
                      {b.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vendors.map((r) => (
                  <TableRow key={r.vendorId} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/vendors/${r.vendorId}/statement`)}>
                    <TableCell>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.bills} unpaid bill{r.bills === 1 ? "" : "s"}
                        {r.nextDue && ` · next due ${format(new Date(r.nextDue), "d MMM")}`}
                      </p>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{formatINR(r.outstanding)}</TableCell>
                    {BUCKETS.map((b) => {
                      const v = r[b.key] as number;
                      return (
                        <TableCell key={b.key} className={cn("hidden text-right text-xs tabular-nums md:table-cell", v > 0 ? b.tone : "text-muted-foreground/50")}>
                          {v > 0 ? formatINR(v) : "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaying({ _id: r.vendorId, name: r.name });
                        }}
                      >
                        Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Due dates come from each bill's date plus the supplier's payment terms (set on the{" "}
        <Link to="/vendors" className="text-primary hover:underline">
          Vendors
        </Link>{" "}
        page).
      </p>

      <SupplierPaymentDialog vendor={paying} open={!!paying} onOpenChange={(o) => !o && setPaying(null)} />
    </div>
  );
}
