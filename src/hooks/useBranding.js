import React, { useState, useEffect, useCallback } from "react";
import { todayStr } from "../lib/helpers";

export function useBranding() {
  const [branding, setBranding] = useState({ companyName: "", address: "", registrationNumber: "", footerText: "", logoDataUrl: "", updatedAt: null });
  // The first load happens before anyone has signed in, when the server answers 401 and the branding
  // stays blank. `reload` is called again right after a successful sign-in so the letterhead on every
  // report (and training certificate) is right without needing a page refresh.
  const reload = useCallback(async () => {
    try {
      const res = await window.storage.get("ledger-branding", true);
      if (res) setBranding(JSON.parse(res.value));
    } catch {}
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const saveBranding = useCallback((next) => {
    const stamped = { ...next, updatedAt: todayStr() };
    setBranding(stamped);
    window.storage.set("ledger-branding", JSON.stringify(stamped), true).catch(() => {});
  }, []);
  return { branding, saveBranding, reload };
}
