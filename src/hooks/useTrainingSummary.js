import { useCallback, useEffect, useState } from "react";
import { trainingApi } from "../lib/training/api";

/** The whole team's training results (General Manager only), for merging into the Ledger's own views.
    `active` is false for anyone who isn't a General Manager, or when training isn't set up, in which case
    nothing is fetched. A failed fetch leaves the Ledger exactly as it was without training. */
export function useTrainingSummary(active) {
  const [rows, setRows] = useState([]);
  const reload = useCallback(async () => {
    if (!active) { setRows([]); return; }
    try { setRows((await trainingApi.records()).records || []); } catch { setRows([]); }
  }, [active]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, reload };
}
