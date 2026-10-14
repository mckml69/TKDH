import { TRAINING_MODULE_PRESET } from "../constants";
import { isoDay } from "./status";

/**
 * Turns the Training module's results into ordinary-looking Staff Training records, so the Staff register,
 * the Compliance Library, the dashboard and the First Day Audit all see them without any of those screens
 * knowing about the Training module.
 *
 * These records are DISPLAY-ONLY. They are merged in on the screen and are never written to the shared
 * records (the same rule as records pulled from the other venue), so they can't be edited, archived or
 * accidentally saved back, and a stale browser can't overwrite them. They are flagged `__training`.
 *
 * `rows` is GET /api/training/records (General Manager only). A row becomes a record only when the person has
 * passed that module and their login is paired with a Staff register entry that still exists and is not archived.
 * A failed attempt is not a training record.
 */
export function deriveTrainingRecords(rows, staff) {
  const byId = new Map((staff || []).map((s) => [s.id, s]));
  const out = [];
  for (const r of rows || []) {
    if (!r.staffId || !r.lastPass) continue;
    const member = byId.get(r.staffId);
    if (!member || member.archived) continue;
    const completed = isoDay(r.lastPass.completedAt);
    out.push({
      id: `training:${r.userId}:${r.moduleId}`,
      category: "training",
      title: member.name,
      detail: TRAINING_MODULE_PRESET[r.moduleId] || r.moduleTitle || r.moduleId,
      staffId: member.id,
      completedDate: completed,
      expiryDate: isoDay(r.lastPass.validUntil),
      notes: `Completed in the Ledger training module (content version ${r.lastPass.version}), score ${r.lastPass.score} of ${r.lastPass.total}, certificate ${r.lastPass.certNo}. This record is generated from the training results and can't be edited here.`,
      location: "", people: "", attachments: [], tags: [], archived: false, flagged: false,
      createdAt: completed, updatedAt: completed, history: [],
      __training: true,
    });
  }
  return out;
}
