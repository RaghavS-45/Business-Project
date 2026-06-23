import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useVendors } from "@/hooks/useVendors";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface LineItemField {
  product: string;
  quantity: number;
  unitCost: number;
}

interface POFormData {
  vendor: string;
  items: LineItemField[];
  notes: string;
  expectedDelivery: string;
}

interface Props {
  onSuccess: () => void;
}

export default function PurchaseOrderForm({ onSuccess }: Props) {
  const createPO = useCreatePurchaseOrder();
  const { data: vendorData } = useVendors({ limit: 100 });
  const { data: productData } = useProducts({ limit: 100});

  const vendors = vendorData?.vendors || vendorData?.docs || [];
  const products = productData?.products || [];

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<POFormData>({
    defaultValues: {
      vendor: "",
      items: [{ product: "", quantity: 1, unitCost: 0 }],
      notes: "",
      expectedDelivery: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchedItems = watch("items");

  const totalAmount = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
    0
  );

  const onSubmit = (data: POFormData) => {
    const payload = {
      vendor: data.vendor,
      items: data.items.map((i) => ({
        product: i.product,
        quantity: Number(i.quantity),
        unitCost: Number(i.unitCost),
      })),
      notes: data.notes || undefined,
      expectedDelivery: data.expectedDelivery || undefined,
    };

    createPO.mutate(payload, {
      onSuccess: () => {
        toast.success("Purchase order created");
        onSuccess();
      },
      onError: () => toast.error("Failed to create purchase order"),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Vendor */}
      <div className="space-y-2">
        <Label>Vendor *</Label>
        <Select onValueChange={(v) => setValue("vendor", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a vendor" />
          </SelectTrigger>
          <SelectContent>
            {vendors.map((v: { _id: string; name: string }) => (
              <SelectItem key={v._id} value={v._id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.vendor && (
          <p className="text-xs text-destructive">{errors.vendor.message}</p>
        )}
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Products *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ product: "", quantity: 1, unitCost: 0 })}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add item
          </Button>
        </div>

        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_80px_100px_36px] gap-2 px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground">
            <span>Product</span>
            <span>Qty</span>
            <span>Unit Cost (₹)</span>
            <span></span>
          </div>

          <div className="divide-y divide-border/30">
            {fields.map((field, index) => {
              const subtotal =
                (Number(watchedItems[index]?.quantity) || 0) *
                (Number(watchedItems[index]?.unitCost) || 0);

              return (
                <div key={field.id} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 px-3 py-2 items-center">
                  <Select
                    onValueChange={(v) => {
                      setValue(`items.${index}.product`, v);
                      // Auto-fill unit cost from product's costPrice
                      const prod = products.find((p: { _id: string }) => p._id === v);
                      if (prod) setValue(`items.${index}.unitCost`, (prod as { costPrice: number }).costPrice);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p: { _id: string; name: string; sku: string; stock: number }) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name}
                          <span className="ml-1 text-muted-foreground font-mono text-[10px]">
                            ({p.sku}) stock: {p.stock}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    min={1}
                    className="h-8 text-xs"
                    {...register(`items.${index}.quantity`, {
                      required: true,
                      min: 1,
                      valueAsNumber: true,
                    })}
                  />

                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-8 text-xs"
                    {...register(`items.${index}.unitCost`, {
                      required: true,
                      min: 0,
                      valueAsNumber: true,
                    })}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>

                  {subtotal > 0 && (
                    <div className="col-span-4 text-right text-[10px] text-muted-foreground pr-10 -mt-1 pb-1">
                      Subtotal: ₹{subtotal.toLocaleString("en-IN")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total row */}
          <div className="px-3 py-2 bg-muted/20 flex justify-end border-t border-border/30">
            <span className="text-sm font-semibold">
              Total: ₹{totalAmount.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Notes + Expected Delivery */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="po-notes">Notes</Label>
          <Input
            id="po-notes"
            placeholder="e.g. Urgent restock"
            {...register("notes")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="po-delivery">Expected Delivery</Label>
          <Input
            id="po-delivery"
            type="date"
            {...register("expectedDelivery")}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={createPO.isPending}
          className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
        >
          {createPO.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Purchase Order"
          )}
        </Button>
      </div>
    </form>
  );
}