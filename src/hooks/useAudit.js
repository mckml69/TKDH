import React, { useState, useEffect, useCallback } from "react";

export function useAudit() {
  const [audit, setAudit] = useState({ responses: {}, startedAt: null, completedAt: null });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("ledger-audit", true);
        if (!cancelled && res) setAudit(JSON.parse(res.value));
      } catch {}
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  const saveAudit = useCallback((next) => {
    setAudit(next);
    window.storage.set("ledger-audit", JSON.stringify(next), true).catch(() => {});
  }, []);
  return { audit, loaded, saveAudit };
}
