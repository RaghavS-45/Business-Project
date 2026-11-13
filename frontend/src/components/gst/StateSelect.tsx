import { useGstStates } from "@/hooks/useSettings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";

/** GST state picker ("07 · Delhi"). Empty string means "not set". */
export default function StateSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { data: states = [] } = useGstStates();
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select state" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>Not set</SelectItem>
        {states.map((s) => (
          <SelectItem key={s.code} value={s.code}>
            {s.code} · {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
