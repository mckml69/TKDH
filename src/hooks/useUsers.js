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
  const persistUsers = useCallback((next) => {
    setUsers(next);
    window.storage.set("ledger-users", JSON.stringify(next), true).catch(() => {});
  }, []);
  const upsertUser = useCallback((user, currentUsers) => {
    const base = currentUsers || users;
    const next = computeUpsert(base, user, USER_HISTORY_FIELDS);
    persistUsers(next);
    return next;
  }, [users, persistUsers]);
  const archiveUser = useCallback((id) => persistUsers(computeArchive(users, id)), [users, persistUsers]);
  const restoreUser = useCallback((id) => persistUsers(computeRestore(users, id)), [users, persistUsers]);
  return { users, loaded, upsertUser, archiveUser, restoreUser, reload };
}
