import { useState } from "react";
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } from "@/hooks/useVendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface VendorFormData {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
}

export default function VendorsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useVendors({ page, limit: 15, search: search || undefined });
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const vendors = data?.vendors || data?.docs || [];
  const total = data?.total || data?.totalDocs || 0;
  const totalPages = data?.totalPages || Math.ceil(total / 15) || 1;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<VendorFormData>();

  const openCreate = () => { setEditing(null); reset({ name: "", contactPerson: "", email: "", phone: "" }); setDialogOpen(true); };
  const openEdit = (v: Record<string, unknown>) => {
    setEditing(v);
    reset({ name: v.name as string, contactPerson: (v.contactPerson as string) || "", email: (v.email as string) || "", phone: (v.phone as string) || "" });
    setDialogOpen(true);
  };

  const onSubmit = (data: VendorFormData) => {
    const payload = { ...data, email: data.email || undefined, phone: data.phone || undefined, contactPerson: data.contactPerson || undefined };
    if (editing) {
      updateVendor.mutate({ id: editing._id as string, ...payload }, {
        onSuccess: () => { toast.success("Vendor updated"); setDialogOpen(false); },
        onError: () => toast.error("Failed to update"),
      });
    } else {
      createVendor.mutate(payload, {
        onSuccess: () => { toast.success("Vendor created"); setDialogOpen(false); },
        onError: () => toast.error("Failed to create"),
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      deleteVendor.mutate(id, {
        onSuccess: () => toast.success(`"${name}" deleted`),
        onError: () => toast.error("Failed to delete"),
      });
    }
  };

  const isPending = createVendor.isPending || updateVendor.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} vendors</p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20">
          <Plus className="mr-2 h-4 w-4" />Add Vendor
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search vendors..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="text-xs font-semibold">Company</TableHead>
                <TableHead className="text-xs font-semibold">Contact</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Phone</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v: { _id: string; name: string; contactPerson?: string; email?: string; phone?: string }) => (
                <TableRow key={v._id} className="border-border/30 hover:bg-muted/20">
                  <TableCell className="font-medium text-sm">{v.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.contactPerson || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.email || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.phone || "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(v as unknown as Record<string, unknown>)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(v._id, v.name)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {vendors.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No vendors found</TableCell></TableRow>}
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
          <DialogHeader><DialogTitle>{editing ? "Edit Vendor" : "Add Vendor"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="v-name">name *</Label>
              <Input id="v-name" {...register("name", { required: "Required", minLength: { value: 2, message: "Min 2 chars" } })} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-contact">Contact Person</Label>
              <Input id="v-contact" {...register("contactPerson")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-email">Email</Label>
                <Input id="v-email" type="email" {...register("email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-phone">Phone</Label>
                <Input id="v-phone" {...register("phone")} />
              </div>
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
