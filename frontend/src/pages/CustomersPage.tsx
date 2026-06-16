import { useState } from "react";
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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface CustomerFormData {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useCustomers({ page, limit: 15, search: search || undefined });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const customers = data?.customers || data?.docs || [];
  const total = data?.total || data?.totalDocs || 0;
  const totalPages = data?.totalPages || Math.ceil(total / 15) || 1;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormData>();

  const openCreate = () => { setEditing(null); reset({ name: "", email: "", phone: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (c: Record<string, unknown>) => {
    setEditing(c);
    reset({ name: c.name as string, email: (c.email as string) || "", phone: (c.phone as string) || "", notes: (c.notes as string) || "" });
    setDialogOpen(true);
  };

  const onSubmit = (data: CustomerFormData) => {
    const payload = { ...data, email: data.email || undefined, phone: data.phone || undefined };
    if (editing) {
      updateCustomer.mutate({ id: editing._id as string, ...payload }, {
        onSuccess: () => { toast.success("Customer updated"); setDialogOpen(false); },
        onError: () => toast.error("Failed to update"),
      });
    } else {
      createCustomer.mutate(payload, {
        onSuccess: () => { toast.success("Customer created"); setDialogOpen(false); },
        onError: () => toast.error("Failed to create"),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      deleteCustomer.mutate(id, {
        onSuccess: () => toast.success(`"${name}" deleted`),
        onError: () => toast.error("Failed to delete"),
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
        <Button onClick={openCreate} className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20">
          <Plus className="mr-2 h-4 w-4" />Add Customer
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold text-right">Loyalty</TableHead>
                <TableHead className="text-xs font-semibold text-right">Purchases</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c: { _id: string; name: string; email?: string; phone?: string; loyaltyPoints: number; totalPurchases: number }) => (
                <TableRow key={c._id} className="border-border/30 hover:bg-muted/20">
                  <TableCell className="font-medium text-sm">{c.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.email || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/20">{c.loyaltyPoints} pts</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">₹{(c.totalPurchases || 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c as unknown as Record<string, unknown>)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(c._id, c.name)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No customers found</TableCell></TableRow>}
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
            <div className="space-y-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Input id="c-notes" {...register("notes")} placeholder="Optional" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending} className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white">
                {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
