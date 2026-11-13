import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useCustomers } from "@/hooks/useCustomers";
import { useCheckout, useDebouncedValue } from "@/hooks/usePos";
import { useStoreSettings } from "@/hooks/useSettings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useCartStore, type PaymentMethod } from "@/stores/cartStore";
import CartLine from "@/components/pos/CartLine";
import { LEVEL_LABELS, type PriceLevel, type PricedProduct } from "@/lib/unitPricing";

type PosProduct = {
  _id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  unit?: string;
  taxRate?: number;
  images?: Array<{ url: string }>;
  packs?: PricedProduct["packs"];
  levelPrices?: PricedProduct["levelPrices"];
  priceSlabs?: PricedProduct["priceSlabs"];
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  Keyboard,
  Check,
  User,
  Trash2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { getTier } from "@/lib/loyalty";
import { formatINR, formatPrice } from "@/lib/pricing";

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: Smartphone },
  { value: "OTHER", label: "Other", icon: CreditCard },
  { value: "CREDIT", label: "Credit (pay later)", icon: Clock },
] as const;

const CATEGORY_TABS = [
  "All",
  "Electronics",
  "Clothing",
  "Food & Beverage",
  "Household",
  "Stationery",
  "Health & Beauty",
  "Other",
];

export default function PosPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  // Amount received now ("" = the full bill); the rest goes on the customer's credit
  const [paidNow, setPaidNow] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { value: searchValue, debouncedValue: searchQuery, onChange: setSearchValue } = useDebouncedValue(250);

  // Stores
  const {
    items: cartItems,
    selectedCustomer,
    customerName,
    customerLoyaltyPoints,
    paymentMethod,
    notes,
    addItem,
    setCustomer,
    setPaymentMethod,
    setNotes,
    clearCart,
    getSubtotal,
    getTaxTotal,
    getDiscountTotal,
    getLoyaltyPercent,            // NEW
    getLoyaltyDiscountTotal,      // NEW
    getPointsToEarn,
    getGrandTotal,
    getLineTotal,
    getTaxableTotal,
    priceLevel,
    taxInclusive,
    setTaxInclusive,
  } = useCartStore();

  // Pricing mode (GST added on top vs. included in price) comes from store settings
  const { data: storeSettings } = useStoreSettings();
  useEffect(() => {
    if (storeSettings) setTaxInclusive(Boolean(storeSettings.pricesIncludeTax));
  }, [storeSettings, setTaxInclusive]);

  // Queries
  const { data: productsData, isLoading: productsLoading } = useProducts({
    limit: 100,
    search: searchQuery || undefined,
    category: selectedCategory === "All" ? undefined : selectedCategory,
  });
  const { data: customersData } = useCustomers({ limit: 100 });
  const checkoutMutation = useCheckout();

  const products = productsData?.products || productsData?.docs || [];
  const customers = customersData?.customers ?? [];

  // Keyboard shortcuts
  

  const handleAddToCart = useCallback(
    (product: PosProduct) => {
      if (product.stock <= 0) {
        toast.error("Out of stock");
        return;
      }
      addItem({
        product: product._id,
        name: product.name,
        sku: product.sku,
        costPrice: product.costPrice,
        stock: product.stock,
        taxPercent: product.taxRate ?? 0,
        image: product.images?.[0]?.url,
        pricing: {
          unit: product.unit ?? "pcs",
          sellingPrice: product.sellingPrice,
          packs: product.packs ?? [],
          levelPrices: product.levelPrices,
          priceSlabs: product.priceSlabs ?? [],
        },
      });
      toast.success(`Added ${product.name}`, { duration: 1500 });
    },
    [addItem]
  );

  const handleCheckout = () => {
    const payload = {
      items: cartItems.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        unit: item.unit,
        discountPercent: item.discountPercent || undefined,
        taxPercent: item.taxPercent || undefined,
      })),
      customerId: selectedCustomer || undefined,
      paymentMethod,
      // Only sent for a part payment; otherwise the server takes the full bill (or 0 for CREDIT)
      amountPaid: !isCredit && paidNowNum !== null ? paidNowNum : undefined,
      notes: notes || undefined,
    };

    checkoutMutation.mutate(payload, {
      onSuccess: (sale) => {
        setCheckoutOpen(false);
        setPaidNow("");
        toast.success(
          `Sale completed! Invoice: ${sale.invoiceNumber}`,
          { duration: 5000 }
        );
      },
      onError: (err) => {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || "Checkout failed";
        toast.error(message);
      },
    });
  };

  const grandTotal = getGrandTotal();
  const subtotal = getSubtotal();
  const taxTotal = getTaxTotal();
  const taxableTotal = getTaxableTotal();
  const discountTotal = getDiscountTotal();
  const loyaltyPercent = getLoyaltyPercent();
  const loyaltyTotal = getLoyaltyDiscountTotal();
  const pointsToEarn = getPointsToEarn();
  const tierName = getTier(customerLoyaltyPoints).name;
  const PaymentIcon = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.icon || Banknote;

  // ── Credit ───────────────────────────────────────────────
  type PosCustomer = {
    _id: string;
    name: string;
    outstanding?: number;
    creditLimit?: number | null;
    paymentTermsDays?: number;
  };
  const customerInfo = customers.find((c: PosCustomer) => c._id === selectedCustomer) as PosCustomer | undefined;
  const isCredit = paymentMethod === "CREDIT";
  const paidNowNum = paidNow.trim() === "" ? null : Number(paidNow);
  const amountPaid = isCredit ? 0 : paidNowNum === null ? grandTotal : paidNowNum;
  const onCredit = Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);
  const owesNow = customerInfo?.outstanding ?? 0;
  const limit = customerInfo?.creditLimit ?? null;
  const creditProblem =
    paidNowNum !== null && (Number.isNaN(paidNowNum) || paidNowNum < 0 || paidNowNum > grandTotal)
      ? `Amount received must be between ₹0 and ${formatINR(grandTotal)}`
      : onCredit > 0 && !selectedCustomer
        ? "Choose a customer to sell on credit — walk-in sales must be paid in full."
        : onCredit > 0 && limit !== null && owesNow + onCredit > limit
          ? `Over credit limit: owes ${formatINR(owesNow)}, limit ${formatINR(limit)}.`
          : null;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      {/* ─── LEFT: Product Grid ───────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search products"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-9 pr-16"
            />
            
          </div>
         
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {CATEGORY_TABS.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              className={`shrink-0 text-xs ${
                selectedCategory === cat
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                  : ""
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1 min-h-0">
          {productsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[140px] rounded-xl bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No products found
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {products.map(
                (product: {
                  _id: string;
                  name: string;
                  sku: string;
                  sellingPrice: number;
                  costPrice: number;
                  stock: number;
                  lowStockThreshold?: number;
                  category: string;
                  unit?: string;
                  images?: Array<{ url: string }>;
                }) => {
                  const lowAt = product.lowStockThreshold ?? 10;
                  const inCart = cartItems.find(
                    (i) => i.product === product._id
                  );
                  return (
                    <button
                      key={product._id}
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock <= 0}
                      className={`group relative flex flex-col rounded-xl border p-3 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        product.stock <= 0
                          ? "border-border/30 bg-card opacity-50 cursor-not-allowed"
                          : inCart
                          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 active:scale-[0.98]"
                          : "border-border/50 bg-card hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
                      }`}
                    >
                      {inCart && (
                        <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 flex items-center justify-center bg-primary text-primary-foreground text-[10px] rounded-full shadow-md tabular-nums">
                          {inCart.quantity}
                        </Badge>
                      )}
                      <div className="flex items-start gap-2.5 mb-3">
                        {product.images?.[0]?.url ? (
                          <img
                            src={product.images[0].url}
                            alt=""
                            loading="lazy"
                            className="h-9 w-9 shrink-0 rounded-md object-cover bg-muted"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                            {product.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight line-clamp-2" title={product.name}>
                            {product.name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground font-mono truncate">
                            {product.sku}
                          </p>
                        </div>
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-2">
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          {formatPrice(product.sellingPrice)}
                          {product.unit && product.unit !== "pcs" && (
                            <span className="text-xs font-normal text-muted-foreground">/{product.unit}</span>
                          )}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            product.stock <= 0
                              ? "text-red-600 dark:text-red-400 border-red-500/20"
                              : product.stock <= lowAt
                              ? "text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : "text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {product.stock <= 0 ? "Sold out" : `${product.stock} left`}
                        </Badge>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ─── RIGHT: Cart Panel ────────────────────────────── */}
        <Card className="lg:w-[380px] shrink-0 min-h-0 overflow-hidden border-border/50 bg-card flex flex-col">
  <CardHeader className="shrink-0 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Cart ({cartItems.length})
            </CardTitle>
            {cartItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Customer selector */}
          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs"
              >
                <User className="h-3.5 w-3.5 mr-2" />
                {customerName || "Walk-in Customer"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search customers" />
                <CommandList>
                  <CommandEmpty>No customers found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setCustomer(null, null);
                        setCustomerOpen(false);
                      }}
                    >
                      <span>Walk-in Customer</span>
                      {!selectedCustomer && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                    {customers.map(
                      (c: { _id: string; name: string; phone?: string; loyaltyPoints?: number; priceLevel?: PriceLevel }) => (
                        <CommandItem
                          key={c._id}
                          onSelect={() => {
            setCustomer(c._id, c.name, c.loyaltyPoints ?? 0, c.priceLevel ?? "RETAIL");
            setCustomerOpen(false);
          }}
                        >
                          <span>{c.name}</span>
                          {c.phone && (
                            <span className="ml-2 text-muted-foreground text-xs">
                              {c.phone}
                            </span>
                          )}
                          {selectedCustomer === c._id && (
                            <Check className="ml-auto h-4 w-4 text-primary" />
                          )}
                        </CommandItem>
                      )
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedCustomer && priceLevel !== "RETAIL" && (
            <p className="mt-1.5 px-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              {LEVEL_LABELS[priceLevel]} prices applied
            </p>
          )}
          {customerInfo && (owesNow > 0 || limit !== null) && (
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              Owes <span className={owesNow > 0 ? "font-medium text-amber-600 dark:text-amber-400" : ""}>{formatINR(owesNow)}</span>
              {limit !== null && <> · credit limit {formatINR(limit)}</>}
            </p>
          )}
        </CardHeader>

        {/* Cart items */}
        <ScrollArea className="flex-1 min-h-0 px-4">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Click products to add them</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {cartItems.map((item) => (
                <CartLine key={item.key} item={item} />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Totals + Checkout */}
        {cartItems.length > 0 && (
          <div className="shrink-0 border-t border-border/50 p-4 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatINR(discountTotal)}</span>
                </div>
              )}
              {selectedCustomer && loyaltyPercent > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Loyalty ({tierName} {loyaltyPercent}%)</span>
                  <span>-{formatINR(loyaltyTotal)}</span>
                </div>
              )}
              {taxInclusive ? (
                taxTotal > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Includes GST</span>
                    <span>{formatINR(taxTotal)}</span>
                  </div>
                )
              ) : (
                <>
                  {(discountTotal > 0 || loyaltyTotal > 0) && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxable value</span>
                      <span>{formatINR(taxableTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST</span>
                    <span>+{formatINR(taxTotal)}</span>
                  </div>
                </>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">
                  {formatINR(grandTotal)}
                </span>
              </div>
              {selectedCustomer && (
                <p className="text-xs text-muted-foreground text-right">
                  You'll earn {pointsToEarn} points
                </p>
              )}
            </div>

            {/* Payment method */}
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as PaymentMethod)
              }
            >
              <SelectTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <PaymentIcon className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-2">
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => setCheckoutOpen(true)}
              className="w-full bg-brand-fill text-brand-foreground hover:brightness-105 shadow-md h-12 text-base font-semibold"
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Checkout — {formatINR(grandTotal)}
              <Badge
                variant="outline"
                className="ml-2 text-[10px] border-brand-foreground/25 text-brand-foreground/70"
              >
                F9
              </Badge>
            </Button>
          </div>
        )}
      </Card>

      {/* ─── Checkout Confirmation Dialog ─────────────────── */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Checkout</DialogTitle>
            <DialogDescription>
              Review your order before processing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Order summary */}
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {cartItems.map((item) => (
                <div key={item.key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.name} × {item.quantity} {item.unit}
                  </span>
                  <span className="font-medium">
                    {formatINR(getLineTotal(item.key))}
                  </span>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{customerName || "Walk-in"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <span>{PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? paymentMethod}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2">
                <span>Grand Total</span>
                <span className="text-primary">
                  {formatINR(grandTotal)}
                </span>
              </div>
            </div>

            {/* Part payment: received now, rest on credit */}
            {selectedCustomer && !isCredit && (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="paid-now" className="text-sm text-muted-foreground">
                  Amount received
                </label>
                <Input
                  id="paid-now"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={grandTotal}
                  placeholder={grandTotal.toFixed(2)}
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                  className="h-8 w-36 text-right tabular-nums"
                />
              </div>
            )}
            {onCredit > 0 && !creditProblem && (
              <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                {formatINR(onCredit)} on credit
                {customerInfo?.paymentTermsDays !== undefined && <>, due in {customerInfo.paymentTermsDays} days</>}
                . {customerName} will owe {formatINR(owesNow + onCredit)}.
              </div>
            )}
            {creditProblem && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{creditProblem}</p>
            )}

            {/* Notes */}
            <div>
              <Textarea
                placeholder="Order notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || !!creditProblem}
              
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm — {formatINR(grandTotal)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
