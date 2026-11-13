import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import BrandMark from "@/components/brand/BrandMark";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { isAuthenticated, user } = useAuthStore();
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Redirect if already logged in
  if (isAuthenticated && user) {
    return <Navigate to={user.role === "CASHIER" ? "/pos" : "/"} replace />;
  }

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — a ledger page */}
      <aside className="relative hidden overflow-hidden bg-sidebar-fill text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* ruled lines + margin rule, like an account book */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 35px, currentColor 35px 36px)",
          }}
        />
        <div aria-hidden="true" className="absolute inset-y-0 left-24 w-px bg-brand/40" />
        <div aria-hidden="true" className="absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <span className="font-heading text-lg font-bold text-sidebar-accent-foreground">Inventory POS</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-heading text-4xl font-bold leading-[1.1] text-sidebar-accent-foreground">
            Every sale, every rupee,
            <br />
            <span className="text-brand">in one ledger.</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-sidebar-foreground/80">
            {["GST invoices with CGST, SGST & IGST", "Credit, dues and customer statements", "Stock in pieces, cartons or kilos"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">Billing &amp; inventory for wholesale</p>
      </aside>

      {/* Sign-in form */}
      <main className="flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none ring-0">
        <CardHeader className="space-y-4 pb-2 px-0">
          <BrandMark className="h-11 w-11 lg:hidden" />
          <div>
            <CardTitle className="font-heading text-3xl font-bold">Welcome back</CardTitle>
            <CardDescription className="mt-1.5 text-muted-foreground">
              Sign in to continue to your store
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-4 px-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                autoFocus
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                  className={errors.password ? "border-destructive pr-10" : "pr-10"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {loginMutation.isError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {(loginMutation.error as { response?: { data?: { message?: string } } })
                  ?.response?.data?.message || "Invalid credentials. Please try again."}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-brand-fill text-brand-foreground font-semibold shadow-md hover:brightness-105"
              disabled={loginMutation.isPending}
              size="lg"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted-foreground">
            Use your admin credentials or ask your manager for access.
          </p>
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
