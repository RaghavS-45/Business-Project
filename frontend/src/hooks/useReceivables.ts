import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

export interface DuesRow {
  customerId: string;
  name: string;
  phone?: string;
  creditLimit: number | null;
  invoices: number;
  oldestDue: string | null;
  outstanding: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}

export interface DuesReport {
  totals: Omit<DuesRow, "customerId" | "name" | "phone" | "creditLimit" | "invoices" | "oldestDue"> & {
    overdue: number;
    customers: number;
  };
  customers: DuesRow[];
}

export interface OpenInvoice {
  _id: string;
  invoiceNumber: string;
  createdAt: string;
  dueDate: string | null;
  grandTotal: number;
  returnedTotal?: number;
  amountPaid?: number;
  balanceDue: number;
  paymentStatus: string;
  daysOverdue: number;
}

export interface LedgerEntry {
  date: string;
  type: "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "REFUND";
  ref: string;
  refId: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Ledger {
  customer: {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    gstin?: string;
    creditLimit: number | null;
    paymentTermsDays: number;
    outstanding: number;
  };
  opening: number;
  closing: number;
  overdue: number;
  entries: LedgerEntry[];
  openInvoices: OpenInvoice[];
}

/** Everyone who owes money, by how overdue. */
export function useDuesReport() {
  return useQuery({
    queryKey: ["receivables", "report"],
    queryFn: async () => {
      const { data } = await api.get("/receivables");
      return data.data as DuesReport;
    },
  });
}

export function useLedger(customerId: string | undefined, range: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ["receivables", "ledger", customerId, range],
    queryFn: async () => {
      const { data } = await api.get(`/receivables/customers/${customerId}/ledger`, { params: range });
      return data.data as Ledger;
    },
    enabled: !!customerId,
  });
}

export function useOpenInvoices(customerId: string | undefined) {
  return useQuery({
    queryKey: ["receivables", "open", customerId],
    queryFn: async () => {
      const { data } = await api.get(`/receivables/customers/${customerId}/open`);
      return data.data.invoices as OpenInvoice[];
    },
    enabled: !!customerId,
  });
}

export interface PaymentInput {
  customer: string;
  amount: number;
  method: string;
  reference?: string;
  receivedAt?: string;
  notes?: string;
  allocations?: Array<{ sale: string; amount: number }>;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentInput) => {
      const { data } = await api.post("/receivables/payments", input);
      return data.data.payment as { receiptNumber: string; amount: number; allocations: Array<{ invoiceNumber: string; amount: number }> };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivables"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}
