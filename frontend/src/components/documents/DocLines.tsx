import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatPrice } from "@/lib/pricing";

interface Line {
  name: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitSize?: number;
  baseUnit?: string;
  unitPrice?: number;
  unitCost?: number;
  priceSource?: string;
  discountPercent: number;
  taxPercent: number;
  taxableValue: number;
  lineTotal: number;
}

interface Totals {
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  interState: boolean;
  loyaltyDiscountTotal?: number;
}

/** Line items and GST totals of a quotation, challan or bill. */
export default function DocLines({ items, totals, totalLabel = "Total" }: { items: Line[]; totals: Totals; totalLabel?: string }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Item</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs text-right">Rate</TableHead>
              <TableHead className="text-xs text-right hidden sm:table-cell">Disc</TableHead>
              <TableHead className="text-xs text-right hidden sm:table-cell">GST</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, i) => (
              <TableRow key={i}>
                <TableCell className="py-2">
                  <p className="text-sm font-medium">{it.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {it.sku}
                    {it.unitSize && it.unitSize !== 1 ? ` · ${it.unit} of ${it.unitSize} ${it.baseUnit}` : ""}
                    {it.priceSource && it.priceSource !== "Retail" ? ` · ${it.priceSource}` : ""}
                  </p>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums whitespace-nowrap">
                  {it.quantity} {it.unit}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{formatPrice(it.unitPrice ?? it.unitCost ?? 0)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums hidden sm:table-cell">
                  {it.discountPercent ? `${it.discountPercent}%` : "—"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums hidden sm:table-cell">{it.taxPercent}%</TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">{formatINR(it.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        {(totals.loyaltyDiscountTotal ?? 0) > 0 && (
          <Row label="Loyalty discount" value={`− ${formatINR(totals.loyaltyDiscountTotal ?? 0)}`} />
        )}
        <Row label="Taxable value" value={formatINR(totals.taxableTotal)} />
        {totals.interState ? (
          <Row label="IGST" value={formatINR(totals.igstTotal)} />
        ) : (
          <>
            <Row label="CGST" value={formatINR(totals.cgstTotal)} />
            <Row label="SGST" value={formatINR(totals.sgstTotal)} />
          </>
        )}
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
          <dt>{totalLabel}</dt>
          <dd className="tabular-nums">{formatINR(totals.grandTotal)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
