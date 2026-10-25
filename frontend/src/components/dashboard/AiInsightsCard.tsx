// frontend/src/components/dashboard/AiInsightsCard.tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, isSameDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import api from "@/lib/axios";
import type { DateRange } from "@/hooks/useDashboard";

// Day boundaries are computed in the user's own timezone, then sent to the backend
function toParams(range: DateRange) {
  const from = startOfDay(range?.from ?? new Date());
  const to = endOfDay(range?.to ?? new Date());
  return { from: from.toISOString(), to: to.toISOString() };
}

async function fetchInsights(
  params: { from: string; to: string },
  refresh = false
): Promise<{ insights: string }> {
  const res = await api.get("/ai/insights", {
    params: refresh ? { ...params, refresh: 1 } : params,
  });
  return res.data;
}

export default function AiInsightsCard({ range }: { range: DateRange }) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const params = toParams(range);
  const queryKey = ["ai-insights", params.from, params.to];

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey,
    queryFn: () => fetchInsights(params),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const label = !range
    ? "Today"
    : isSameDay(range.from, range.to)
    ? format(range.from, "dd MMM")
    : `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM")}`;

  // Manual refresh also bypasses the server cache
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(queryKey, await fetchInsights(params, true));
    } catch {
      /* keep showing the previous insights */
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-blue-500/20 transition-colors">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          AI Insights
          <span className="text-xs font-normal text-blue-400/80">· {label}</span>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          disabled={isFetching || refreshing}
          onClick={handleRefresh}
          title="Refresh insights"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching || refreshing ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load insights right now.
          </p>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-line">{data?.insights}</p>
        )}
      </CardContent>
    </Card>
  );
}