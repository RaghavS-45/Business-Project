import { useState } from "react";
import { useProducts, useDeleteProduct } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import ProductForm from "@/components/products/ProductForm";
import { toast } from "sonner";

const CATEGORIES = [
  "All",
  "Electronics",
  "Clothing",
  "Food & Beverage",
  "Household",
  "Stationery",
  "Health & Beauty",
  "Toys & Games",
  "Sports & Outdoors",
  "Automotive",
  "Other",
];

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useProducts({
    page,
    limit: 15,
    search: search || undefined,
    category: category === "All" ? undefined : category,
  });
  const deleteProduct = useDeleteProduct();

  const products = data?.products || data?.docs || [];
  const total = data?.total || data?.totalDocs || 0;
  const totalPages = data?.totalPages || Math.ceil(total / 15) || 1;

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"? This action cannot be undone.`)) {
      deleteProduct.mutate(id, {
        onSuccess: () => toast.success(`"${name}" deleted`),
        onError: () => toast.error("Failed to delete product"),
      });
    }
  };

  const handleEdit = (product: Record<string, unknown>) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const stockBadge = (stock: number, threshold: number) => {
    if (stock === 0)
      return <Badge variant="destructive" className="text-[10px]">Out of stock</Badge>;
    if (stock <= threshold)
      return <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">Low: {stock}</Badge>;
    return <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/20">{stock}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your inventory catalog ({total} products)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingProduct(null);
            setDialogOpen(true);
          }}
          className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="text-xs font-semibold">Product</TableHead>
                <TableHead className="text-xs font-semibold">SKU</TableHead>
                <TableHead className="text-xs font-semibold">Category</TableHead>
                <TableHead className="text-xs font-semibold text-right">Cost</TableHead>
                <TableHead className="text-xs font-semibold text-right">Price</TableHead>
                <TableHead className="text-xs font-semibold text-center">Stock</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(
                (product: {
                  _id: string;
                  name: string;
                  sku: string;
                  category: string;
                  costPrice: number;
                  sellingPrice: number;
                  stock: number;
                  lowStockThreshold: number;
                  unit: string;
                }) => (
                  <TableRow
                    key={product._id}
                    className="border-border/30 hover:bg-muted/20 transition-colors"
                  >
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {product.sku}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {product.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      ₹{product.costPrice.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      ₹{product.sellingPrice.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-center">
                      {stockBadge(product.stock, product.lowStockThreshold)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(product as unknown as Record<string, unknown>)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(product._id, product.name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              )}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No products found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} items)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            defaultValues={editingProduct || undefined}
            onSuccess={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
