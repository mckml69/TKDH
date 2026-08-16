import React, { useState, useEffect, useCallback } from "react";
import { todayStr } from "../lib/helpers";

export function useBranding() {
  const [branding, setBranding] = useState({ companyName: "", address: "", registrationNumber: "", footerText: "", logoDataUrl: "", updatedAt: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("ledger-branding", true);
        if (!cancelled && res) setBranding(JSON.parse(res.value));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  const saveBranding = useCallback((next) => {
    const stamped = { ...next, updatedAt: todayStr() };
    setBranding(stamped);
    window.storage.set("ledger-branding", JSON.stringify(stamped), true).catch(() => {});
  }, []);
  return { branding, saveBranding };
}
