import { cn } from "@/lib/utils";

/**
 * App mark: a ledger page with ruled lines on a tile in the palette's
 * call-to-action gradient, so it changes with the chosen palette.
 */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[28%] bg-brand-fill shadow-sm", className)}
    >
      <svg viewBox="0 0 32 32" className="h-full w-full">
        <path d="M9 8.5h10.5a4 4 0 0 1 4 4V23.5H13a4 4 0 0 1-4-4z" fill="var(--sidebar)" />
        <path d="M13 13.5h6.5M13 17.5h6.5" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
