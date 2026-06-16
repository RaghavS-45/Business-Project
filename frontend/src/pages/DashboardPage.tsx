import {
  useDailySummary,
  useLowStockProducts,
  useRecentSales,
  useProductStats,
} from "@/hooks/useDashboard";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IndianRupee, ShoppingCart, AlertTriangle, Package } from "lucide-react";

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDailySummary();
  const { data: lowStock, isLoading: lowStockLoading } = useLowStockProducts();
  const { data: recentSales, isLoading: salesLoading } = useRecentSales();
  const { data: stats, isLoading: statsLoading } = useProductStats();

  const formatCurrency = (v: number) =>
    `₹${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  // Generate mock 7-day data from daily summary for chart
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString("en-US", { weekday: "short" }),
      revenue: i === 6 ? (summary?.totalRevenue || 0) : Math.floor(Math.random() * 5000 + 1000),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your store performance
        </p>
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
              title="Today's Revenue"
              value={formatCurrency(summary?.totalRevenue || 0)}
              icon={<IndianRupee className="h-5 w-5" />}
              subtitle={`${summary?.totalSales || 0} transactions`}
            />
            <KpiCard
              title="Orders Today"
              value={summary?.totalSales || 0}
              icon={<ShoppingCart className="h-5 w-5" />}
              subtitle={`Avg: ${formatCurrency(summary?.totalSales ? summary.totalRevenue / summary.totalSales : 0)}`}
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
        {/* Revenue Chart */}
        <RevenueChart data={chartData} isLoading={summaryLoading} />

        {/* Recent Sales */}
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
                    .map(
                      (sale: {
                        _id: string;
                        invoiceNumber: string;
                        grandTotal: number;
                        paymentMethod: string;
                        status: string;
                      }) => (
                        <TableRow key={sale._id} className="border-border/30">
                          <TableCell className="text-xs font-mono">
                            {sale.invoiceNumber}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {formatCurrency(sale.grandTotal)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium"
                            >
                              {sale.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                sale.status === "COMPLETED"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-[10px]"
                            >
                              {sale.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  {(!recentSales?.sales?.length && !recentSales?.docs?.length) && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground text-sm py-8"
                      >
                        No sales today yet
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
                {lowStock?.slice(0, 10).map(
                  (product: {
                    _id: string;
                    name: string;
                    sku: string;
                    stock: number;
                    lowStockThreshold: number;
                  }) => (
                    <TableRow key={product._id} className="border-border/30">
                      <TableCell className="text-sm font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {product.sku}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="destructive"
                          className="text-[10px] font-mono"
                        >
                          {product.stock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {product.lowStockThreshold}
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
