import React, { useState, useEffect, useCallback } from "react";

/** A short PIN the GM can optionally set to gate revealing the Users & Permissions "Danger
    zone" (Reset for go-live) — stored in the same plain key-value store as everything else in
    this app, so it's a deterrent against casual/accidental access, not a real cryptographic
    security boundary. null means no PIN has been set — the section is still collapsed by
    default, just revealed with a plain click instead of a PIN prompt. */
export function useDangerZonePin() {
  const [pin, setPin] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("ledger-danger-zone-pin", true);
        if (!cancelled && res) setPin(JSON.parse(res.value));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  const savePin = useCallback((next) => {
    setPin(next);
    window.storage.set("ledger-danger-zone-pin", JSON.stringify(next), true).catch(() => {});
  }, []);
  return { pin, savePin };
}
