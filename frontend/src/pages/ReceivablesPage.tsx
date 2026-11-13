import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, IndianRupee, Users } from "lucide-react";
import { useDuesReport, type DuesRow } from "@/hooks/useReceivables";
import KpiCard from "@/components/dashboard/KpiCard";
import RecordPaymentDialog from "@/components/receivables/RecordPaymentDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const BUCKETS: Array<{ key: keyof DuesRow; label: string; tone: string }> = [
  { key: "current", label: "Not due", tone: "" },
  { key: "d1_30", label: "1–30 days", tone: "text-amber-600 dark:text-amber-400" },
  { key: "d31_60", label: "31–60", tone: "text-orange-600 dark:text-orange-400" },
  { key: "d61_90", label: "61–90", tone: "text-red-600 dark:text-red-400" },
  { key: "d90_plus", label: "90+", tone: "text-red-700 dark:text-red-400 font-semibold" },
];

/** Who owes money, and how overdue it is. */
export default function ReceivablesPage() {
  const { data, isLoading } = useDuesReport();
  const navigate = useNavigate();
  const [paying, setPaying] = useState<{ _id: string; name: string } | null>(null);

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dues</h1>
        <p className="text-sm text-muted-foreground mt-1">Money customers owe on credit sales</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {isLoading || !t ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
        ) : (
          <>
            <KpiCard title="Total outstanding" value={formatINR(t.outstanding)} icon={<IndianRupee />} tone="blue" subtitle={`${t.customers} customer${t.customers === 1 ? "" : "s"}`} />
            <KpiCard title="Overdue" value={formatINR(t.overdue)} icon={<AlertTriangle />} tone="amber" subtitle="Past the due date" />
            <KpiCard title="90+ days overdue" value={formatINR(t.d90_plus)} icon={<Clock />} tone="violet" subtitle="Follow up first" />
            <KpiCard title="Not yet due" value={formatINR(t.current)} icon={<Users />} tone="emerald" subtitle="Within payment terms" />
          </>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.customers.length ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">Nobody owes you anything</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Credit sales appear here. Choose "Credit (pay later)" at checkout, or enter less than the total as received.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 bg-muted/30">
                  <TableHead className="text-xs font-semibold">Customer</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Outstanding</TableHead>
                  {BUCKETS.map((b) => (
                    <TableHead key={b.key} className="text-xs font-semibold text-right hidden md:table-cell">
                      {b.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((r) => {
                  const overLimit = r.creditLimit !== null && r.outstanding > r.creditLimit;
                  return (
                    <TableRow
                      key={r.customerId}
                      className="border-border/30 hover:bg-muted/40 cursor-pointer"
                      onClick={() => navigate(`/customers/${r.customerId}/statement`)}
                    >
                      <TableCell>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.invoices} unpaid invoice{r.invoices === 1 ? "" : "s"}
                          {r.creditLimit !== null && (
                            <span className={cn(overLimit && "text-red-600 dark:text-red-400")}>
                              {" "}· limit {formatINR(r.creditLimit)}
                            </span>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{formatINR(r.outstanding)}</TableCell>
                      {BUCKETS.map((b) => {
                        const v = r[b.key] as number;
                        return (
                          <TableCell key={b.key} className={cn("text-right text-xs tabular-nums hidden md:table-cell", v > 0 ? b.tone : "text-muted-foreground/50")}>
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
                            setPaying({ _id: r.customerId, name: r.name });
                          }}
                        >
                          Record payment
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Overdue is counted from each invoice's due date (sale date + the customer's payment terms). Set terms and credit
        limits on the <Link to="/customers" className="text-primary hover:underline">Customers</Link> page.
      </p>

      <RecordPaymentDialog customer={paying} open={!!paying} onOpenChange={(o) => !o && setPaying(null)} />
    </div>
  );
}
