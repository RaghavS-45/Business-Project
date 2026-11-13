import { useEffect, useState } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@/hooks/useCustomers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2, FileText, Wallet } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { formatINR } from "@/lib/pricing";
import StateSelect, { GSTIN_PATTERN } from "@/components/gst/StateSelect";
import RecordPaymentDialog from "@/components/receivables/RecordPaymentDialog";
import { LEVEL_LABELS, PRICE_LEVELS, type PriceLevel } from "@/lib/unitPricing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

interface CustomerFormData {
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  stateCode?: string;
  creditLimit?: string;
  paymentTermsDays?: string;
  priceLevel?: PriceLevel;
  notes?: string;
}

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [paying, setPaying] = useState<{ _id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canSeeDues = role === "ADMIN" || role === "MANAGER";

  const { data, isLoading } = useCustomers({ page, limit: 15, search: search || undefined });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? (Math.ceil(total / 15) || 1);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CustomerFormData>();
  const gstin = (watch("gstin") || "").toUpperCase();
  const stateFromGstin = GSTIN_PATTERN.test(gstin) ? gstin.slice(0, 2) : "";

  const openCreate = () => {
    setEditing(null);
    reset({ name: "", email: "", phone: "", gstin: "", stateCode: "", creditLimit: "", paymentTermsDays: "30", priceLevel: "RETAIL", notes: "" });
    setDialogOpen(true);
  };
  const openEdit = (c: Record<string, unknown>) => {
    setEditing(c);
    reset({
      name: c.name as string,
      email: (c.email as string) || "",
      phone: (c.phone as string) || "",
      gstin: (c.gstin as string) || "",
      stateCode: (c.stateCode as string) || "",
      creditLimit: c.creditLimit === null || c.creditLimit === undefined ? "" : String(c.creditLimit),
      paymentTermsDays: String(c.paymentTermsDays ?? 30),
      priceLevel: (c.priceLevel as PriceLevel) ?? "RETAIL",
      notes: (c.notes as string) || "",
    });
    setDialogOpen(true);
  };

  // Links from the command palette: ?search=…, ?new=1
  const [params] = useSearchParams();
  const paramSearch = params.get("search");
  const paramNew = params.get("new");
  useEffect(() => {
    if (paramSearch !== null) {
      setSearch(paramSearch);
      setPage(1);
    }
    if (paramNew) {
      openCreate();
    }
  }, [paramSearch, paramNew, params.get("t")]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (data: CustomerFormData) => {
    const payload = {
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      // "" clears a GSTIN / state on edit; the GSTIN decides the state
      gstin: (data.gstin || "").trim().toUpperCase(),
      stateCode: stateFromGstin || data.stateCode || "",
      // Blank = no limit
      creditLimit: data.creditLimit?.trim() ? Number(data.creditLimit) : null,
      paymentTermsDays: data.paymentTermsDays?.trim() ? Number(data.paymentTermsDays) : 30,
      priceLevel: data.priceLevel ?? "RETAIL",
    };
    if (editing) {
      updateCustomer.mutate({ id: editing._id as string, ...payload }, {
        onSuccess: () => { toast.success("Customer updated"); setDialogOpen(false); },
        onError: (e) => toast.error(getErrorMessage(e, "Failed to update")),
      });
    } else {
      createCustomer.mutate(payload, {
        onSuccess: () => { toast.success("Customer created"); setDialogOpen(false); },
        onError: (e) => toast.error(getErrorMessage(e, "Failed to create")),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      deleteCustomer.mutate(id, {
        onSuccess: () => toast.success(`"${name}" deleted`),
        onError: (e) => toast.error(getErrorMessage(e, "Failed to delete")),
      });
    }
  };

  const isPending = createCustomer.isPending || updateCustomer.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} customers</p>
        </div>
        <Button onClick={openCreate} >
          <Plus className="mr-2 h-4 w-4" />Add Customer
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold hidden lg:table-cell">Email</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">Phone</TableHead>
                <TableHead className="text-xs font-semibold text-right hidden md:table-cell">Loyalty</TableHead>
                <TableHead className="text-xs font-semibold text-right hidden md:table-cell">Purchases</TableHead>
                <TableHead className="text-xs font-semibold text-right">Owes</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c: { _id: string; name: string; email?: string; phone?: string; gstin?: string; loyaltyPoints: number; totalPurchases: number; outstanding?: number; creditLimit?: number | null; priceLevel?: PriceLevel }) => (
                <TableRow key={c._id} className="border-border/30 hover:bg-muted/20">
                  <TableCell className="font-medium text-sm">
                    {c.name}
                    {c.gstin && (
                      <p className="mt-0.5 font-mono text-[11px] font-normal text-muted-foreground">GSTIN {c.gstin}</p>
                    )}
                    {c.priceLevel && c.priceLevel !== "RETAIL" && (
                      <span className="mt-0.5 inline-flex rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        {LEVEL_LABELS[c.priceLevel]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{c.email || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{c.phone || "—"}</TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/20">{c.loyaltyPoints} pts</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium hidden md:table-cell">{formatINR(c.totalPurchases || 0)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {(c.outstanding ?? 0) > 0 ? (
                      canSeeDues ? (
                        <Link to={`/customers/${c._id}/statement`} className="font-medium text-amber-600 dark:text-amber-400 hover:underline">
                          {formatINR(c.outstanding ?? 0)}
                        </Link>
                      ) : (
                        <span className="font-medium text-amber-600 dark:text-amber-400">{formatINR(c.outstanding ?? 0)}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                    {c.creditLimit !== null && c.creditLimit !== undefined && (
                      <p className="text-[10px] text-muted-foreground">limit {formatINR(c.creditLimit)}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c as unknown as Record<string, unknown>)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        {canSeeDues && (
                          <>
                            <DropdownMenuItem onClick={() => navigate(`/customers/${c._id}/statement`)}><FileText className="mr-2 h-4 w-4" />Statement</DropdownMenuItem>
                            {(c.outstanding ?? 0) > 0 && (
                              <DropdownMenuItem onClick={() => setPaying({ _id: c._id, name: c.name })}><Wallet className="mr-2 h-4 w-4" />Record payment</DropdownMenuItem>
                            )}
                          </>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(c._id, c.name)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No customers found</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-name">Name *</Label>
              <Input id="c-name" {...register("name", { required: "Name is required", minLength: { value: 2, message: "Min 2 chars" } })} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" {...register("email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" {...register("phone")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-gstin">GSTIN</Label>
                <Input
                  id="c-gstin"
                  placeholder="For registered businesses"
                  className={`uppercase font-mono ${errors.gstin ? "border-destructive" : ""}`}
                  maxLength={15}
                  {...register("gstin", {
                    validate: (v) =>
                      !v || GSTIN_PATTERN.test(v.trim().toUpperCase()) || "Enter a valid 15-character GSTIN",
                  })}
                />
                {errors.gstin && <p className="text-xs text-destructive">{errors.gstin.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-state">State</Label>
                <StateSelect
                  id="c-state"
                  value={stateFromGstin || watch("stateCode") || ""}
                  onChange={(code) => setValue("stateCode", code)}
                  disabled={!!stateFromGstin}
                />
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Buyers in another state are billed IGST; same state, CGST + SGST. The state is read from the GSTIN.
            </p>
            <div className="space-y-2">
              <Label>Price level</Label>
              <Select value={watch("priceLevel") ?? "RETAIL"} onValueChange={(v) => setValue("priceLevel", v as PriceLevel)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABELS[l]}
                      {l === "RETAIL" ? " (selling price)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Which product price they're billed at</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-limit">Credit limit (₹)</Label>
                <Input
                  id="c-limit"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  placeholder="No limit"
                  {...register("creditLimit", {
                    validate: (v) => !v || Number(v) >= 0 || "Can't be negative",
                  })}
                />
                <p className="text-[11px] text-muted-foreground">Blank = no limit · 0 = cash only</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-terms">Payment terms (days)</Label>
                <Input
                  id="c-terms"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  {...register("paymentTermsDays", {
                    validate: (v) => !v || (Number(v) >= 0 && Number(v) <= 365) || "0–365 days",
                  })}
                />
                {errors.paymentTermsDays && <p className="text-xs text-destructive">{errors.paymentTermsDays.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Input id="c-notes" {...register("notes")} placeholder="Optional" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending} >
                {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <RecordPaymentDialog customer={paying} open={!!paying} onOpenChange={(o) => !o && setPaying(null)} />
    </div>
  );
}
