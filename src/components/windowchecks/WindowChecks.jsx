import React, { useState, useMemo } from "react";
import { Blinds, CheckCircle2, AlertCircle, Repeat } from "lucide-react";
import {
  checkpointCheckPeriodKey, checkpointCheckPeriodLabel, isCheckpointCheckLocked,
} from "../../lib/helpers";
import { ErrorBanner, FormPage, HistoryList, PatternCallout } from "../shared/UI";

export function WindowRestrictionChecksPage({ checkpoints, assets, records, canEdit, onSaveOk, onOpenNotOk, onOpenDetail, onViewPast, onClose }) {
  const periodKey = checkpointCheckPeriodKey();
  const periodLabel = checkpointCheckPeriodLabel(periodKey);
  const eligible = useMemo(
    () => checkpoints.filter((cp) => !cp.archived && assets.some((a) => a.checkpointId === cp.id && !a.archived)),
    [checkpoints, assets]
  );
  const recordFor = (cpId) => records.find((r) => r.category === "window_restriction_check" && r.checkpointId === cpId && r.periodKey === periodKey && !r.archived);
  const doneCount = eligible.filter((cp) => recordFor(cp.id)).length;

  return (
    <FormPage title="Window Restriction Checks" onClose={onClose} footer={null}>
      <p className="muted" style={{ marginTop: 0 }}>
        {periodLabel} — {doneCount}/{eligible.length} checkpoints done. Tap OK to mark every window here checked;
        tap Not OK to note what's wrong — it'll automatically raise a maintenance issue. Tap the checkpoint name
        to view its history for this period.
      </p>
      {eligible.length === 0 ? (
        <p className="empty-state">No checkpoints have a window asset yet — add checkpoints and assign windows to them first.</p>
      ) : (
        <div className="ledger-table">
          {eligible.map((cp) => {
            const rec = recordFor(cp.id);
            const locked = rec ? isCheckpointCheckLocked(rec) : false;
            const readOnly = locked && !canEdit;
            const windowCount = assets.filter((a) => a.checkpointId === cp.id && !a.archived).length;
            return (
              <div key={cp.id} className="ledger-row ledger-row--flat">
                <span className="mono-strong" style={rec ? { cursor: "pointer", textDecoration: "underline" } : undefined} onClick={rec ? () => onOpenDetail(cp, periodKey, rec) : undefined}>
                  {rec?.status === "ok" && <CheckCircle2 size={15} color="#2F6B4C" style={{ verticalAlign: -2, marginRight: 5 }} />}
                  {rec?.status === "not_ok" && <AlertCircle size={15} color="#A8402F" style={{ verticalAlign: -2, marginRight: 5 }} />}
                  {cp.name}
                </span>
                <span className="muted">{windowCount} window{windowCount === 1 ? "" : "s"}</span>
                {readOnly ? (
                  <span className="muted" style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onViewPast(rec)}>Locked — view</span>
                ) : (
                  <span style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, background: rec?.status === "ok" ? "#EAF3EC" : "#fff", color: rec?.status === "ok" ? "#2F6B4C" : undefined }} onClick={() => onSaveOk(cp.id, periodKey, rec)}>OK</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, background: rec?.status === "not_ok" ? "#FBEAE7" : "#fff", color: rec?.status === "not_ok" ? "#A8402F" : undefined }} onClick={() => onOpenNotOk(cp, periodKey, rec)}>Not OK</button>
                  </span>
                )}
                <span></span>
              </div>
            );
          })}
        </div>
      )}
    </FormPage>
  );
}

export function WindowCheckDetailPage({ checkpoint, periodKey, record, initialStatus, canEdit, onSave, onClose }) {
  const locked = record ? isCheckpointCheckLocked(record) : false;
  const editable = !locked || canEdit;
  const readOnlyView = locked && !canEdit;
  const [status, setStatus] = useState(initialStatus || record?.status || "not_ok");
  const [note, setNote] = useState(record?.note || "");
  const [errors, setErrors] = useState([]);

  const handleSubmit = () => {
    if (status === "not_ok" && !note.trim()) { setErrors(["Note which window and what's wrong — this becomes the maintenance issue."]); return; }
    setErrors([]);
    onSave(checkpoint.id, periodKey, record, status, note.trim());
  };

  return (
    <FormPage title={checkpoint.name} onClose={onClose} footer={
      readOnlyView ? null : <button type="button" className="btn btn-primary" onClick={handleSubmit}>{status === "not_ok" ? <>Save &amp; raise maintenance issue</> : "Save"}</button>
    }>
      <ErrorBanner errors={errors} />
      {readOnlyView && <PatternCallout icon={Repeat}>This period is locked.</PatternCallout>}
      {!readOnlyView && (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-ghost" style={{ background: status === "ok" ? "#EAF3EC" : "#fff", color: status === "ok" ? "#2F6B4C" : undefined }} onClick={() => setStatus("ok")}>OK</button>
          <button type="button" className="btn btn-ghost" style={{ background: status === "not_ok" ? "#FBEAE7" : "#fff", color: status === "not_ok" ? "#A8402F" : undefined }} onClick={() => setStatus("not_ok")}>Not OK</button>
        </div>
      )}
      {status === "not_ok" && (
        <label>Which window, and what's wrong?<textarea rows={4} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Window nearest the bathroom — restrictor arm is loose, doesn't catch." /></label>
      )}
      {status === "ok" && readOnlyView && <p className="muted" style={{ margin: 0 }}>Checked OK for this period.</p>}
      {record && <HistoryList history={record.history} />}
    </FormPage>
  );
}
