import React, { useState, useEffect, useCallback } from "react";
import { computeArchive, computeRestore, computeUpsert } from "../lib/auditTrail";
import { USER_HISTORY_FIELDS } from "../lib/constants";

export function useUsers() {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try {
      const res = await window.storage.get("ledger-users", true);
      setUsers(res ? JSON.parse(res.value) : []);
    } catch { setUsers([]); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("ledger-users", true);
        if (!cancelled) setUsers(res ? JSON.parse(res.value) : []);
      } catch { if (!cancelled) setUsers([]); }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  // Returns the storage write's own promise (still swallowing its error, same as before) rather than
  // firing it and moving on — a caller that needs the server to have actually seen this user before
  // doing anything else (e.g. setting a brand-new user's password, which the server rejects with
  // "user not found" if it hasn't processed this write yet) needs something to await.
  const persistUsers = useCallback((next) => {
    setUsers(next);
    return window.storage.set("ledger-users", JSON.stringify(next), true).catch(() => {});
  }, []);
  const upsertUser = useCallback((user, currentUsers) => {
    const base = currentUsers || users;
    const next = computeUpsert(base, user, USER_HISTORY_FIELDS);
    return persistUsers(next);
  }, [users, persistUsers]);
  const archiveUser = useCallback((id) => persistUsers(computeArchive(users, id)), [users, persistUsers]);
  const restoreUser = useCallback((id) => persistUsers(computeRestore(users, id)), [users, persistUsers]);
  return { users, loaded, upsertUser, archiveUser, restoreUser, reload };
}
