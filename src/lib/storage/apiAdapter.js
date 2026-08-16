/**
 * Real-backend storage adapter — talks to the reference Express + SQLite/Postgres API
 * in /server. This is the one to use for an actual multi-user deployment: "shared" data
 * goes through the API (and therefore the database, visible to the whole team); personal,
 * per-browser data (which user is signed in on this device, UI prefs) stays in
 * localStorage, since there's no reason to round-trip that to a server.
 *
 * The API contract is intentionally identical in shape to window.storage, so nothing in
 * the hooks or components needs to know which adapter is active.
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const PERSONAL_PREFIX = "compliance-ledger:personal:";

async function apiRequest(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 401) apiAdapter.onUnauthorized?.();
    if (res.status === 404) throw new Error("not found");
    throw new Error(`storage request failed: ${res.status}`);
  }
  return res.json();
}

export const apiAdapter = {
  /** Set by App.jsx in api mode: called whenever a storage request comes back 401 (session
      expired or never existed), so the app can bounce back to sign-in instead of storage
      calls silently failing mid-form. */
  onUnauthorized: null,
  async get(key, shared) {
    if (!shared) {
      const raw = localStorage.getItem(PERSONAL_PREFIX + key);
      if (raw === null) throw new Error(`not found: ${key}`);
      return { key, value: raw, shared };
    }
    return apiRequest("GET", `/storage/${encodeURIComponent(key)}`);
  },
  async set(key, value, shared) {
    if (!shared) {
      localStorage.setItem(PERSONAL_PREFIX + key, value);
      return { key, value, shared };
    }
    return apiRequest("PUT", `/storage/${encodeURIComponent(key)}`, { value });
  },
  async delete(key, shared) {
    if (!shared) {
      localStorage.removeItem(PERSONAL_PREFIX + key);
      return { key, deleted: true, shared };
    }
    return apiRequest("DELETE", `/storage/${encodeURIComponent(key)}`);
  },
  async list(prefix, shared) {
    if (!shared) {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PERSONAL_PREFIX + (prefix || ""))) keys.push(k.slice(PERSONAL_PREFIX.length));
      }
      return { keys, prefix, shared };
    }
    return apiRequest("GET", `/storage?prefix=${encodeURIComponent(prefix || "")}`);
  },
};
