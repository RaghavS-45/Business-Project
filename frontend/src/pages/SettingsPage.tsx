import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { useStoreSettings, useUpdateStoreSettings, type StoreSettings } from "@/hooks/useSettings";
import StateSelect, { GSTIN_PATTERN } from "@/components/gst/StateSelect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";

const EMPTY: StoreSettings = {
  legalName: "",
  tradeName: "",
  gstin: "",
  stateCode: "",
  address: "",
  phone: "",
  email: "",
  pricesIncludeTax: false,
  bankDetails: "",
  invoiceTerms: "",
};

export default function SettingsPage() {
  const { data, isLoading } = useStoreSettings();
  const save = useUpdateStoreSettings();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<StoreSettings>({ defaultValues: EMPTY });

  useEffect(() => {
    if (data) reset({ ...EMPTY, ...data });
  }, [data, reset]);

  const gstin = (watch("gstin") || "").toUpperCase();
  const stateFromGstin = GSTIN_PATTERN.test(gstin) ? gstin.slice(0, 2) : "";
  const pricesIncludeTax = watch("pricesIncludeTax");

  const onSubmit = (values: StoreSettings) => {
    const { legalName, tradeName, address, phone, email, bankDetails, invoiceTerms } = values;
    save.mutate(
      {
        legalName,
        tradeName,
        address,
        phone,
        email,
        bankDetails,
        invoiceTerms,
        pricesIncludeTax: values.pricesIncludeTax,
        gstin: gstin.trim(),
        stateCode: stateFromGstin || values.stateCode || "",
      },
      {
        onSuccess: (saved) => {
          reset({ ...EMPTY, ...saved });
          toast.success("Store settings saved");
        },
        onError: (e) => toast.error(getErrorMessage(e, "Couldn't save settings")),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Business and GST details printed on every tax invoice
          </p>
        </div>
        <Button type="submit" disabled={save.isPending || !isDirty}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Business details</CardTitle>
          <CardDescription>As registered for GST</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-legal">Legal name</Label>
              <Input id="s-legal" placeholder="Sharma Traders Pvt Ltd" {...register("legalName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-trade">Trade name</Label>
              <Input id="s-trade" placeholder="Name shown at the top of invoices" {...register("tradeName")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-gstin">GSTIN</Label>
              <Input
                id="s-gstin"
                maxLength={15}
                placeholder="Leave blank if unregistered"
                className={`uppercase font-mono ${errors.gstin ? "border-destructive" : ""}`}
                {...register("gstin", {
                  validate: (v) =>
                    !v || GSTIN_PATTERN.test(v.trim().toUpperCase()) || "Enter a valid 15-character GSTIN",
                })}
              />
              {errors.gstin && <p className="text-xs text-destructive">{errors.gstin.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-state">State</Label>
              <StateSelect
                id="s-state"
                value={stateFromGstin || watch("stateCode") || ""}
                onChange={(code) => setValue("stateCode", code, { shouldDirty: true })}
                disabled={!!stateFromGstin}
              />
              <p className="text-[11px] text-muted-foreground">
                Read from the GSTIN. Buyers in other states are billed IGST.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-address">Address</Label>
            <Textarea id="s-address" rows={2} {...register("address")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" {...register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-email">Email</Label>
              <Input id="s-email" type="email" {...register("email")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-6">
            <div>
              <Label htmlFor="s-inclusive" className="text-sm font-medium">
                Selling prices include GST
              </Label>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                {pricesIncludeTax
                  ? "Retail / MRP style: the price on the product is what the customer pays, and GST is calculated from inside it."
                  : "Wholesale / B2B style: GST is added on top of the selling price at checkout."}
              </p>
            </div>
            <Switch
              id="s-inclusive"
              checked={!!pricesIncludeTax}
              onCheckedChange={(v) => setValue("pricesIncludeTax", v, { shouldDirty: true })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Invoice footer</CardTitle>
          <CardDescription>Optional — printed at the bottom of each invoice</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-bank">Bank details</Label>
            <Textarea
              id="s-bank"
              rows={3}
              placeholder={"Bank: HDFC Bank, Chandni Chowk\nA/c: 50200012345678  ·  IFSC: HDFC0000123"}
              {...register("bankDetails")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-terms">Terms</Label>
            <Textarea
              id="s-terms"
              rows={3}
              placeholder={"Payment due within 30 days.\nGoods once sold will not be taken back."}
              {...register("invoiceTerms")}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
