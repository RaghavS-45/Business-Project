import { useState } from "react";
import {
  useDailySummary,
  useLowStockProducts,
  useRecentSales,
  useProductStats,
  type DateRange,
} from "@/hooks/useDashboard";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
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
  Package, CalendarIcon, X,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Today", range: () => ({ from: new Date(), to: new Date() }) },
  { label: "Last 7 days", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 30 days", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
];

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [tempFrom, setTempFrom] = useState<Date | null>(null);

  const { data: summary, isLoading: summaryLoading } = useDailySummary(dateRange);
  const { data: lowStock, isLoading: lowStockLoading } = useLowStockProducts();
  const { data: recentSales, isLoading: salesLoading } = useRecentSales();
  const { data: stats, isLoading: statsLoading } = useProductStats();

  const formatCurrency = (v: number) =>
    `₹${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  // Build chart data from dailyBreakdown or fall back to today
  const chartData = summary?.dailyBreakdown?.length
    ? summary.dailyBreakdown.map((d: { _id: string; revenue: number }) => ({
      date: format(new Date(d._id), "dd MMM"),
      revenue: d.revenue,
    }))
    : [{ date: format(new Date(), "dd MMM"), revenue: summary?.totalRevenue || 0 }];

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
      {/* Header + Date Filter */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your store performance
          </p>
        </div>

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
                  dateRange && "border-indigo-500/50 text-indigo-400"
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLoading || statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              title={dateRange ? "Period Revenue" : "Today's Revenue"}
              value={formatCurrency(summary?.totalRevenue || 0)}
              icon={<IndianRupee className="h-5 w-5" />}
              subtitle={`${summary?.saleCount || 0} transactions`}
            />
            <KpiCard
              title={dateRange ? "Orders in Period" : "Orders Today"}
              value={summary?.saleCount || 0}
              icon={<ShoppingCart className="h-5 w-5" />}
              subtitle={`Avg: ${formatCurrency(summary?.avgOrderValue || 0)}`}
            />
            <KpiCard
              title="Low Stock Items"
              value={lowStock?.length || 0}
              icon={<AlertTriangle className="h-5 w-5" />}
              subtitle="Need restocking"
              className={
                (lowStock?.length || 0) > 0
                  ? "border-amber-500/30 hover:border-amber-500/50"
                  : ""
              }
            />
            <KpiCard
              title="Total Products"
              value={stats?.total || 0}
              icon={<Package className="h-5 w-5" />}
              subtitle="Active catalog"
            />
          </>
        )}
      </div>

      {/* Charts + Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={chartData} isLoading={summaryLoading} />

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Sales
            </CardTitle>
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
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Payment</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentSales?.sales || recentSales?.docs || [])
                    .slice(0, 5)
                    .map((sale: {
                      _id: string; invoiceNumber: string;
                      grandTotal: number; paymentMethod: string; status: string;
                    }) => (
                      <TableRow key={sale._id} className="border-border/30">
                        <TableCell className="text-xs font-mono">{sale.invoiceNumber}</TableCell>
                        <TableCell className="text-xs font-medium">{formatCurrency(sale.grandTotal)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-medium">
                            {sale.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={sale.status === "COMPLETED" ? "default" : "destructive"}
                            className="text-[10px]"
                          >
                            {sale.status}
                          </Badge>
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
        <Card className="border-amber-500/20 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alerts
            </CardTitle>
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
                      <Badge variant="destructive" className="text-[10px] font-mono">
                        {product.stock}
                      </Badge>
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