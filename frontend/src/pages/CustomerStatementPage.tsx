import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format, startOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import { ArrowDownUp, ArrowLeft, FileDown, Loader2, Wallet } from "lucide-react";
import { useLedger } from "@/hooks/useReceivables";
import RecordPaymentDialog from "@/components/receivables/RecordPaymentDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/pricing";
import { openPdf } from "@/lib/pdf";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "all", label: "All time", from: () => undefined },
  { key: "month", label: "This month", from: () => startOfMonth(new Date()) },
  { key: "3m", label: "Last 3 months", from: () => startOfMonth(subMonths(new Date(), 2)) },
] as const;

const TYPE_STYLE: Record<string, string> = {
  INVOICE: "bg-primary/10 text-primary",
  PAYMENT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CREDIT_NOTE: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  REFUND: "bg-muted text-muted-foreground",
};
const TYPE_LABEL: Record<string, string> = {
  INVOICE: "Invoice",
  PAYMENT: "Payment",
  CREDIT_NOTE: "Credit note",
  REFUND: "Refund",
};

/** A customer's account: what they bought, paid and still owe. */
export default function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("all");
  const from = RANGES.find((r) => r.key === rangeKey)!.from();
  const range = from ? { from: from.toISOString() } : {};
  const { data, isLoading } = useLedger(id, range);
  const [paying, setPaying] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Newest activity on top in the app; the running balance is still worked
  // out oldest-first, so each row shows the balance right after it.
  const [newestFirst, setNewestFirst] = useState(true);

  const downloadStatement = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      const qs = from ? `?from=${encodeURIComponent(from.toISOString())}` : "";
      await openPdf(`/receivables/customers/${id}/statement${qs}`, `Statement_${data.customer.name}`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the statement"));
    } finally {
      setPdfLoading(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const c = data.customer;

  const balanceRow = (label: string, amount: number) => (
    <TableRow className="border-border/30 bg-muted/20 hover:bg-muted/20">
      <TableCell className="pl-6 text-xs font-medium text-muted-foreground" colSpan={2}>
        {label}
      </TableCell>
      <TableCell className="hidden md:table-cell" />
      <TableCell />
      <TableCell />
      <TableCell className="pr-6 text-right text-sm font-semibold tabular-nums">{formatINR(amount)}</TableCell>
    </TableRow>
  );
  const openingRow = balanceRow("Opening balance", data.opening);
  const closingRow = balanceRow("Closing balance (owes now)", data.closing);
  const overLimit = c.creditLimit !== null && c.outstanding > c.creditLimit;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/receivables" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Dues
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[c.phone, c.gstin && `GSTIN ${c.gstin}`, `${c.paymentTermsDays}-day terms`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadStatement} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Statement PDF
          </Button>
          <Button onClick={() => setPaying(true)} disabled={c.outstanding <= 0}>
            <Wallet className="mr-2 h-4 w-4" />
            Record payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Outstanding", value: formatINR(c.outstanding), tone: c.outstanding > 0 ? "text-foreground" : "" },
          { label: "Overdue", value: formatINR(data.overdue), tone: data.overdue > 0 ? "text-red-600 dark:text-red-400" : "" },
          {
            label: "Credit limit",
            value: c.creditLimit === null ? "No limit" : formatINR(c.creditLimit),
            tone: overLimit ? "text-red-600 dark:text-red-400" : "",
          },
          {
            label: "Available credit",
            value: c.creditLimit === null ? "—" : formatINR(Math.max(0, c.creditLimit - c.outstanding)),
            tone: "",
          },
        ].map((k) => (
          <Card key={k.label} className="py-0 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={cn("mt-1 text-xl font-semibold tabular-nums", k.tone)}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.openInvoices.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unpaid invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/50">
              {data.openInvoices.map((inv) => (
                <div key={inv._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="font-mono text-xs">{inv.invoiceNumber}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(inv.createdAt), "dd MMM yyyy")} · bill {formatINR(inv.grandTotal)}
                      {inv.dueDate && ` · due ${format(new Date(inv.dueDate), "dd MMM")}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{formatINR(inv.balanceDue)}</p>
                    {inv.daysOverdue > 0 ? (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{inv.daysOverdue} days overdue</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Not due yet</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground">Account statement</CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setNewestFirst((v) => !v)}
              title="Change order"
            >
              <ArrowDownUp className="mr-1 h-3.5 w-3.5" />
              {newestFirst ? "Newest first" : "Oldest first"}
            </Button>
            <span className="mx-1 w-px self-stretch bg-border" />
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={rangeKey === r.key ? "secondary" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setRangeKey(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs pl-6">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Details</TableHead>
                  <TableHead className="text-xs text-right">Debit</TableHead>
                  <TableHead className="text-xs text-right">Credit</TableHead>
                  <TableHead className="text-xs text-right pr-6">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newestFirst ? closingRow : openingRow}
                {(newestFirst ? [...data.entries].reverse() : data.entries).map((e, i) => (
                  <TableRow key={`${e.ref}-${e.type}-${i}`} className="border-border/30">
                    <TableCell className="pl-6 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.date), "dd MMM yy")}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", TYPE_STYLE[e.type])}>
                        {TYPE_LABEL[e.type]}
                      </span>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{e.ref}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[280px]">
                      <span className="line-clamp-2">{e.description}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{e.debit ? formatINR(e.debit) : ""}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                      {e.credit ? formatINR(e.credit) : ""}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-sm font-medium tabular-nums">{formatINR(e.balance)}</TableCell>
                  </TableRow>
                ))}
                {data.entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No activity in this period
                    </TableCell>
                  </TableRow>
                )}
                {newestFirst ? openingRow : closingRow}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RecordPaymentDialog customer={paying ? c : null} open={paying} onOpenChange={setPaying} />
    </div>
  );
}
