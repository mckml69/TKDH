import React, { useState, useEffect, useCallback } from "react";
import { todayStr } from "../lib/helpers";

export function useResponsiblePerson() {
  const [person, setPerson] = useState({ name: "", role: "", phone: "", email: "", updatedAt: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("ledger-responsible-person", true);
        if (!cancelled && res) setPerson(JSON.parse(res.value));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  const savePerson = useCallback((next) => {
    const stamped = { ...next, updatedAt: todayStr() };
    setPerson(stamped);
    window.storage.set("ledger-responsible-person", JSON.stringify(stamped), true).catch(() => {});
  }, []);
  return { person, savePerson };
}
