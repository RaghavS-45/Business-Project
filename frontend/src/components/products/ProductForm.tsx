import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateProduct, useUpdateProduct } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "Electronics", "Clothing", "Food & Beverage", "Household",
  "Stationery", "Health & Beauty", "Toys & Games",
  "Sports & Outdoors", "Automotive", "Other",
];
const UNITS = ["pcs", "kg", "g", "ltr", "ml", "m", "box", "pack", "dozen", "pair"];

const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  costPrice: z.coerce.number().min(0, "Must be >= 0"),
  sellingPrice: z.coerce.number().min(0, "Must be >= 0"),
  stock: z.coerce.number().int().min(0, "Must be >= 0"),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  description: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  defaultValues?: Record<string, unknown>;
  onSuccess?: () => void;
}

export default function ProductForm({ defaultValues, onSuccess }: ProductFormProps) {
  const isEdit = !!defaultValues?._id;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: {
      name: (defaultValues?.name as string) || "",
      sku: (defaultValues?.sku as string) || "",
      category: (defaultValues?.category as string) || "",
      unit: (defaultValues?.unit as string) || "pcs",
      costPrice: (defaultValues?.costPrice as number) || 0,
      sellingPrice: (defaultValues?.sellingPrice as number) || 0,
      stock: (defaultValues?.stock as number) || 0,
      lowStockThreshold: (defaultValues?.lowStockThreshold as number) || 10,
      description: (defaultValues?.description as string) || "",
    },
  });

  const category = watch("category");
  const unit = watch("unit");

  const onSubmit = (data: ProductFormData) => {
    if (isEdit) {
      updateProduct.mutate(
        { id: defaultValues!._id as string, ...data },
        {
          onSuccess: () => {
            toast.success("Product updated");
            onSuccess?.();
          },
          onError: () => toast.error("Failed to update product"),
        }
      );
    } else {
      createProduct.mutate(data, {
        onSuccess: () => {
          toast.success("Product created");
          onSuccess?.();
        },
        onError: () => toast.error("Failed to create product"),
      });
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Product Name *</Label>
        <Input id="name" {...register("name")} className={errors.name ? "border-destructive" : ""} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU (auto if blank)</Label>
          <Input id="sku" {...register("sku")} placeholder="PRD-XXXXXX" />
        </div>
        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={category} onValueChange={(v) => setValue("category", v)}>
            <SelectTrigger className={errors.category ? "border-destructive" : ""}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="costPrice">Cost Price *</Label>
          <Input id="costPrice" type="number" step="0.01" {...register("costPrice")} />
          {errors.costPrice && <p className="text-xs text-destructive">{errors.costPrice.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="sellingPrice">Selling Price *</Label>
          <Input id="sellingPrice" type="number" step="0.01" {...register("sellingPrice")} />
          {errors.sellingPrice && <p className="text-xs text-destructive">{errors.sellingPrice.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Unit *</Label>
          <Select value={unit} onValueChange={(v) => setValue("unit", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stock">Stock *</Label>
          <Input id="stock" type="number" {...register("stock")} />
          {errors.stock && <p className="text-xs text-destructive">{errors.stock.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
          <Input id="lowStockThreshold" type="number" {...register("lowStockThreshold")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} {...register("description")} placeholder="Optional" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isPending} className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : isEdit ? (
            "Update Product"
          ) : (
            "Create Product"
          )}
        </Button>
      </div>
    </form>
  );
}
