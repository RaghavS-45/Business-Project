import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getTier, getNextTier } from "@/lib/loyalty";

export function LoyaltyCard({ points = 0 }: { points?: number }) {
  const tier = getTier(points);
  const next = getNextTier(points);
  const pct = next
    ? Math.min(100, ((points - tier.min) / (next.min - tier.min)) * 100)
    : 100;

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between">
          <Badge>{tier.name}</Badge>
          <span className="text-sm text-muted-foreground">{points} pts</span>
        </div>
        <p className="text-sm">{tier.discount}% discount on every purchase</p>
        <div className="h-2 w-full rounded bg-muted">
          <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {next
            ? `${next.min - points} points to ${next.name} (${next.discount}% off)`
            : "Top tier reached"}
        </p>
      </CardContent>
    </Card>
  );
}