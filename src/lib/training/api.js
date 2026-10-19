import { API_BASE, apiAdapter } from "../storage/apiAdapter";
import { storageMode } from "../storage";

/**
 * Client for the staff-training endpoints in server/training.js. Training only exists against the
 * real backend (api mode), and only on a deployment whose server has a training pack configured.
 * Errors carry the server's own message (e.g. "this module has not been assigned to you") so the
 * page can show it as-is.
 */
export const trainingSupported = storageMode === "api";

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}/training${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401) apiAdapter.onUnauthorized?.();
    const err = new Error(data?.error || `request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const trainingApi = {
  status: () => request("GET", "/status"),
  pack: () => request("GET", "/pack"),
  me: () => request("GET", "/me"),
  attempt: (body) => request("POST", "/attempts", body),
  acknowledge: (moduleId, moduleVersion) => request("POST", "/acknowledge", { moduleId, moduleVersion }),
  certificates: () => request("GET", "/certificates"),
  certificate: (no) => request("GET", `/certificates/${encodeURIComponent(no)}`),
  // General Manager only
  people: () => request("GET", "/people"),
  records: () => request("GET", "/records"),
  setLink: (staffId, userId) => request("PUT", "/links", { staffId, userId }),
  setAssignments: (staffIds, moduleIds, assigned) => request("PUT", "/assignments", { staffIds, moduleIds, assigned }),
  packInfo: () => request("GET", "/pack-info"),
  installPack: (files) => request("PUT", "/pack-files", { files }),
  imageUrl: (file) => `${API_BASE}/training/images/${encodeURIComponent(file)}`,
  planUrl: (file) => `${API_BASE}/training/plans/${encodeURIComponent(file)}`,
};
