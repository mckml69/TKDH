import { useCallback, useEffect, useState } from "react";
import { trainingApi } from "../lib/training/api";
import { TRAINING_MODULE_PRESET } from "../lib/constants";

/** The whole team's training results (General Manager only), for merging into the Ledger's own views.
    `active` is false for anyone who isn't a General Manager, or when training isn't set up, in which case
    nothing is fetched. A failed fetch leaves the Ledger exactly as it was without training. */
export function useTrainingSummary(active) {
  const [rows, setRows] = useState([]);
  const [assigned, setAssigned] = useState(() => new Map()); // staff id -> the training types assigned to them
  const reload = useCallback(async () => {
    if (!active) { setRows([]); setAssigned(new Map()); return; }
    try { setRows((await trainingApi.records()).records || []); } catch { setRows([]); }
    try {
      const people = await trainingApi.people();
      setAssigned(new Map(people.staff.filter((s) => !s.archived && s.moduleIds.length).map((s) => [s.id, s.moduleIds.map((id) => TRAINING_MODULE_PRESET[id]).filter(Boolean)])));
    } catch { setAssigned(new Map()); }
  }, [active]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, assigned, reload };
}
