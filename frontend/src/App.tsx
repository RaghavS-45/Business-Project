import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/authStore";

// Layout (eagerly loaded — used on every page)
import AppLayout from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import InstallPrompt from "@/components/pwa/InstallPrompt";

// Pages (lazy loaded — code-split per route)
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProductsPage = lazy(() => import("@/pages/ProductsPage"));
const PosPage = lazy(() => import("@/pages/PosPage"));
const SalesPage = lazy(() => import("@/pages/SalesPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const VendorsPage = lazy(() => import("@/pages/VendorsPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));

/** Route loading fallback */
function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-indigo-500" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

/**
 * CashierRedirect: Cashiers go straight to POS, admins/managers see dashboard.
 */
function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === "CASHIER") {
    return <Navigate to="/pos" replace />;
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <DashboardPage />
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  {/* Dashboard — admin/manager see dashboard, cashier redirects to POS */}
                  <Route path="/" element={<HomeRedirect />} />

                  {/* Inventory — admin/manager only */}
                  <Route element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} />}>
                    <Route path="/products" element={<ProductsPage />} />
                  </Route>

                  {/* POS — all roles */}
                  <Route path="/pos" element={<PosPage />} />

                  {/* Sales — admin/manager only */}
                  <Route element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} />}>
                    <Route path="/sales" element={<SalesPage />} />
                  </Route>

                  {/* Customers — all roles (cashier can create walk-ins) */}
                  <Route path="/customers" element={<CustomersPage />} />

                  {/* Vendors — admin/manager only */}
                  <Route element={<ProtectedRoute roles={["ADMIN", "MANAGER"]} />}>
                    <Route path="/vendors" element={<VendorsPage />} />
                  </Route>

                  <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                    <Route path="/users" element={<UsersPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          {/* PWA Install Prompt */}
          <InstallPrompt />
        </BrowserRouter>

        {/* Toast notifications */}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            className: "border-border/50",
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
