import React from "react";
import { GraduationCap } from "lucide-react";
import { fmtDate } from "../../lib/helpers";
import { isoDay, reminderReason } from "../../lib/training/status";

/** A note on the home page for someone with assigned training still to do. Shows nothing when there is none. */
export function TrainingReminderCard({ reminders, onOpen }) {
  if (!reminders || reminders.length === 0) return null;
  const shown = reminders.slice(0, 6);
  return (
    <div className="tr-remind" role="status">
      <GraduationCap size={20} />
      <div className="tr-remind-body">
        <strong>You have {reminders.length} training module{reminders.length === 1 ? "" : "s"} to complete</strong>
        <ul>
          {shown.map((r) => (
            <li key={r.moduleId}>{r.title}: {reminderReason(r)}{r.reason === "expired" && r.validUntil ? ` (expired ${fmtDate(isoDay(r.validUntil))})` : ""}</li>
          ))}
          {reminders.length > shown.length && <li>and {reminders.length - shown.length} more</li>}
        </ul>
        <button type="button" className="btn btn-primary" onClick={onOpen}>Open training</button>
      </div>
    </div>
  );
}
