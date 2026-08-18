import React, { useState, useMemo, useContext } from "react";
import { Blinds, CheckCircle2, AlertCircle, Repeat, Share2 } from "lucide-react";
import {
  checkpointCheckPeriodKey, checkpointCheckPeriodLabel, checkpointCheckPeriodsInRange, checkpointCheckFindMissing,
  checkpointCheckExportSource, checkpointCheckEligibleCheckpoints, isCheckpointCheckLocked, todayStr, fmtDate, findOpenLinkedIssue,
} from "../../lib/helpers";
import { ErrorBanner, FormPage, HistoryList, PatternCallout, SaveStatusBanner } from "../shared/UI";
import { RoleContext } from "../../lib/constants";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function WindowRestrictionChecksPage({ checkpoints, assets, records, canEdit, onSaveOk, onOpenNotOk, onOpenDetail, onViewPast, onExport, onClose }) {
  const { canDelete } = useContext(RoleContext);
  const periodKey = checkpointCheckPeriodKey();
  const periodLabel = checkpointCheckPeriodLabel(periodKey);
  const eligible = useMemo(() => checkpointCheckEligibleCheckpoints(checkpoints, assets), [checkpoints, assets]);
  const recordFor = (cpId) => records.find((r) => r.category === "window_restriction_check" && r.checkpointId === cpId && r.periodKey === periodKey && !r.archived);
  const doneCount = eligible.filter((cp) => recordFor(cp.id)).length;

  return (
    <FormPage title="Window Restriction Checks" onClose={onClose} footer={canDelete ? <button type="button" className="btn btn-ghost" onClick={onExport}><Share2 size={15} /> Export for an inspection</button> : null}>
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
            const windowCount = assets.filter((a) => a.checkpointId === cp.id && !a.archived && a.assetType === "window_restrictor").length;
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

export function WindowCheckDetailPage({ checkpoint, periodKey, record, records, initialStatus, canEdit, onSave, onViewIssue, onClose }) {
  const locked = record ? isCheckpointCheckLocked(record) : false;
  const editable = !locked || canEdit;
  const readOnlyView = locked && !canEdit;
  const [status, setStatus] = useState(initialStatus || record?.status || "not_ok");
  const [note, setNote] = useState(record?.note || "");
  const [confirmNew, setConfirmNew] = useState(false);
  const [errors, setErrors] = useState([]);
  const openIssue = record ? findOpenLinkedIssue(records, record.id) : null;

  const handleSubmit = () => {
    if (status === "not_ok" && !note.trim()) { setErrors(["Note which window and what's wrong — this becomes the maintenance issue."]); return; }
    setErrors([]);
    onSave(checkpoint.id, periodKey, record, status, note.trim(), { forceNewIssue: confirmNew });
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
      {status === "not_ok" && openIssue && !readOnlyView && (
        <>
          <PatternCallout icon={AlertCircle}>
            There's already an open maintenance issue for this, raised {fmtDate(openIssue.dateRaised)}: "{openIssue.notes}" — still unresolved.
          </PatternCallout>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: -6, marginBottom: 14 }}>
            <label className="checkbox-row" style={{ fontWeight: 400, fontSize: 13 }}>
              <input type="checkbox" checked={confirmNew} onChange={(e) => setConfirmNew(e.target.checked)} />
              This is a new, separate failure — log it as its own issue
            </label>
            <button type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, flexShrink: 0 }} onClick={() => onViewIssue(openIssue)}>View open issue</button>
          </div>
        </>
      )}
      {status === "not_ok" && (
        <label>Which window, and what's wrong?<textarea rows={4} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Window nearest the bathroom — restrictor arm is loose, doesn't catch." /></label>
      )}
      {status === "ok" && readOnlyView && <p className="muted" style={{ margin: 0 }}>Checked OK for this period.</p>}
      {record && <HistoryList history={record.history} />}
    </FormPage>
  );
}

export function WindowChecksExportPage({ checkpoints, assets, records, onOpenMissing, onExportFallback, onClose, branding }) {
  const [startDate, setStartDate] = useState(`${checkpointCheckPeriodKey()}-01`);
  const [endDate, setEndDate] = useState(todayStr());
  const [saveStatus, setSaveStatus] = useState(null);
  const validRange = startDate && endDate && startDate <= endDate;
  const eligible = useMemo(() => checkpointCheckEligibleCheckpoints(checkpoints, assets), [checkpoints, assets]);
  const periods = useMemo(() => (validRange ? checkpointCheckPeriodsInRange(startDate, endDate) : []), [startDate, endDate, validRange]);
  const missing = useMemo(
    () => (validRange ? checkpointCheckFindMissing(checkpoints, assets, records, startDate, endDate) : []),
    [checkpoints, assets, records, startDate, endDate, validRange]
  );
  const canExport = validRange && eligible.length > 0 && periods.length > 0 && missing.length === 0;

  const handleExport = async () => {
    if (!canExport) return;
    const title = "Window Restriction Checks";
    const rows = [];
    for (const periodKey of periods) {
      for (const cp of eligible) {
        const rec = records.find((r) => r.category === "window_restriction_check" && r.checkpointId === cp.id && r.periodKey === periodKey && !r.archived);
        const source = checkpointCheckExportSource(rec);
        rows.push({
          checkpoint: cp.name,
          period: checkpointCheckPeriodLabel(periodKey),
          status: !source ? "Not logged" : source.status === "ok" ? "OK" : "Not OK",
          note: source?.note || "",
          by: source?.by || "",
        });
      }
    }
    const columns = [
      { key: "checkpoint", label: "Checkpoint", width: 0.22 },
      { key: "period", label: "Period", width: 0.16 },
      { key: "status", label: "Status", width: 0.14 },
      { key: "note", label: "Note", width: 0.34 },
      { key: "by", label: "Checked by", width: 0.14 },
    ];
    const subtitle = `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`window-restriction-checks-${startDate}-to-${endDate}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <FormPage title="Export Window Restriction Checks" onClose={onClose} footer={
      <button type="button" className="btn btn-primary" disabled={!canExport} onClick={handleExport}>
        <Share2 size={15} /> Export {periods.length > 0 ? `${periods.length} month${periods.length === 1 ? "" : "s"}` : ""}
      </button>
    }>
      <SaveStatusBanner status={saveStatus} />
      <div className="row-2">
        <label>From<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>To<input type="date" max={todayStr()} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>
      {!validRange && <p className="muted">Pick a start and end date to continue.</p>}
      {validRange && eligible.length === 0 && <p className="muted">No checkpoints have a window asset yet — nothing to export.</p>}
      {validRange && eligible.length > 0 && missing.length > 0 && (
        <div className="form-error-banner">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Can't export — {missing.length} checkpoint check{missing.length === 1 ? "" : "s"} {missing.length === 1 ? "is" : "are"} missing in this range.
          </div>
          <div>Log {missing.length === 1 ? "it" : "them"} first — an inspector should never see a gap nobody caught. Missing:</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {missing.slice(0, 20).map((m) => (
              <button key={m.checkpointId + m.periodKey} type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, background: "#fff" }}
                onClick={() => onOpenMissing(checkpoints.find((cp) => cp.id === m.checkpointId), m.periodKey)}>
                {m.checkpointName} — {checkpointCheckPeriodLabel(m.periodKey)}
              </button>
            ))}
            {missing.length > 20 && <span className="muted" style={{ alignSelf: "center" }}>and {missing.length - 20} more</span>}
          </div>
        </div>
      )}
      {canExport && (
        <p className="muted">
          {periods.length} month{periods.length === 1 ? "" : "s"} × {eligible.length} checkpoint{eligible.length === 1 ? "" : "s"} —
          every one has a record for every month in this range.
        </p>
      )}
    </FormPage>
  );
}
