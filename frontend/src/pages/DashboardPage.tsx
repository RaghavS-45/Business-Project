import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useDailySummary,
  useLowStockProducts,
  useRecentSales,
  useProductStats,
  type DateRange,
} from "@/hooks/useDashboard";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart, { type RevenuePoint } from "@/components/dashboard/RevenueChart";
import StatusBadge from "@/components/sales/StatusBadge";
import { formatINR } from "@/lib/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  IndianRupee, ShoppingCart, AlertTriangle,
  Package, CalendarIcon, X, Wallet,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, isSameDay, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

import AiInsightsCard from "@/components/dashboard/AiInsightsCard";

const PRESETS = [
  { label: "Today", range: () => ({ from: new Date(), to: new Date() }) },
  { label: "Last 7 days", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 30 days", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
];

const greetingFor = (hour: number) =>
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

export default function DashboardPage() {
  const firstName = useAuthStore((s) => s.user?.name?.trim().split(" ")[0]);
  const greeting = greetingFor(new Date().getHours());
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [tempFrom, setTempFrom] = useState<Date | null>(null);

  const { data: summary, isLoading: summaryLoading } = useDailySummary(dateRange);

  // The chart always shows a trend: the selected range when it spans
  // several days, otherwise the last 7 days.
  const [last7] = useState(() => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }));
  const trendRange =
    dateRange && !isSameDay(dateRange.from, dateRange.to) ? dateRange : last7;
  const { data: trend, isLoading: trendLoading } = useDailySummary(trendRange);
  const { data: lowStock, isLoading: lowStockLoading } = useLowStockProducts();
  const { data: recentSales, isLoading: salesLoading } = useRecentSales();
  const { data: stats, isLoading: statsLoading } = useProductStats();

  const formatCurrency = (v: number) =>
    `₹${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  // One point per day, with zero-revenue days filled in
  const byDay = new Map<string, { revenue: number; orders: number }>(
    (trend?.dailyBreakdown ?? []).map((d: { _id: string; revenue: number; orders: number }) => [
      d._id,
      { revenue: d.revenue, orders: d.orders },
    ])
  );
  const chartData: RevenuePoint[] = eachDayOfInterval({
    start: trendRange.from,
    end: trendRange.to,
  }).map((day) => {
    const hit = byDay.get(format(day, "yyyy-MM-dd"));
    return { label: format(day, "dd MMM"), revenue: hit?.revenue ?? 0, orders: hit?.orders ?? 0 };
  });
  const chartTitle =
    trendRange === last7
      ? "Revenue · last 7 days"
      : `Revenue · ${format(trendRange.from, "dd MMM")} – ${format(trendRange.to, "dd MMM")}`;

  const handleDayClick = (day: Date) => {
    if (selecting === "from") {
      setTempFrom(day);
      setSelecting("to");
    } else {
      if (tempFrom && day >= tempFrom) {
        setDateRange({ from: startOfDay(tempFrom), to: endOfDay(day) });
      } else {
        // clicked earlier than from — restart
        setTempFrom(day);
        setSelecting("to");
        return;
      }
      setSelecting("from");
      setTempFrom(null);
      setCalOpen(false);
    }
  };

  const rangeLabel = dateRange
    ? `${format(dateRange.from, "dd MMM")} – ${format(dateRange.to, "dd MMM")}`
    : "All time (today)";

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl bg-hero-fill px-6 py-7 text-white shadow-lg sm:px-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute right-24 -bottom-24 h-56 w-56 rounded-full bg-brand/30 blur-3xl" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/75">
              {greeting}
              {firstName ? `, ${firstName}` : ""} 👋
            </p>
            <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">
              {summary
                ? `${formatCurrency(summary.totalRevenue || 0)} in sales ${dateRange ? "this period" : "today"}`
                : "Here's your store today"}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {summary?.saleCount || 0} bill{summary?.saleCount === 1 ? "" : "s"} so far ·{" "}
              {(lowStock?.length || 0) > 0 ? `${lowStock?.length} item${lowStock?.length === 1 ? "" : "s"} running low` : "stock looks healthy"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-brand-fill text-brand-foreground font-semibold shadow-md hover:brightness-105">
              <Link to="/pos">
                <ShoppingCart className="mr-1.5 h-4 w-4" /> New sale
              </Link>
            </Button>
            <Button asChild variant="ghost" className="bg-white/15 text-white backdrop-blur hover:bg-white/25 hover:text-white">
              <Link to="/receivables">
                <Wallet className="mr-1.5 h-4 w-4" /> Collect dues
              </Link>
            </Button>
            <Button asChild variant="ghost" className="bg-white/15 text-white backdrop-blur hover:bg-white/25 hover:text-white">
              <Link to="/products">
                <Package className="mr-1.5 h-4 w-4" /> Products
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Date filter */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold">Overview</h2>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Presets */}
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setDateRange(p.range())}
            >
              {p.label}
            </Button>
          ))}

          {/* Custom range picker */}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "text-xs h-8 gap-2",
                  dateRange && "border-primary/50 text-primary"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {rangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <p className="text-xs text-muted-foreground mb-2">
                {selecting === "from"
                  ? "Select start date"
                  : `From ${tempFrom ? format(tempFrom, "dd MMM") : "?"} — select end date`}
              </p>
              <Calendar
                mode="single"
                selected={tempFrom ?? dateRange?.from}
                onSelect={(d) => d && handleDayClick(d)}
                disabled={(d) => d > new Date()}
              />
            </PopoverContent>
          </Popover>

          {/* Clear */}
          {dateRange && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setDateRange(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {summaryLoading || statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              title={dateRange ? "Period Revenue" : "Today's Revenue"}
              value={formatCurrency(summary?.totalRevenue || 0)}
              icon={<IndianRupee />}
              tone="emerald"
              subtitle={`${summary?.saleCount || 0} transaction${summary?.saleCount === 1 ? "" : "s"}`}
            />
            <KpiCard
              title={dateRange ? "Orders in Period" : "Orders Today"}
              value={summary?.saleCount || 0}
              icon={<ShoppingCart />}
              tone="blue"
              subtitle={`Avg order ${formatCurrency(summary?.avgOrderValue || 0)}`}
            />
            <KpiCard
              title="Low Stock Items"
              value={lowStock?.length || 0}
              icon={<AlertTriangle />}
              tone="amber"
              subtitle={(lowStock?.length || 0) > 0 ? "Need restocking" : "All stocked up"}
            />
            <KpiCard
              title="Total Products"
              value={stats?.total || 0}
              icon={<Package />}
              tone="violet"
              subtitle="In your catalogue"
            />
          </>
        )}
      </div>

      <AiInsightsCard range={dateRange} />

      {/* Charts + Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={chartData} title={chartTitle} isLoading={trendLoading} />

        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Sales
            </CardTitle>
            <Link to="/sales" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs">Invoice</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Payment</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentSales?.sales || recentSales?.docs || [])
                    .slice(0, 5)
                    .map((sale: {
                      _id: string; invoiceNumber: string; createdAt: string;
                      grandTotal: number; paymentMethod: string; status: string;
                    }) => (
                      <TableRow key={sale._id} className="border-border/30">
                        <TableCell>
                          <p className="text-xs font-mono">{sale.invoiceNumber}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(sale.createdAt), { addSuffix: true })}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-right tabular-nums">{formatINR(sale.grandTotal)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-medium">
                            {sale.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={sale.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  {(!recentSales?.sales?.length && !recentSales?.docs?.length) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                        No sales yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {!lowStockLoading && (lowStock?.length || 0) > 0 && (
        <Card className="border-amber-500/20 bg-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alerts
            </CardTitle>
            <Link to="/products" className="text-xs font-medium text-primary hover:underline">
              Manage products
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Current Stock</TableHead>
                  <TableHead className="text-xs">Threshold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock?.slice(0, 10).map((product: {
                  _id: string; name: string; sku: string;
                  stock: number; lowStockThreshold: number;
                }) => (
                  <TableRow key={product._id} className="border-border/30">
                    <TableCell className="text-sm font-medium">{product.name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{product.sku}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                          product.stock === 0
                            ? "bg-red-500/10 text-red-700 dark:text-red-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {product.stock === 0 ? "Out of stock" : `${product.stock} left`}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {product.lowStockThreshold}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}