import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  PARTIALLY_RETURNED: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  REFUNDED: "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20",
  VOID: "bg-muted text-muted-foreground ring-border",
  // Quotations, challans, bills
  OPEN: "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20",
  ACCEPTED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  DECLINED: "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20",
  EXPIRED: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  CONVERTED: "bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-500/20",
  INVOICED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  CANCELLED: "bg-muted text-muted-foreground ring-border",
  PAID: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  PARTIAL: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20",
  UNPAID: "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20",
};

const DOTS: Record<string, string> = {
  COMPLETED: "bg-emerald-500",
  PARTIALLY_RETURNED: "bg-amber-500",
  REFUNDED: "bg-red-500",
  VOID: "bg-muted-foreground",
  OPEN: "bg-sky-500",
  ACCEPTED: "bg-emerald-500",
  DECLINED: "bg-red-500",
  EXPIRED: "bg-amber-500",
  CONVERTED: "bg-violet-500",
  INVOICED: "bg-emerald-500",
  CANCELLED: "bg-muted-foreground",
  PAID: "bg-emerald-500",
  PARTIAL: "bg-amber-500",
  UNPAID: "bg-red-500",
};

const LABELS: Record<string, string> = { PARTIALLY_RETURNED: "Part returned", PARTIAL: "Part paid" };

/** Status pill: "● Completed", "● Refunded", "● Open", "● Part paid". */
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
