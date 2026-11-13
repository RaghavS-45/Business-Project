import { useFieldArray, useForm } from "react-hook-form";
import { allowsDecimal } from "@/lib/unitPricing";
import { Plus, Trash2 } from "lucide-react";

type LevelPrices = { wholesale?: number | null; distributor?: number | null } | undefined;
type PackInput = { name: string; size: number; price?: number | null };
const moneyText = (v?: number | null) => (v === null || v === undefined ? "" : String(v));
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
import { getErrorMessage } from "@/lib/errors";

const CATEGORIES = [
  "Electronics", "Clothing", "Food & Beverage", "Household",
  "Stationery", "Health & Beauty", "Toys & Games",
  "Sports & Outdoors", "Automotive", "Other",
];
const UNITS = ["pcs", "kg", "g", "ltr", "ml", "m", "box", "pack", "dozen", "pair"];
// Common GST slabs. Any other rate can still be saved through the API.
const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  costPrice: z.coerce.number().min(0, "Must be >= 0"),
  sellingPrice: z.coerce.number().min(0, "Must be >= 0"),
  stock: z.coerce.number().min(0, "Must be >= 0"),
  lowStockThreshold: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100),
  hsnCode: z
    .string()
    .trim()
    .regex(/^(\d{4}|\d{6}|\d{8})?$/, "HSN code must be 4, 6 or 8 digits")
    .optional(),
  description: z.string().optional(),
  // Wholesale pricing (blank = not set)
  wholesalePrice: z.string().optional(),
  distributorPrice: z.string().optional(),
  packs: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name"),
        size: z.coerce.number().positive("> 0"),
        price: z.string().optional(),
      })
    )
    .optional(),
  priceSlabs: z
    .array(
      z.object({
        minQty: z.coerce.number().positive("> 0"),
        price: z.coerce.number().min(0, ">= 0"),
      })
    )
    .optional(),
}).superRefine((d, ctx) => {
  if (!allowsDecimal(d.unit)) {
    if (!Number.isInteger(d.stock)) ctx.addIssue({ code: "custom", path: ["stock"], message: `${d.unit} is counted in whole numbers` });
  }
  const names = (d.packs ?? []).map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["packs"], message: "Each pack name can only be used once" });
  if (names.includes(d.unit)) ctx.addIssue({ code: "custom", path: ["packs"], message: `A pack can't be called "${d.unit}" (the base unit)` });
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
    control,
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
      lowStockThreshold: (defaultValues?.lowStockThreshold as number) ?? 10,
      taxRate: (defaultValues?.taxRate as number) ?? 18,
      hsnCode: (defaultValues?.hsnCode as string) || "",
      description: (defaultValues?.description as string) || "",
      wholesalePrice: moneyText((defaultValues?.levelPrices as LevelPrices)?.wholesale),
      distributorPrice: moneyText((defaultValues?.levelPrices as LevelPrices)?.distributor),
      packs: ((defaultValues?.packs as PackInput[]) ?? []).map((p) => ({
        name: p.name,
        size: p.size,
        price: moneyText(p.price),
      })),
      priceSlabs: (defaultValues?.priceSlabs as Array<{ minQty: number; price: number }>) ?? [],
    },
  });
  const packs = useFieldArray({ control, name: "packs" });
  const slabs = useFieldArray({ control, name: "priceSlabs" });

  const category = watch("category");
  const unit = watch("unit");
  const taxRate = watch("taxRate");

  const onSubmit = (form: ProductFormData) => {
    const { wholesalePrice, distributorPrice, ...rest } = form;
    const toMoney = (v?: string) => (v === undefined || v.trim() === "" ? null : Number(v));
    const data = {
      ...rest,
      levelPrices: { wholesale: toMoney(wholesalePrice), distributor: toMoney(distributorPrice) },
      packs: (form.packs ?? []).map((p) => ({ name: p.name.trim().toLowerCase(), size: p.size, price: toMoney(p.price) })),
      priceSlabs: form.priceSlabs ?? [],
    };
    if (isEdit) {
      updateProduct.mutate(
        { id: defaultValues!._id as string, ...data },
        {
          onSuccess: () => {
            toast.success("Product updated");
            onSuccess?.();
          },
          onError: (e) => toast.error(getErrorMessage(e, "Failed to update product")),
        }
      );
    } else {
      createProduct.mutate(data, {
        onSuccess: () => {
          toast.success("Product created");
          onSuccess?.();
        },
        onError: (e) => toast.error(getErrorMessage(e, "Failed to create product")),
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
          <Label>GST Rate *</Label>
          <Select value={String(taxRate)} onValueChange={(v) => setValue("taxRate", Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...GST_RATES, Number(taxRate)])]
                .sort((a, b) => a - b)
                .map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r === 0 ? "0% (exempt / nil)" : `${r}%`}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hsnCode">HSN Code</Label>
          <Input
            id="hsnCode"
            inputMode="numeric"
            placeholder="e.g. 8517"
            {...register("hsnCode")}
            className={errors.hsnCode ? "border-destructive" : ""}
          />
          {errors.hsnCode && <p className="text-xs text-destructive">{errors.hsnCode.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stock">Stock *</Label>
          <Input id="stock" type="number" step={allowsDecimal(unit) ? "0.001" : "1"} {...register("stock")} />
          {errors.stock && <p className="text-xs text-destructive">{errors.stock.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
          <Input id="lowStockThreshold" type="number" step={allowsDecimal(unit) ? "0.001" : "1"} {...register("lowStockThreshold")} />
        </div>
      </div>

      {/* ─── Wholesale pricing & packs ─────────────────────── */}
      <div className="space-y-4 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Wholesale pricing</p>
          <p className="text-xs text-muted-foreground">
            Optional. Prices are per {unit}. Customers always get the lowest price that applies.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="wholesalePrice" className="text-xs">Wholesale price</Label>
            <Input id="wholesalePrice" type="number" step="0.01" min={0} placeholder="Same as selling" {...register("wholesalePrice")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="distributorPrice" className="text-xs">Distributor price</Label>
            <Input id="distributorPrice" type="number" step="0.01" min={0} placeholder="Same as selling" {...register("distributorPrice")} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Bulk prices</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => slabs.append({ minQty: 10, price: 0 })}>
              <Plus className="mr-1 h-3 w-3" /> Add slab
            </Button>
          </div>
          {slabs.fields.length === 0 && (
            <p className="text-[11px] text-muted-foreground">e.g. from 10 {unit} at a lower price per {unit}</p>
          )}
          {slabs.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">From</span>
              <Input type="number" step="any" min={0} className="h-8 w-20" aria-label="Minimum quantity" {...register(`priceSlabs.${i}.minQty`)} />
              <span className="text-muted-foreground">{unit} at ₹</span>
              <Input type="number" step="0.01" min={0} className="h-8 w-24" aria-label="Price per unit" {...register(`priceSlabs.${i}.price`)} />
              <span className="text-muted-foreground">/{unit}</span>
              <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => slabs.remove(i)} aria-label="Remove slab">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Pack sizes</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => packs.append({ name: "", size: 12, price: "" })}>
              <Plus className="mr-1 h-3 w-3" /> Add pack
            </Button>
          </div>
          {packs.fields.length === 0 && (
            <p className="text-[11px] text-muted-foreground">e.g. sell by the carton of 24 {unit}. Stock stays counted in {unit}.</p>
          )}
          {packs.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <Input placeholder="carton" className="h-8 w-24" aria-label="Pack name" {...register(`packs.${i}.name`)} />
              <span className="text-muted-foreground">=</span>
              <Input type="number" step="any" min={0} className="h-8 w-16" aria-label="Units per pack" {...register(`packs.${i}.size`)} />
              <span className="text-muted-foreground">{unit}, price ₹</span>
              <Input type="number" step="0.01" min={0} placeholder="auto" className="h-8 w-24" aria-label="Pack price" {...register(`packs.${i}.price`)} />
              <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => packs.remove(i)} aria-label="Remove pack">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {errors.packs?.message && <p className="text-xs text-destructive">{errors.packs.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} {...register("description")} placeholder="Optional" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isPending} >
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
