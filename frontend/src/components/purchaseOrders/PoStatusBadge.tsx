import { cn } from "@/lib/utils";

const STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  pending: { label: "Needs approval", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20", dot: "bg-amber-500" },
  approved: { label: "Waiting for goods", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20", dot: "bg-sky-500" },
  received: { label: "Received", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", cls: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground" },
};

/** Purchase order status in plain words: "● Needs approval", "● Waiting for goods". */
export default function PoStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STYLE[status] ?? STYLE.rejected;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", s.cls, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
