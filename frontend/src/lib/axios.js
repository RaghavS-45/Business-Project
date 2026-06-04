import axios from "axios";

/**
 * Centralized Axios instance with JWT interceptors.
 *
 * - Request interceptor: injects `Authorization: Bearer <token>` from localStorage
 * - Response interceptor: on 401 → attempts silent token refresh → retries original request
 * - If refresh also fails → forces logout & redirect to /login
 *
 * Queue mechanism: if a refresh is already in-flight, subsequent 401 requests
 * queue up and resolve once the new token arrives.
 */

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// ─── Refresh token state ──────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

// ─── Helpers to read/write auth from localStorage ─────────
// We read from localStorage directly instead of importing the store
// to avoid circular dependency issues (store imports axios).
const getStoredAuth = () => {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state ?? null;
  } catch {
    return null;
  }
};

const clearStoredAuth = () => {
  localStorage.removeItem("auth-storage");
};

// ─── Request Interceptor ──────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const auth = getStoredAuth();
    if (auth?.accessToken) {
      config.headers.Authorization = `Bearer ${auth.accessToken}`;
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

    // Only attempt refresh on 401 and not already retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If we're already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const auth = getStoredAuth();
    if (!auth?.refreshToken) {
      isRefreshing = false;
      clearStoredAuth();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post("/api/auth/refresh", {
        refreshToken: auth.refreshToken,
      });

      const { accessToken, refreshToken: newRefreshToken, user } = data.data;

      // Update localStorage directly
      const stored = JSON.parse(localStorage.getItem("auth-storage") || "{}");
      stored.state = {
        ...stored.state,
        accessToken,
        refreshToken: newRefreshToken,
        user,
      };
      localStorage.setItem("auth-storage", JSON.stringify(stored));

      // Retry queued requests with new token
      processQueue(null, accessToken);

      // Retry the original request
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearStoredAuth();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
