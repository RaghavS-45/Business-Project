import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomers } from "@/hooks/useCustomers";
import type { BuyerCustomer } from "@/lib/editorLines";

/** Saved customers, with their price level shown. */
export default function CustomerSelect({
  value,
  onChange,
  allowOther = false,
  id,
}: {
  value: string;
  onChange: (id: string, customer: BuyerCustomer | null) => void;
  /** Adds "Someone else" (value "other") for quotes to new parties */
  allowOther?: boolean;
  id?: string;
}) {
  const { data } = useCustomers({ limit: 100 });
  const customers: BuyerCustomer[] = data?.customers ?? [];
  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onChange(v, customers.find((c) => c._id === v) ?? null)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose customer" />
      </SelectTrigger>
      <SelectContent>
        {allowOther && <SelectItem value="other">Someone else (not saved)</SelectItem>}
        {customers.map((c) => (
          <SelectItem key={c._id} value={c._id}>
            {c.name}
            {c.priceLevel && c.priceLevel !== "RETAIL" && (
              <span className="ml-1 text-[10px] text-muted-foreground">· {c.priceLevel.toLowerCase()}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
