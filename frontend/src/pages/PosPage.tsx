import { useState, useRef, useMemo, useCallback } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useCustomers } from "@/hooks/useCustomers";
import { useCheckout, useDebouncedValue } from "@/hooks/usePos";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useCartStore } from "@/stores/cartStore";
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
  Plus,
  Minus,
  X,
  ShoppingCart,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  Keyboard,
  Check,
  User,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "UPI", label: "UPI", icon: Smartphone },
  { value: "OTHER", label: "Other", icon: CreditCard },
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { value: searchValue, debouncedValue: searchQuery, onChange: setSearchValue } = useDebouncedValue(250);

  // Stores
  const {
    items: cartItems,
    selectedCustomer,
    customerName,
    paymentMethod,
    notes,
    addItem,
    removeItem,
    updateQuantity,
    setCustomer,
    setPaymentMethod,
    setNotes,
    clearCart,
    getSubtotal,
    getTaxTotal,
    getDiscountTotal,
    getGrandTotal,
  } = useCartStore();

  // Queries
  const { data: productsData, isLoading: productsLoading } = useProducts({
    limit: 100,
    search: searchQuery || undefined,
    category: selectedCategory === "All" ? undefined : selectedCategory,
  });
  const { data: customersData } = useCustomers({ limit: 100 });
  const checkoutMutation = useCheckout();

  const products = productsData?.products || productsData?.docs || [];
  const customers = customersData?.customers || customersData?.docs || [];

  // Keyboard shortcuts
  

  const handleAddToCart = useCallback(
    (product: {
      _id: string;
      name: string;
      sku: string;
      sellingPrice: number;
      costPrice: number;
      stock: number;
      images?: Array<{ url: string }>;
    }) => {
      if (product.stock <= 0) {
        toast.error("Out of stock");
        return;
      }
      addItem({
        product: product._id,
        name: product.name,
        sku: product.sku,
        unitPrice: product.sellingPrice,
        costPrice: product.costPrice,
        stock: product.stock,
        image: product.images?.[0]?.url,
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
        discountPercent: item.discountPercent || undefined,
        taxPercent: item.taxPercent || undefined,
      })),
      customerId: selectedCustomer || undefined,
      paymentMethod,
      notes: notes || undefined,
    };

    checkoutMutation.mutate(payload, {
      onSuccess: (sale) => {
        setCheckoutOpen(false);
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
  const discountTotal = getDiscountTotal();
  const PaymentIcon = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.icon || Banknote;

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
                  ? "bg-indigo-500 hover:bg-indigo-600 text-white"
                  : ""
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1">
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
                  category: string;
                  images?: Array<{ url: string }>;
                }) => {
                  const inCart = cartItems.find(
                    (i) => i.product === product._id
                  );
                  return (
                    <button
                      key={product._id}
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock <= 0}
                      className={`group relative rounded-xl border p-3 text-left transition-all duration-200 ${
                        product.stock <= 0
                          ? "border-border/30 opacity-50 cursor-not-allowed"
                          : inCart
                          ? "border-indigo-500/50 bg-indigo-500/5 shadow-sm shadow-indigo-500/10"
                          : "border-border/50 bg-card/30 hover:border-indigo-500/30 hover:bg-card/50 hover:shadow-sm"
                      }`}
                    >
                      {inCart && (
                        <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-indigo-500 text-white text-[10px] rounded-full shadow-md">
                          {inCart.quantity}
                        </Badge>
                      )}
                      <p className="text-sm font-medium truncate mb-1">
                        {product.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono mb-2">
                        {product.sku}
                      </p>
                      <div className="flex items-end justify-between">
                        <p className="text-lg font-bold text-foreground">
                          ₹{product.sellingPrice.toLocaleString("en-IN")}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            product.stock <= 0
                              ? "text-red-400 border-red-500/20"
                              : product.stock <= 10
                              ? "text-amber-400 border-amber-500/20"
                              : "text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {product.stock} left
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
      <Card className="lg:w-[380px] shrink-0 border-border/50 bg-card/50 backdrop-blur-sm flex flex-col">
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-indigo-400" />
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
                        <Check className="ml-auto h-4 w-4 text-indigo-400" />
                      )}
                    </CommandItem>
                    {customers.map(
                      (c: { _id: string; name: string; phone?: string }) => (
                        <CommandItem
                          key={c._id}
                          onSelect={() => {
                            setCustomer(c._id, c.name);
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
                            <Check className="ml-auto h-4 w-4 text-indigo-400" />
                          )}
                        </CommandItem>
                      )
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardHeader>

        {/* Cart items */}
        <ScrollArea className="flex-1 px-4">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Click products to add them</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {cartItems.map((item) => (
                <div
                  key={item.product}
                  className="group rounded-lg border border-border/40 bg-muted/10 p-3 transition-colors hover:border-border/60"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        ₹{item.unitPrice.toLocaleString("en-IN")} × {item.quantity}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={() => removeItem(item.product)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          updateQuantity(item.product, item.quantity - 1)
                        }
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantity(
                            item.product,
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="h-7 w-12 text-center text-sm px-1"
                        min={1}
                        max={item.stock}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          updateQuantity(item.product, item.quantity + 1)
                        }
                        disabled={item.quantity >= item.stock}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-sm font-semibold">
                      ₹
                      {(
                        item.unitPrice *
                        item.quantity *
                        (1 - item.discountPercent / 100) *
                        (1 + item.taxPercent / 100)
                      )
                        .toFixed(2)
                        .replace(/\.00$/, "")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Totals + Checkout */}
        {cartItems.length > 0 && (
          <div className="border-t border-border/50 p-4 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span>-₹{discountTotal.toFixed(2)}</span>
                </div>
              )}
              {taxTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>+₹{taxTotal.toFixed(2)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-indigo-400">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment method */}
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as "CASH" | "CARD" | "UPI" | "OTHER")
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
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/25 h-12 text-base font-semibold"
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Checkout — ₹{grandTotal.toFixed(2)}
              <Badge
                variant="outline"
                className="ml-2 text-[10px] border-white/20 text-white/70"
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
                <div key={item.product} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="font-medium">
                    ₹
                    {(
                      item.unitPrice *
                      item.quantity *
                      (1 - item.discountPercent / 100) *
                      (1 + item.taxPercent / 100)
                    ).toFixed(2)}
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
                <span>{paymentMethod}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2">
                <span>Grand Total</span>
                <span className="text-indigo-400">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

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
              disabled={checkoutMutation.isPending}
              className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm — ₹{grandTotal.toFixed(2)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
