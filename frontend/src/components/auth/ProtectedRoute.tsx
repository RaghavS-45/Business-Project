import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

interface ProtectedRouteProps {
  roles?: Array<"ADMIN" | "MANAGER" | "CASHIER">;
}

/**
 * Route guard — redirects to /login if unauthenticated.
 * Optionally checks role membership.
 */
export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-6xl">🔒</div>
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to view this page.
          </p>
          <p className="text-sm text-muted-foreground">
            Required role: {roles.join(" or ")} — Your role: {user.role}
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
