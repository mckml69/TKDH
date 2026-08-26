import { useState, useEffect } from "react";
import { storageMode } from "../lib/storage";
import { API_BASE } from "../lib/storage/apiAdapter";

const EMPTY = { available: false, issues: [], assets: [], rooms: [], contractors: [], staff: [], wholeBuildingContractors: [], wholeBuildingCertificates: [] };

/** Pulls this venue's own read-only view of the other venue's data — open Maintenance/Pest
    issues (plus whatever asset/room/contractor context is needed to render them) and any
    contractors/certificates the other venue has scoped "whole_building". Silently unavailable
    (never throws, never blocks the rest of the app loading) whenever there's no backend at all
    (local dev mode), the other venue isn't configured yet, or it's unreachable — see
    server/index.js's /api/venue-pull for the actual cross-service call. */
export function useVenuePull() {
  const [pull, setPull] = useState(EMPTY);
  useEffect(() => {
    if (storageMode !== "api") return; // local dev mode has no backend to ask
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/venue-pull`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPull({ ...EMPTY, ...data });
      } catch { /* stays unavailable — the dashboard just shows nothing extra */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return pull;
}
