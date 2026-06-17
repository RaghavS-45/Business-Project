import axios from "axios";

/**
 * Axios instance with JWT interceptors.
 *
 * - Request interceptor: attaches Authorization header from localStorage
 * - Response interceptor: on 401, attempts silent token refresh via /api/auth/refresh
 *   and retries the original request. Queues concurrent 401s to avoid duplicate refreshes.
 */

/**
 * Base URL strategy:
 *  - Dev: "/api" → Vite proxy forwards to localhost:5001
 *  - Prod: VITE_API_URL env var (e.g. "https://your-app.onrender.com/api")
 */
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ─── State for token refresh queueing ─────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// ─── Request Interceptor ──────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem("auth-storage");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.accessToken;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // ignore parse errors
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ─────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401s, and only retry once
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't retry on login/refresh endpoints
    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request until refresh completes
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const stored = localStorage.getItem("auth-storage");
      if (!stored) throw new Error("No auth storage");

      const parsed = JSON.parse(stored);
      const refreshToken = parsed?.state?.refreshToken;
      if (!refreshToken) throw new Error("No refresh token");

      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
      const newAccessToken = data.data.accessToken;
      const newRefreshToken = data.data.refreshToken;

      // Update zustand persisted store
      parsed.state.accessToken = newAccessToken;
      parsed.state.refreshToken = newRefreshToken;
      parsed.state.user = data.data.user;
      localStorage.setItem("auth-storage", JSON.stringify(parsed));

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      // Clear auth and redirect to login
      localStorage.removeItem("auth-storage");
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
