import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  PARTIALLY_RETURNED: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  REFUNDED: "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20",
  VOID: "bg-muted text-muted-foreground ring-border",
};

const DOTS: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  PARTIALLY_RETURNED: "bg-amber-500",
  REFUNDED: "bg-red-500",
  VOID: "bg-muted-foreground",
};

const LABELS: Record<string, string> = { PARTIALLY_RETURNED: "Part returned" };

/** Sale status pill: "● Completed", "● Refunded". */
export default function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label =
    LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        STYLES[status] ?? STYLES.VOID,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[status] ?? DOTS.VOID)} />
      {label}
    </span>
  );
}
