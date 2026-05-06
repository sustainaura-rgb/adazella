import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

// ─────────────────────────────────────────────────────────────
// Request interceptor — attach Supabase JWT
// ─────────────────────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─────────────────────────────────────────────────────────────
// Response interceptor — try refresh BEFORE giving up on 401
//
// Old behavior: any 401 → immediate logout, user kicked to /login.
// Problem: token expires every hour, so users got logged out mid-session.
//
// New behavior: on 401, attempt session refresh. If refresh succeeds,
// retry the original request once. Only logout if refresh fails too.
// ─────────────────────────────────────────────────────────────

interface RetryableConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as RetryableConfig | undefined;

    // Only attempt refresh on 401, and only once (avoid loops)
    if (err.response?.status === 401 && original && !original._retried) {
      original._retried = true;

      try {
        // Try to refresh the Supabase session
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session?.access_token) {
          throw error || new Error("Refresh failed");
        }

        // Retry the original request with the new token
        original.headers = {
          ...(original.headers || {}),
          Authorization: `Bearer ${data.session.access_token}`,
        };
        return api.request(original);
      } catch (refreshErr) {
        // Refresh failed — actually log out
        console.warn("Session refresh failed, signing out:", refreshErr);
        await supabase.auth.signOut();
        window.location.href = "/login";
        return Promise.reject(err);
      }
    }

    return Promise.reject(err);
  }
);
