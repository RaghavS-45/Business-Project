import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "blue" | "emerald" | "amber" | "violet";

const TONES: Record<Tone, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  tone?: Tone;
  trend?: { value: number; label: string };
  className?: string;
}

export default function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "blue",
  trend,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("py-0 border-border/50 transition-colors hover:border-border", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="truncate text-xl sm:text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {value}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    trend.value >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              "hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&_svg]:h-5 [&_svg]:w-5",
              TONES[tone]
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
