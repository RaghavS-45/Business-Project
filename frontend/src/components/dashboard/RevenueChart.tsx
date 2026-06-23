import { useState, useEffect } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function useCssVar(variable: string) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const update = () => {
      setValue(
        getComputedStyle(document.documentElement)
          .getPropertyValue(variable)
          .trim()
      );
    };
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [variable]);

  return value;
}

// ── Component ──────────────────────────────────────────────
interface RevenueChartProps {
  data: Array<{ date: string; revenue: number }>;
  isLoading?: boolean;
}

export default function RevenueChart({ data, isLoading }: RevenueChartProps) {

  const mutedFg = useCssVar("--muted-foreground");
  const border = useCssVar("--border");
  const popover = useCssVar("--popover");
  const foreground = useCssVar("--foreground");

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Revenue Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">
              Loading chart...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Revenue Trend (Last 7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.3}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: mutedFg || "#888888" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: mutedFg || "#888888" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={border || "#333"}
              strokeOpacity={0.3}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: popover || "#1a1a1a",
                border: `1px solid ${border || "#333"}`,
                borderRadius: "8px",
                color: foreground || "#fff",
                fontSize: "12px",
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
