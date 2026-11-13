import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * Quotations, delivery challans, purchase bills and supplier payables.
 */

// ─── Shared shapes ─────────────────────────────────────────

export interface Party {
  name: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  phone?: string;
}

export interface PricedLine {
  product: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  unitSize: number;
  baseUnit: string;
  baseQuantity: number;
  priceSource: string;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  hsnCode: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

interface Totals {
  subtotal: number;
  discountTotal: number;
  loyaltyDiscountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  interState: boolean;
}

export interface SellLineInput {
  product: string;
  quantity: number;
  unit?: string;
  discountPercent?: number;
}

interface Paged {
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const listQuery = <T,>(key: string, path: string, params: Record<string, unknown>, enabled = true) => ({
  enabled,
  queryKey: [key, params],
  queryFn: async () => {
    const { data } = await api.get(path, { params });
    return data.data as T;
  },
});

// ─── Quotations ────────────────────────────────────────────

export type QuotationStatus = "OPEN" | "ACCEPTED" | "DECLINED" | "CONVERTED";

export interface Quotation extends Totals {
  _id: string;
  quoteNumber: string;
  customer: string | { _id: string; name: string; phone?: string; priceLevel?: string } | null;
  buyer: Party;
  items: PricedLine[];
  validUntil: string;
  status: QuotationStatus;
  isExpired: boolean;
  convertedTo?: { kind: "SALE" | "CHALLAN" | null; id: string | null; number: string; at: string | null };
  notes?: string;
  createdAt: string;
}

export function useQuotations(params: { page?: number; status?: string; search?: string } = {}) {
  return useQuery(listQuery<{ quotations: Quotation[] } & Paged>("quotations", "/quotations", params));
}

export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: ["quotations", "one", id],
    queryFn: async () => (await api.get(`/quotations/${id}`)).data.data.quotation as Quotation,
    enabled: !!id,
  });
}

export function useCreateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer?: string;
      partyName?: string;
      partyPhone?: string;
      items: SellLineInput[];
      validDays?: number;
      notes?: string;
    }) => (await api.post("/quotations", input)).data.data.quotation as Quotation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotations"] }),
  });
}

export function useSetQuotationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "OPEN" | "ACCEPTED" | "DECLINED" }) =>
      (await api.patch(`/quotations/${id}/status`, { status })).data.data.quotation as Quotation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotations"] }),
  });
}

// ─── Delivery challans ─────────────────────────────────────

export type ChallanStatus = "OPEN" | "INVOICED" | "CANCELLED";

export interface Challan extends Totals {
  _id: string;
  challanNumber: string;
  customer: string | { _id: string; name: string; phone?: string };
  buyer: Party;
  items: PricedLine[];
  status: ChallanStatus;
  deliveryAddress?: string;
  vehicleNumber?: string;
  transporter?: string;
  quoteNumber?: string;
  sale?: string | null;
  invoiceNumber?: string;
  invoicedAt?: string | null;
  cancelReason?: string;
  notes?: string;
  createdAt: string;
}

export function useChallans(params: { page?: number; status?: string; search?: string } = {}) {
  return useQuery(listQuery<{ challans: Challan[] } & Paged>("challans", "/challans", params));
}

export function useChallan(id: string | undefined) {
  return useQuery({
    queryKey: ["challans", "one", id],
    queryFn: async () => (await api.get(`/challans/${id}`)).data.data.challan as Challan,
    enabled: !!id,
  });
}

const invalidateStock = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["challans"] });
  qc.invalidateQueries({ queryKey: ["quotations"] });
  qc.invalidateQueries({ queryKey: ["products"] });
};

export function useCreateChallan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer?: string;
      quotation?: string;
      items?: SellLineInput[];
      deliveryAddress?: string;
      vehicleNumber?: string;
      transporter?: string;
      notes?: string;
    }) => (await api.post("/challans", input)).data.data.challan as Challan,
    onSuccess: () => invalidateStock(qc),
  });
}

export function useInvoiceChallan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; paymentMethod: string; amountPaid?: number; notes?: string }) =>
      (await api.post(`/challans/${id}/invoice`, body)).data.data.sale as { _id: string; invoiceNumber: string; grandTotal: number },
    onSuccess: () => {
      invalidateStock(qc);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["receivables"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useCancelChallan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post(`/challans/${id}/cancel`, { reason })).data.data.challan as Challan,
    onSuccess: () => invalidateStock(qc),
  });
}

// ─── Purchase bills ────────────────────────────────────────

export interface BillLine {
  product: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  unitSize: number;
  baseUnit: string;
  baseQuantity: number;
  unitCost: number;
  discountPercent: number;
  taxPercent: number;
  hsnCode: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

export interface PurchaseBill {
  _id: string;
  billNumber: string;
  supplierInvoiceNo: string;
  billDate: string;
  vendor: string;
  supplier: { name: string; gstin?: string; stateCode?: string };
  poNumber?: string;
  stockAdded: boolean;
  items?: BillLine[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
  interState: boolean;
  paidAtBill: number;
  paymentMethod?: string;
  amountPaid: number;
  balanceDue: number;
  dueDate: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  status: "POSTED" | "CANCELLED";
  cancelReason?: string;
  notes?: string;
  createdAt: string;
  payments?: Array<{ _id: string; paymentNumber: string; paidAt: string; method: string; reference?: string; amount: number }>;
}

export interface BillLineInput {
  product: string;
  quantity: number;
  unit?: string;
  unitCost: number;
  discountPercent?: number;
  taxPercent?: number;
}

export function usePurchaseBills(
  params: { page?: number; status?: string; paymentStatus?: string; search?: string; vendor?: string } = {},
  enabled = true
) {
  return useQuery(listQuery<{ bills: PurchaseBill[] } & Paged>("payables", "/payables/bills", params, enabled));
}

export function usePurchaseBill(id: string | undefined) {
  return useQuery({
    queryKey: ["payables", "bill", id],
    queryFn: async () => (await api.get(`/payables/bills/${id}`)).data.data.bill as PurchaseBill,
    enabled: !!id,
  });
}

const invalidatePayables = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["payables"] });
  qc.invalidateQueries({ queryKey: ["vendors"] });
};

export function useCreatePurchaseBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      vendor: string;
      supplierInvoiceNo: string;
      billDate?: string;
      dueDate?: string;
      purchaseOrder?: string;
      items: BillLineInput[];
      amountPaid?: number;
      paymentMethod?: string;
      notes?: string;
    }) => (await api.post("/payables/bills", input)).data.data.bill as PurchaseBill,
    onSuccess: () => {
      invalidatePayables(qc);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export function useCancelPurchaseBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post(`/payables/bills/${id}/cancel`, { reason })).data.data.bill as PurchaseBill,
    onSuccess: () => {
      invalidatePayables(qc);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

// ─── Payables ──────────────────────────────────────────────

export interface PayablesRow {
  vendorId: string;
  name: string;
  phone?: string;
  bills: number;
  nextDue: string | null;
  outstanding: number;
  current: number;
  dueThisWeek: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}

export interface PayablesReport {
  totals: Omit<PayablesRow, "vendorId" | "name" | "phone" | "bills" | "nextDue"> & { overdue: number; vendors: number };
  vendors: PayablesRow[];
}

export interface OpenBill {
  _id: string;
  billNumber: string;
  supplierInvoiceNo: string;
  billDate: string;
  dueDate: string | null;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: string;
  daysOverdue: number;
}

export interface VendorLedger {
  vendor: { _id: string; name: string; phone?: string; email?: string; gstin?: string; paymentTermsDays: number; outstanding: number };
  closing: number;
  overdue: number;
  entries: Array<{
    date: string;
    type: "BILL" | "PAYMENT";
    ref: string;
    refId: string;
    description: string;
    billed: number;
    paid: number;
    balance: number;
  }>;
  openBills: OpenBill[];
}

export function usePayablesReport() {
  return useQuery({
    queryKey: ["payables", "report"],
    queryFn: async () => (await api.get("/payables")).data.data as PayablesReport,
  });
}

export function useOpenBills(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["payables", "open", vendorId],
    queryFn: async () => (await api.get(`/payables/vendors/${vendorId}/open`)).data.data.bills as OpenBill[],
    enabled: !!vendorId,
  });
}

export function useVendorLedger(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["payables", "ledger", vendorId],
    queryFn: async () => (await api.get(`/payables/vendors/${vendorId}/ledger`)).data.data as VendorLedger,
    enabled: !!vendorId,
  });
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { vendor: string; amount: number; method: string; reference?: string; paidAt?: string; notes?: string }) =>
      (await api.post("/payables/payments", input)).data.data.payment as {
        paymentNumber: string;
        amount: number;
        allocations: Array<{ billNumber: string; supplierInvoiceNo: string; amount: number }>;
      },
    onSuccess: () => invalidatePayables(qc),
  });
}
