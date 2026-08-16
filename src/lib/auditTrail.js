import { fmtDate, todayStr, formatHistoryValue } from "./helpers";

export function diffFields(oldObj, newObj, labels) {
  const changes = [];
  for (const [key, label] of Object.entries(labels)) {
    const isComplex = (v) => Array.isArray(v) || (v && typeof v === "object");
    const a = isComplex(oldObj[key]) ? JSON.stringify(oldObj[key]) : oldObj[key];
    const b = isComplex(newObj[key]) ? JSON.stringify(newObj[key]) : newObj[key];
    const aEmpty = a === undefined || a === null || a === "";
    const bEmpty = b === undefined || b === null || b === "";
    if (a !== b && !(aEmpty && bEmpty)) {
      changes.push({ field: label, from: formatHistoryValue(oldObj[key]), to: formatHistoryValue(newObj[key]) });
    }
  }
  return changes;
}
/** Returns the next array with `item` created or updated, with an automatic history entry appended. */
export function computeUpsert(list, item, historyFields, by) {
  const existing = list.find((x) => x.id === item.id);
  const now = new Date().toISOString();
  const priorHistory = existing?.history || [];
  /* _historyNote: optional one-shot context for THIS change (e.g. "via maintenance resolution") —
     carried into the generated audit entry, never stored on the record itself. */
  const { _historyNote, ...cleanItem } = item;
  let entry = null;
  if (!existing) entry = { at: now, action: "created", by, ...(_historyNote ? { note: _historyNote } : {}) };
  else {
    const changes = diffFields(existing, cleanItem, historyFields);
    if (changes.length) entry = { at: now, action: "edited", by, changes, ...(_historyNote ? { note: _historyNote } : {}) };
  }
  const history = entry ? [...priorHistory, entry] : priorHistory;
  const stamped = { ...cleanItem, history, archived: existing?.archived || false, archivedAt: existing?.archivedAt || null, updatedAt: todayStr(), createdAt: existing?.createdAt || cleanItem.createdAt || todayStr() };
  return existing ? list.map((x) => (x.id === item.id ? stamped : x)) : [...list, stamped];
}
export function computeArchive(list, id, by) {
  const now = new Date().toISOString();
  return list.map((x) => (x.id === id ? { ...x, archived: true, archivedAt: now, history: [...(x.history || []), { at: now, action: "archived", by }] } : x));
}
export function computeRestore(list, id, by) {
  const now = new Date().toISOString();
  return list.map((x) => (x.id === id ? { ...x, archived: false, archivedAt: null, history: [...(x.history || []), { at: now, action: "restored", by }] } : x));
}
export function historyLine(entry) {
  const when = fmtDate(entry.at.slice(0, 10));
  const who = entry.by ? ` — ${entry.by}` : "";
  const label = { created: "Created", archived: "Archived", restored: "Restored", edited: "Edited", "correction-requested": "Correction requested", "correction-resolved": "Correction resolved", "correction-dismissed": "Correction request dismissed" }[entry.action] || entry.action;
  return `${label} — ${when}${who}`;
}
