import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatINRCompact } from "@/lib/pricing";

export interface RevenuePoint {
  label: string; // "12 Nov"
  revenue: number;
  orders: number;
}

interface RevenueChartProps {
  data: RevenuePoint[];
  title: string;
  isLoading?: boolean;
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as RevenuePoint;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{point.label}</p>
      <p className="tabular-nums text-popover-foreground">{formatINR(point.revenue)}</p>
      <p className="text-muted-foreground">
        {point.orders} order{point.orders === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default function RevenueChart({ data, title, isLoading }: RevenueChartProps) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const orders = data.reduce((s, d) => s + d.orders, 0);
  // Thin out x-axis labels on long ranges so they don't collide
  const tickInterval = data.length > 14 ? Math.ceil(data.length / 8) - 1 : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {isLoading ? (
          <Skeleton className="mt-1 h-7 w-32" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatINR(total)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {orders} order{orders === 1 ? "" : "s"}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  interval={tickInterval}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  width={52}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={formatINRCompact}
                />
                <Tooltip
                  content={ChartTooltip}
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                  activeDot={{ r: 4, strokeWidth: 0, fill: "var(--chart-1)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {total === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                No sales in this period
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
