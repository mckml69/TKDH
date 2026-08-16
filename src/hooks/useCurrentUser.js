import React, { useState, useEffect, useCallback } from "react";
import { storageMode } from "../lib/storage";
import { API_BASE } from "../lib/storage/apiAdapter";

async function authRequest(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed: ${res.status}`);
  return data;
}

/** local mode: today's device-local "pick your name" — current-user-id lives in personal
    (unshared) storage, never touches a server, since there is no server to protect.
    api mode: real sign-in against the reference server's session cookie (see server/auth.js). */
export function useCurrentUser(users) {
  const [currentUserId, setCurrentUserIdState] = useState(null);
  const [sessionUser, setSessionUser] = useState(null); // api mode only: the {id,name,email,role} the server actually confirmed
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (storageMode === "api") {
        try {
          const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
          if (res.ok) {
            const { user } = await res.json();
            if (!cancelled) setSessionUser(user);
          }
        } catch {}
      } else {
        try {
          const res = await window.storage.get("current-user-id", false);
          if (!cancelled && res) setCurrentUserIdState(JSON.parse(res.value));
        } catch {}
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setCurrentUserId = useCallback((id) => {
    setCurrentUserIdState(id);
    window.storage.set("current-user-id", JSON.stringify(id), false).catch(() => {});
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await authRequest("/auth/login", { email, password });
    setSessionUser(user);
    return user;
  }, []);

  const bootstrap = useCallback(async (form) => {
    const { user } = await authRequest("/auth/bootstrap", form);
    setSessionUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }); } catch {}
    setSessionUser(null);
  }, []);

  const changePassword = useCallback((userId, newPassword, currentPassword) => (
    authRequest("/auth/set-password", { userId, newPassword, currentPassword })
  ), []);

  const currentUser = storageMode === "api"
    ? (sessionUser ? users.find((u) => u.id === sessionUser.id && !u.archived) || sessionUser : null)
    : users.find((u) => u.id === currentUserId && !u.archived) || null;

  return { currentUser, setCurrentUserId, login, bootstrap, logout, changePassword, loaded };
}
