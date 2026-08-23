import React, { useState, useMemo, useContext } from "react";
import { Droplet, Thermometer, CheckCircle2, AlertCircle, Repeat, Share2 } from "lucide-react";
import {
  legionellaCheckPeriodKey, legionellaCheckPeriodLabel, legionellaCheckPeriodsInRange, legionellaCheckFindMissing,
  legionellaCheckExportSource, isLegionellaCheckLocked, legionellaCheckEligibleItems, legionellaCheckEligibleCheckpoints,
  checkpointCheckPeriodKey, checkpointCheckPeriodsInRange, checkpointCheckPeriodLabel, isCheckpointCheckLocked,
  legionellaTempCheckEligibleCheckpoints, legionellaTempCheckFindMissing, legionellaTempCheckExportSource,
  todayStr, fmtDate, findOpenLinkedIssue,
} from "../../lib/helpers";
import { ErrorBanner, FormPage, HistoryList, PatternCallout, SaveStatusBanner } from "../shared/UI";
import { RoleContext, TEMPLATES } from "../../lib/constants";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function LegionellaChecksMenuPage({ onPickDescaling, onPickTemp, onClose }) {
  const options = [
    { key: "descaling", label: "Descaling", icon: Droplet, accent: TEMPLATES.legionella_check.accent, desc: "Kettle, shower head, and tap descaling — one check per checkpoint per quarter.", onClick: onPickDescaling },
    { key: "temp", label: "Water Temperature", icon: Thermometer, accent: TEMPLATES.legionella_temp_check.accent, desc: "Hot and cold outlet readings at taps and shower heads — one check per checkpoint per month.", onClick: onPickTemp },
  ];
  return (
    <FormPage title="Legionella Checks" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((o) => (
          <button key={o.key} type="button" className="template-card" style={{ borderLeft: `4px solid ${o.accent}`, alignItems: "flex-start", textAlign: "left", padding: "14px 16px" }} onClick={o.onClick}>
            <o.icon size={20} color={o.accent} />
            <span><strong style={{ display: "block", marginBottom: 2 }}>{o.label}</strong><span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{o.desc}</span></span>
          </button>
        ))}
      </div>
    </FormPage>
  );
}

export function LegionellaChecksPage({ checkpoints, assets, records, canEdit, onSaveOk, onOpenNotOk, onOpenDetail, onViewPast, onExport, onClose }) {
  const { canExport } = useContext(RoleContext);
  const periodKey = legionellaCheckPeriodKey();
  const periodLabel = legionellaCheckPeriodLabel(periodKey);
  const eligible = useMemo(() => legionellaCheckEligibleCheckpoints(checkpoints, assets), [checkpoints, assets]);
  const recordFor = (cpId) => records.find((r) => r.category === "legionella_check" && r.checkpointId === cpId && r.periodKey === periodKey && !r.archived);
  const itemsFor = (cp) => legionellaCheckEligibleItems(cp, assets);
  const totalItems = eligible.reduce((sum, cp) => sum + itemsFor(cp).length, 0);
  const doneItems = eligible.reduce((sum, cp) => sum + itemsFor(cp).filter((item) => recordFor(cp.id)?.checks?.[item.key]?.status).length, 0);

  return (
    <FormPage title="Legionella Descaling Checks" onClose={onClose} footer={canExport ? <button type="button" className="btn btn-ghost" onClick={onExport}><Share2 size={15} /> Export for an inspection</button> : null}>
      <p className="muted" style={{ marginTop: 0 }}>
        {periodLabel} — {doneItems}/{totalItems} items done. Tap OK once a fixture's been descaled/checked;
        tap Not OK to note what's wrong — it'll automatically raise a maintenance issue. Tap the checkpoint
        name to review or correct this quarter's record.
      </p>
      {eligible.length === 0 ? (
        <p className="empty-state">No checkpoints have a kettle, shower head, or tap assigned yet — add checkpoints and assign those assets to them first.</p>
      ) : (
        <div className="ledger-table">
          {eligible.map((cp) => {
            const rec = recordFor(cp.id);
            const items = itemsFor(cp);
            const locked = rec ? isLegionellaCheckLocked(rec) : false;
            const readOnly = locked && !canEdit;
            return (
              <div key={cp.id} className="ledger-row ledger-row--flat">
                <span className="mono-strong" style={rec ? { cursor: "pointer", textDecoration: "underline" } : undefined} onClick={rec ? () => onOpenDetail(cp, periodKey, rec) : undefined}>
                  <Droplet size={14} color="#2A6F97" style={{ verticalAlign: -2, marginRight: 5 }} />
                  {cp.name}
                </span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {items.map((item) => {
                    const itemState = rec?.checks?.[item.key];
                    return (
                      <span key={item.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {itemState?.status === "ok" && <CheckCircle2 size={13} color="#2F6B4C" />}
                        {itemState?.status === "not_ok" && <AlertCircle size={13} color="#A8402F" />}
                        <span className="muted" style={{ fontSize: 12.5 }}>{item.label}</span>
                        {!readOnly && (
                          <span style={{ display: "flex", gap: 3 }}>
                            <button type="button" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11.5, background: itemState?.status === "ok" ? "#EAF3EC" : "#fff", color: itemState?.status === "ok" ? "#2F6B4C" : undefined }} onClick={() => onSaveOk(cp.id, periodKey, rec, item.key)}>OK</button>
                            <button type="button" className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11.5, background: itemState?.status === "not_ok" ? "#FBEAE7" : "#fff", color: itemState?.status === "not_ok" ? "#A8402F" : undefined }} onClick={() => onOpenNotOk(cp, periodKey, rec, item.key)}>Not OK</button>
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
                <span>{readOnly && <span className="muted" style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onViewPast(rec)}>Locked — view</span>}</span>
                <span></span>
              </div>
            );
          })}
        </div>
      )}
    </FormPage>
  );
}

export function LegionellaCheckDetailPage({ checkpoint, assets, periodKey, record, records, initialItemKey, initialStatus, canEdit, onSave, onViewIssue, onClose }) {
  const locked = record ? isLegionellaCheckLocked(record) : false;
  const editable = !locked || canEdit;
  const readOnlyView = locked && !canEdit;
  const items = useMemo(() => legionellaCheckEligibleItems(checkpoint, assets), [checkpoint, assets]);
  const [form, setForm] = useState(() => {
    const initial = {};
    for (const item of items) {
      const existing = record?.checks?.[item.key];
      initial[item.key] = item.key === initialItemKey
        ? { status: initialStatus || existing?.status || "not_ok", note: existing?.note || "" }
        : existing
          ? { status: existing.status, note: existing.note || "" }
          : { status: null, note: "" };
    }
    return initial;
  });
  const [confirmNewKeys, setConfirmNewKeys] = useState(() => new Set());
  const [errors, setErrors] = useState([]);
  const setItemStatus = (key, status) => setForm((f) => ({ ...f, [key]: { status, note: status === "ok" ? "" : f[key].note } }));
  const setItemNote = (key, note) => setForm((f) => ({ ...f, [key]: { ...f[key], note } }));
  const toggleConfirmNew = (key, checked) => setConfirmNewKeys((s) => {
    const next = new Set(s);
    if (checked) next.add(key); else next.delete(key);
    return next;
  });

  const handleSubmit = () => {
    const missingNotes = items.filter((item) => form[item.key].status === "not_ok" && !form[item.key].note.trim());
    if (missingNotes.length > 0) { setErrors([`Note what's wrong for: ${missingNotes.map((i) => i.label).join(", ")} — this becomes the maintenance issue.`]); return; }
    setErrors([]);
    const checks = {};
    for (const item of items) if (form[item.key].status) checks[item.key] = { status: form[item.key].status, note: form[item.key].status === "not_ok" ? form[item.key].note.trim() : "" };
    onSave(checkpoint.id, periodKey, record, checks, Array.from(confirmNewKeys));
  };

  return (
    <FormPage title={checkpoint.name} onClose={onClose} footer={
      readOnlyView ? null : <button type="button" className="btn btn-primary" onClick={handleSubmit}>Save</button>
    }>
      <ErrorBanner errors={errors} />
      {readOnlyView && <PatternCallout icon={Repeat}>This period is locked.</PatternCallout>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((item) => {
          const openIssue = record ? findOpenLinkedIssue(records, `${record.id}:${item.key}`) : null;
          return (
            <div key={item.key}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{item.label}</div>
              {!readOnlyView && (
                <div style={{ display: "flex", gap: 6, marginBottom: form[item.key].status === "not_ok" ? 8 : 0 }}>
                  <button type="button" className="btn btn-ghost" disabled={!editable} style={{ background: form[item.key].status === "ok" ? "#EAF3EC" : "#fff", color: form[item.key].status === "ok" ? "#2F6B4C" : undefined }} onClick={() => setItemStatus(item.key, "ok")}>OK</button>
                  <button type="button" className="btn btn-ghost" disabled={!editable} style={{ background: form[item.key].status === "not_ok" ? "#FBEAE7" : "#fff", color: form[item.key].status === "not_ok" ? "#A8402F" : undefined }} onClick={() => setItemStatus(item.key, "not_ok")}>Not OK</button>
                </div>
              )}
              {form[item.key].status === "not_ok" && openIssue && !readOnlyView && (
                <>
                  <PatternCallout icon={AlertCircle}>
                    There's already an open maintenance issue for {item.label.toLowerCase()}, raised {fmtDate(openIssue.dateRaised)}: "{openIssue.notes}" — still unresolved.
                  </PatternCallout>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: -6, marginBottom: 8 }}>
                    <label className="checkbox-row" style={{ fontWeight: 400, fontSize: 13 }}>
                      <input type="checkbox" checked={confirmNewKeys.has(item.key)} onChange={(e) => toggleConfirmNew(item.key, e.target.checked)} />
                      This is a new, separate failure — log it as its own issue
                    </label>
                    <button type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, flexShrink: 0 }} onClick={() => onViewIssue(openIssue)}>View open issue</button>
                  </div>
                </>
              )}
              {form[item.key].status === "not_ok" && !readOnlyView && (
                <textarea rows={3} disabled={!editable} value={form[item.key].note} onChange={(e) => setItemNote(item.key, e.target.value)} placeholder="What's wrong?" />
              )}
              {readOnlyView && (
                form[item.key].status === "ok" ? <p className="muted" style={{ margin: 0 }}>Checked OK for this period.</p>
                  : form[item.key].status === "not_ok" ? <p className="muted" style={{ margin: 0 }}>Not OK — {form[item.key].note}</p>
                    : <p className="muted" style={{ margin: 0 }}>Not checked this period.</p>
              )}
            </div>
          );
        })}
      </div>
      {record && <HistoryList history={record.history} />}
    </FormPage>
  );
}

export function LegionellaChecksExportPage({ checkpoints, assets, records, onOpenMissing, onExportFallback, onClose, branding }) {
  const [startDate, setStartDate] = useState(`${legionellaCheckPeriodKey().slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(todayStr());
  const [saveStatus, setSaveStatus] = useState(null);
  const validRange = startDate && endDate && startDate <= endDate;
  const eligible = useMemo(() => legionellaCheckEligibleCheckpoints(checkpoints, assets), [checkpoints, assets]);
  const periods = useMemo(() => (validRange ? legionellaCheckPeriodsInRange(startDate, endDate) : []), [startDate, endDate, validRange]);
  const missing = useMemo(
    () => (validRange ? legionellaCheckFindMissing(checkpoints, assets, records, startDate, endDate) : []),
    [checkpoints, assets, records, startDate, endDate, validRange]
  );
  const canExport = validRange && eligible.length > 0 && periods.length > 0 && missing.length === 0;

  const handleExport = async () => {
    if (!canExport) return;
    const title = "Legionella Checks";
    const rows = [];
    for (const periodKey of periods) {
      for (const cp of eligible) {
        const rec = records.find((r) => r.category === "legionella_check" && r.checkpointId === cp.id && r.periodKey === periodKey && !r.archived);
        const source = legionellaCheckExportSource(rec);
        for (const item of legionellaCheckEligibleItems(cp, assets)) {
          const itemSource = source?.checks?.[item.key];
          rows.push({
            checkpoint: cp.name,
            item: item.label,
            period: legionellaCheckPeriodLabel(periodKey),
            status: !itemSource?.status ? "Not logged" : itemSource.status === "ok" ? "OK" : "Not OK",
            note: itemSource?.note || "",
            by: source?.by || "",
          });
        }
      }
    }
    const columns = [
      { key: "checkpoint", label: "Checkpoint", width: 0.18 },
      { key: "item", label: "Fixture", width: 0.14 },
      { key: "period", label: "Period", width: 0.18 },
      { key: "status", label: "Status", width: 0.12 },
      { key: "note", label: "Note", width: 0.24 },
      { key: "by", label: "Checked by", width: 0.14 },
    ];
    const subtitle = `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`legionella-checks-${startDate}-to-${endDate}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <FormPage title="Export Legionella Descaling Checks" onClose={onClose} footer={
      <button type="button" className="btn btn-primary" disabled={!canExport} onClick={handleExport}>
        <Share2 size={15} /> Export {periods.length > 0 ? `${periods.length} quarter${periods.length === 1 ? "" : "s"}` : ""}
      </button>
    }>
      <SaveStatusBanner status={saveStatus} />
      <div className="row-2">
        <label>From<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>To<input type="date" max={todayStr()} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>
      {!validRange && <p className="muted">Pick a start and end date to continue.</p>}
      {validRange && eligible.length === 0 && <p className="muted">No checkpoints have a kettle, shower head, or tap assigned yet — nothing to export.</p>}
      {validRange && eligible.length > 0 && missing.length > 0 && (
        <div className="form-error-banner">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Can't export — {missing.length} check{missing.length === 1 ? "" : "s"} {missing.length === 1 ? "is" : "are"} missing in this range.
          </div>
          <div>Log {missing.length === 1 ? "it" : "them"} first — an inspector should never see a gap nobody caught. Missing:</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {missing.slice(0, 20).map((m) => (
              <button key={m.checkpointId + m.periodKey + m.itemKey} type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, background: "#fff" }}
                onClick={() => onOpenMissing(checkpoints.find((cp) => cp.id === m.checkpointId), m.periodKey, m.itemKey)}>
                {m.checkpointName} — {m.itemLabel} — {legionellaCheckPeriodLabel(m.periodKey)}
              </button>
            ))}
            {missing.length > 20 && <span className="muted" style={{ alignSelf: "center" }}>and {missing.length - 20} more</span>}
          </div>
        </div>
      )}
      {canExport && (
        <p className="muted">
          {periods.length} quarter{periods.length === 1 ? "" : "s"} across {eligible.length} checkpoint{eligible.length === 1 ? "" : "s"} —
          every eligible fixture has a record for every quarter in this range.
        </p>
      )}
    </FormPage>
  );
}

export function LegionellaTempCheckPage({ checkpoints, assets, records, canEdit, onOpenDetail, onViewPast, onExport, onClose }) {
  const { canExport } = useContext(RoleContext);
  const periodKey = checkpointCheckPeriodKey();
  const periodLabel = checkpointCheckPeriodLabel(periodKey);
  const eligible = useMemo(() => legionellaTempCheckEligibleCheckpoints(checkpoints, assets), [checkpoints, assets]);
  const recordFor = (cpId) => records.find((r) => r.category === "legionella_temp_check" && r.checkpointId === cpId && r.periodKey === periodKey && !r.archived);
  const doneCount = eligible.filter((cp) => recordFor(cp.id)).length;

  return (
    <FormPage title="Legionella Water Temperature Checks" onClose={onClose} footer={canExport ? <button type="button" className="btn btn-ghost" onClick={onExport}><Share2 size={15} /> Export for an inspection</button> : null}>
      <p className="muted" style={{ marginTop: 0 }}>
        {periodLabel} — {doneCount}/{eligible.length} checkpoints done. Tap a checkpoint to log this month's hot and cold readings.
      </p>
      {eligible.length === 0 ? (
        <p className="empty-state">No checkpoints have a tap or shower head assigned yet — add checkpoints and assign those assets to them first.</p>
      ) : (
        <div className="ledger-table">
          {eligible.map((cp) => {
            const rec = recordFor(cp.id);
            const locked = rec ? isCheckpointCheckLocked(rec) : false;
            const readOnly = locked && !canEdit;
            return (
              <div key={cp.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => (readOnly ? onViewPast(rec) : onOpenDetail(cp, periodKey, rec))}>
                <span className="mono-strong">
                  {rec?.status === "ok" && <CheckCircle2 size={15} color="#2F6B4C" style={{ verticalAlign: -2, marginRight: 5 }} />}
                  {rec?.status === "not_ok" && <AlertCircle size={15} color="#A8402F" style={{ verticalAlign: -2, marginRight: 5 }} />}
                  {cp.name}
                </span>
                <span className="muted">{rec ? `Hot ${rec.hotTempC ?? "—"}°C · Cold ${rec.coldTempC ?? "—"}°C` : "Not logged"}</span>
                <span className="muted">{readOnly ? "Locked — view" : rec ? "Edit" : "Log this month"}</span>
                <span></span>
              </div>
            );
          })}
        </div>
      )}
    </FormPage>
  );
}

export function LegionellaTempCheckDetailPage({ checkpoint, periodKey, record, records, canEdit, onSave, onViewIssue, onClose }) {
  const locked = record ? isCheckpointCheckLocked(record) : false;
  const editable = !locked || canEdit;
  const readOnlyView = locked && !canEdit;
  const [hotTempC, setHotTempC] = useState(record?.hotTempC ?? "");
  const [coldTempC, setColdTempC] = useState(record?.coldTempC ?? "");
  const [status, setStatus] = useState(record?.status || "ok");
  const [note, setNote] = useState(record?.note || "");
  const [confirmNew, setConfirmNew] = useState(false);
  const [errors, setErrors] = useState([]);
  const openIssue = record ? findOpenLinkedIssue(records, record.id) : null;

  const handleSubmit = () => {
    if (status === "not_ok" && !note.trim()) { setErrors(["Note what's wrong — this becomes the maintenance issue."]); return; }
    setErrors([]);
    onSave(checkpoint.id, periodKey, record, hotTempC === "" ? null : parseFloat(hotTempC), coldTempC === "" ? null : parseFloat(coldTempC), status, note.trim(), { forceNewIssue: confirmNew });
  };

  return (
    <FormPage title={checkpoint.name} onClose={onClose} footer={
      readOnlyView ? null : <button type="button" className="btn btn-primary" onClick={handleSubmit}>{status === "not_ok" ? <>Save &amp; raise maintenance issue</> : "Save"}</button>
    }>
      <ErrorBanner errors={errors} />
      {readOnlyView && <PatternCallout icon={Repeat}>This period is locked.</PatternCallout>}
      <div className="row-2">
        <label>Hot reading (°C)<input type="number" step="0.1" disabled={!editable} value={hotTempC} onChange={(e) => setHotTempC(e.target.value)} placeholder="e.g. 54" /></label>
        <label>Cold reading (°C)<input type="number" step="0.1" disabled={!editable} value={coldTempC} onChange={(e) => setColdTempC(e.target.value)} placeholder="e.g. 16" /></label>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        For reference, HSE ACOP L8 guidance generally targets hot water ≥50°C at the outlet within 1 minute and cold water ≤20°C within 2 minutes — confirm the exact figures against your own risk assessment, as this varies by system.
      </p>
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
        <label>What's wrong?<textarea rows={4} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hot outlet reading only 41°C after 1 minute, expected ≥50°C." /></label>
      )}
      {status === "ok" && readOnlyView && <p className="muted" style={{ margin: 0 }}>Checked OK for this period.</p>}
      {record && <HistoryList history={record.history} />}
    </FormPage>
  );
}

export function LegionellaTempChecksExportPage({ checkpoints, assets, records, onOpenMissing, onExportFallback, onClose, branding }) {
  const [startDate, setStartDate] = useState(`${checkpointCheckPeriodKey()}-01`);
  const [endDate, setEndDate] = useState(todayStr());
  const [saveStatus, setSaveStatus] = useState(null);
  const validRange = startDate && endDate && startDate <= endDate;
  const eligible = useMemo(() => legionellaTempCheckEligibleCheckpoints(checkpoints, assets), [checkpoints, assets]);
  const periods = useMemo(() => (validRange ? checkpointCheckPeriodsInRange(startDate, endDate) : []), [startDate, endDate, validRange]);
  const missing = useMemo(
    () => (validRange ? legionellaTempCheckFindMissing(checkpoints, assets, records, startDate, endDate) : []),
    [checkpoints, assets, records, startDate, endDate, validRange]
  );
  const canExport = validRange && eligible.length > 0 && periods.length > 0 && missing.length === 0;

  const handleExport = async () => {
    if (!canExport) return;
    const title = "Legionella Water Temperature Checks";
    const rows = [];
    for (const periodKey of periods) {
      for (const cp of eligible) {
        const rec = records.find((r) => r.category === "legionella_temp_check" && r.checkpointId === cp.id && r.periodKey === periodKey && !r.archived);
        const source = legionellaTempCheckExportSource(rec);
        rows.push({
          checkpoint: cp.name,
          period: checkpointCheckPeriodLabel(periodKey),
          hot: source?.hotTempC != null ? `${source.hotTempC}°C` : "—",
          cold: source?.coldTempC != null ? `${source.coldTempC}°C` : "—",
          status: !source ? "Not logged" : source.status === "ok" ? "OK" : "Not OK",
          note: source?.note || "",
          by: source?.by || "",
        });
      }
    }
    const columns = [
      { key: "checkpoint", label: "Checkpoint", width: 0.18 },
      { key: "period", label: "Period", width: 0.14 },
      { key: "hot", label: "Hot", width: 0.1 },
      { key: "cold", label: "Cold", width: 0.1 },
      { key: "status", label: "Status", width: 0.12 },
      { key: "note", label: "Note", width: 0.22 },
      { key: "by", label: "Checked by", width: 0.14 },
    ];
    const subtitle = `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`legionella-temp-checks-${startDate}-to-${endDate}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <FormPage title="Export Water Temperature Checks" onClose={onClose} footer={
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
      {validRange && eligible.length === 0 && <p className="muted">No checkpoints have a tap or shower head assigned yet — nothing to export.</p>}
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
