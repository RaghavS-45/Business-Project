import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/axios";
import { useAuthStore } from "@/stores/authStore";

/**
 * Auth hooks — TanStack Query mutations for login/logout + query for /me.
 */

// ─── Login ────────────────────────────────────────────────
export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await api.post("/auth/login", credentials);
      return data.data;
    },
    onSuccess: (data) => {
      login(data.user, data.accessToken, data.refreshToken);
      const role = data.user.role;
      navigate(role === "CASHIER" ? "/pos" : "/");
    },
  });
}

// ─── Logout ───────────────────────────────────────────────
export function useLogout() {
  const { refreshToken, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken }).catch(() => {});
      }
    },
    onSettled: () => {
      logout();
      queryClient.clear();
      navigate("/login");
    },
  });
}

// ─── Current User ─────────────────────────────────────────
export function useMe() {
  const { isAuthenticated, setUser } = useAuthStore();

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const { data } = await api.get("/auth/me");
      setUser(data.data.user);
      return data.data.user;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
