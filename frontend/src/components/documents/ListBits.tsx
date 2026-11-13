import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Status filter chips + search box above a document list. */
export function ListToolbar({
  tabs,
  value,
  onChange,
  search,
  onSearch,
  placeholder,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              value === t.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-sm" />
      </div>
    </div>
  );
}

export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 text-xs text-muted-foreground">
      <span>{total} total</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Empty state for a list. */
export function EmptyList({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
