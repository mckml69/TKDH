import { useCallback, useEffect, useState } from "react";
import { trainingApi } from "../lib/training/api";

/** The signed-in person's own unfinished training: modules assigned to them that they haven't started, haven't passed, or
    that have expired. Empty for anyone with nothing assigned (including a General Manager who hasn't assigned themselves
    anything). `active` is false when training isn't set up or nobody is signed in, in which case nothing is fetched. A
    failed fetch just means no reminder: it never blocks anything. */
export function useTrainingReminders(active) {
  const [outstanding, setOutstanding] = useState([]);
  const reload = useCallback(async () => {
    if (!active) { setOutstanding([]); return; }
    try { setOutstanding((await trainingApi.reminders()).outstanding || []); } catch { setOutstanding([]); }
  }, [active]);
  useEffect(() => { reload(); }, [reload]);
  return { outstanding, reload };
}
