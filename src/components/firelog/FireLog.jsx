import React, { useState, useMemo, useContext } from "react";
import { Flame, ChevronRight, ChevronLeft, Repeat, CheckCircle2, AlertCircle, X, Download, Share2, Plus, MessageSquareWarning } from "lucide-react";
import { RoleContext, TEMPLATES, FIRE_LOG_ITEMS, FIRE_LOG_PERIOD_LABEL } from "../../lib/constants";
import {
  uid, todayStr, fmtDate, weekStartDate, fireLogCurrentPeriodKey, fireLogPeriodLabel, fireLogFindMissingDaily, fireLogWeeksInRange,
  fireLogLockBoundary, isFireLogLocked, fireLogLastEditor, fireLogEnsureSnapshot, fireLogSuspectedTimezoneAffected,
  hasPendingCorrection,
} from "../../lib/helpers";
import { buildFireLogPdf } from "../../lib/pdf/fireLogPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";
import { ErrorBanner, FormPage, HistoryList, PatternCallout, SaveStatusBanner } from "../shared/UI";

export function FireLogMenuPage({ records, onPick, onExport, onOpenSuspected, onClose }) {
  const { canDelete, canExport } = useContext(RoleContext);
  const suspectedCount = useMemo(() => canDelete ? records.filter(fireLogSuspectedTimezoneAffected).length : 0, [records, canDelete]);
  const options = [
    { category: "fire_daily", desc: "Exit doors and opening/closing procedure — one entry per day." },
    { category: "fire_weekly", desc: "Fire doors, alarm test, safety box, lift drop — one entry per week." },
    { category: "fire_monthly", desc: "Fire fighting equipment, emergency lighting, staff training — one entry per month." },
    { category: "fire_periodic", desc: "Fire drills and authority visits — logged whenever they happen." },
  ];
  return (
    <FormPage title="Fire Log Checks" onClose={onClose} footer={canExport ? <button type="button" className="btn btn-ghost" onClick={onExport}><Share2 size={15} /> Export for an inspection</button> : null}>
      {suspectedCount > 0 && (
        <div className="pattern-callout" style={{ cursor: "pointer" }} onClick={onOpenSuspected}>
          <MessageSquareWarning size={15} />
          <span>{suspectedCount} record{suspectedCount === 1 ? "" : "s"} logged before the July date-correction may need a quick look — their date might be a day off. Not confirmed wrong, worth checking.</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((o) => {
          const t = TEMPLATES[o.category];
          return (
            <button key={o.category} type="button" className="template-card" style={{ borderLeft: `4px solid ${t.accent}`, alignItems: "flex-start", textAlign: "left", padding: "14px 16px" }} onClick={() => onPick(o.category)}>
              <Flame size={20} color={t.accent} />
              <span><strong style={{ display: "block", marginBottom: 2 }}>{FIRE_LOG_PERIOD_LABEL[o.category]}</strong><span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{o.desc}</span></span>
            </button>
          );
        })}
      </div>
    </FormPage>
  );
}

export function FireLogEntryPage({ category, record, periodKeyOverride, canEdit, onSave, onRequestCorrection, onDismissCorrection, onClose }) {
  const items = FIRE_LOG_ITEMS[category];
  const locked = record ? isFireLogLocked(record) : false;
  const editable = !locked || canEdit;
  const readOnlyView = locked && !canEdit;
  const [checks, setChecks] = useState(() => record?.checks || {});
  const periodKey = record?.periodKey || periodKeyOverride || fireLogCurrentPeriodKey(category);
  const periodLabel = fireLogPeriodLabel(category, periodKey);
  const pending = record ? hasPendingCorrection(record) : false;
  const isBackdated = !record && periodKeyOverride && periodKeyOverride !== fireLogCurrentPeriodKey(category);

  const setItemField = (itemKey, field, value) => setChecks((prev) => ({ ...prev, [itemKey]: { ...prev[itemKey], [field]: value } }));

  return (
    <FormPage title={`${FIRE_LOG_PERIOD_LABEL[category]} Fire Log — ${periodLabel}`} onClose={onClose} footer={
      readOnlyView
        ? (record && <button type="button" className="btn btn-primary" onClick={() => onRequestCorrection(record)}><MessageSquareWarning size={15} /> Request correction</button>)
        : <>
            {record && locked && canEdit && pending && <button type="button" className="btn btn-ghost" onClick={() => onDismissCorrection(record.id)}>Dismiss request</button>}
            <button type="button" className="btn btn-primary" onClick={() => onSave(checks, periodKey)}>Save</button>
          </>
    }>
      {isBackdated && (
        <PatternCallout icon={Repeat}>Logging this for {periodLabel} — a date that's already passed. It'll show as completed on that date once saved, same as always; once saved it locks straight away since that day's already over.</PatternCallout>
      )}
      {locked && !readOnlyView && (
        <PatternCallout icon={Repeat}>This period has locked — you're editing directly as General Manager. The exported form already shows this period as it stood at lock time.</PatternCallout>
      )}
      {readOnlyView && (
        <PatternCallout icon={Repeat}>This period is locked. If something needs fixing, request a correction rather than waiting — the original stays on record either way.</PatternCallout>
      )}
      {pending && !readOnlyView && (
        <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>A correction has been requested on this entry — see its history below.</p>
      )}
      {items.map((item) => {
        const v = checks[item.key] || {};
        return (
          <div key={item.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            {item.hasNA ? (
              <label>{item.label}
                <select value={v.status || ""} disabled={!editable} onChange={(e) => setItemField(item.key, "status", e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="completed">Completed</option>
                  <option value="na">N/A</option>
                </select>
              </label>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: "row" }}>
                <input type="checkbox" checked={!!v.done} disabled={!editable} onChange={(e) => setItemField(item.key, "done", e.target.checked)} style={{ width: 17, height: 17 }} />
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{item.label}</span>
              </label>
            )}
            {item.hasCallPoint && (
              <label style={{ marginTop: 6 }}>Call point tested
                <input value={v.callPoint || ""} disabled={!editable} onChange={(e) => setItemField(item.key, "callPoint", e.target.value)} placeholder="e.g. Corridor 2nd floor" />
              </label>
            )}
            <label style={{ marginTop: 6 }}>Comments <span className="muted">(optional)</span>
              <input value={v.comments || ""} disabled={!editable} onChange={(e) => setItemField(item.key, "comments", e.target.value)} maxLength={200} />
            </label>
          </div>
        );
      })}
      {record && <HistoryList history={record.history} />}
    </FormPage>
  );
}

export function FireLogTypeMenuPage({ category, records, onOpenCurrent, onOpenForDate, onView, onClose }) {
  const currentKey = fireLogCurrentPeriodKey(category);
  const currentLabel = fireLogPeriodLabel(category, currentKey);
  const [pickedDate, setPickedDate] = useState("");
  const entries = records.filter((r) => r.category === category && !r.archived && r.periodKey !== currentKey).sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || ""));
  const pickedLabel = pickedDate ? fireLogPeriodLabel(category, fireLogCurrentPeriodKey(category, pickedDate)) : null;
  return (
    <FormPage title={`${FIRE_LOG_PERIOD_LABEL[category]} Fire Log`} onClose={onClose} footer={null}>
      <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px" }} onClick={onOpenCurrent}>
        <Plus size={16} /> {currentLabel} {records.some((r) => r.category === category && r.periodKey === currentKey) ? "(continue)" : "(start)"}
      </button>
      <div style={{ background: "#FAF8F2", border: "1px solid var(--line)", borderRadius: 9, padding: 12, marginTop: 4 }}>
        <label style={{ marginBottom: 6 }}>Catch up on a missed day <span className="muted">(pick a date — you can still log it, even if it's already passed)</span>
          <input type="date" max={todayStr()} value={pickedDate} onChange={(e) => setPickedDate(e.target.value)} />
        </label>
        {pickedDate && (
          <button type="button" className="btn btn-ghost" onClick={() => onOpenForDate(pickedDate)}>
            <Plus size={14} /> {pickedLabel}
          </button>
        )}
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: "#4A463D", margin: "8px 0 -4px" }}>Previous periods</h4>
      {entries.length === 0 ? <p className="empty-state">Nothing logged yet.</p> : (
        <div className="ledger-table">
          {entries.map((r) => {
            const locked = isFireLogLocked(r);
            const total = FIRE_LOG_ITEMS[category].length;
            const doneCount = FIRE_LOG_ITEMS[category].filter((i) => i.hasNA ? !!r.checks?.[i.key]?.status : !!r.checks?.[i.key]?.done).length;
            return (
              <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onView(r)}>
                <span className="mono-strong">{fireLogPeriodLabel(category, r.periodKey)}</span>
                <span className="muted">{doneCount}/{total} items</span>
                <span className="muted">{locked ? "Locked" : "Open"}</span>
                {hasPendingCorrection(r) && <span className="flag-tag" style={{ color: "#2A3A6E", background: "#EEF0FA" }}>Correction requested</span>}
              </div>
            );
          })}
        </div>
      )}
    </FormPage>
  );
}

export function FireLogExportPage({ records, onOpenDay, onExportFallback, onClose, branding }) {
  const { currentUser } = useContext(RoleContext);
  const [startDate, setStartDate] = useState(weekStartDate(todayStr()));
  const [endDate, setEndDate] = useState(todayStr());
  const [saveStatus, setSaveStatus] = useState(null);
  const validRange = startDate && endDate && startDate <= endDate;
  const missingDaily = useMemo(() => validRange ? fireLogFindMissingDaily(records, startDate, endDate) : [], [records, startDate, endDate, validRange]);
  const canExport = validRange && missingDaily.length === 0;
  const weeks = useMemo(() => validRange ? fireLogWeeksInRange(startDate, endDate) : [], [startDate, endDate, validRange]);

  const handleExport = async () => {
    if (!canExport) return;
    const title = "Fire Log";
    const pdfBytes = await buildFireLogPdf({ records, startDate, endDate, managerName: currentUser?.name, branding });
    const result = await exportPdfReport(`fire-log-${startDate}-to-${endDate}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <FormPage title="Export Fire Log" onClose={onClose} footer={
      <button type="button" className="btn btn-primary" disabled={!canExport} onClick={handleExport}>
        <Share2 size={15} /> Export {weeks.length > 0 ? `${weeks.length} week${weeks.length === 1 ? "" : "s"}` : ""}
      </button>
    }>
      <SaveStatusBanner status={saveStatus} />
      <div className="row-2">
        <label>From<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>To<input type="date" max={todayStr()} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>
      {!validRange && <p className="muted">Pick a start and end date to continue.</p>}
      {validRange && missingDaily.length > 0 && (
        <div className="form-error-banner">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Can't export — {missingDaily.length} daily check{missingDaily.length === 1 ? "" : "s"} {missingDaily.length === 1 ? "is" : "are"} missing in this range.
          </div>
          <div>Log {missingDaily.length === 1 ? "it" : "them"} first — an inspector should never see a gap nobody caught. Missing:</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {missingDaily.slice(0, 20).map((d) => (
              <button key={d} type="button" className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 12, background: "#fff" }} onClick={() => onOpenDay(d)}>
                {fmtDate(d)}
              </button>
            ))}
            {missingDaily.length > 20 && <span className="muted" style={{ alignSelf: "center" }}>and {missingDaily.length - 20} more</span>}
          </div>
        </div>
      )}
      {canExport && (
        <p className="muted">
          This produces {weeks.length} weekly page{weeks.length === 1 ? "" : "s"}, laid out like the paper fire log —
          every completed check shown regardless of when it was actually filed, blank only where nothing was ever logged.
          Locked periods show exactly as they stood when they locked.
        </p>
      )}
    </FormPage>
  );
}

export function FireLogSuspectedListPage({ records, onView, onClose }) {
  const suspected = records.filter(fireLogSuspectedTimezoneAffected).sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || ""));
  return (
    <FormPage title="Records that may need a look" onClose={onClose} footer={null}>
      <p className="muted" style={{ marginTop: 0 }}>
        These were logged before the July date-correction. Their date <em>might</em> be a day off from when they were
        actually recorded — not confirmed, just possible. Nothing has been changed automatically; open one to check
        it against what actually happened, and correct it yourself if it's wrong.
      </p>
      {suspected.length === 0 ? <p className="empty-state">None found.</p> : (
        <div className="ledger-table">
          {suspected.map((r) => (
            <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onView(r)}>
              <span className="mono-strong">{FIRE_LOG_PERIOD_LABEL[r.category]}</span>
              <span className="muted">{fireLogPeriodLabel(r.category, r.periodKey)}</span>
              <span className="muted">Logged {fmtDate(r.history?.[0]?.at?.slice(0, 10))}</span>
            </div>
          ))}
        </div>
      )}
    </FormPage>
  );
}

export function FireLogPeriodicMenuPage({ records, onLog, onView, onClose }) {
  const entries = records.filter((r) => r.category === "fire_periodic" && !r.archived).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return (
    <FormPage title="Periodic Fire Log" onClose={onClose} footer={null}>
      <div style={{ display: "flex", gap: 10 }}>
        {FIRE_LOG_ITEMS.fire_periodic.map((item) => (
          <button key={item.key} type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: "center", padding: "12px" }} onClick={() => onLog(item.key)}>
            <Plus size={15} /> Log {item.label.toLowerCase()}
          </button>
        ))}
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: "#4A463D", margin: "8px 0 -4px" }}>Previous entries</h4>
      {entries.length === 0 ? <p className="empty-state">Nothing logged yet.</p> : (
        <div className="ledger-table">
          {entries.map((r) => {
            const itemDef = FIRE_LOG_ITEMS.fire_periodic.find((i) => i.key === r.periodicItemKey);
            const locked = isFireLogLocked(r);
            return (
              <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onView(r)}>
                <span className="mono-strong">{itemDef?.label || r.title}</span>
                <span className="muted">{fmtDate(r.dateLogged)}</span>
                <span className="muted">{locked ? "Locked" : "Open for 24h"}</span>
                {hasPendingCorrection(r) && <span className="flag-tag" style={{ color: "#2A3A6E", background: "#EEF0FA" }}>Correction requested</span>}
              </div>
            );
          })}
        </div>
      )}
    </FormPage>
  );
}

export function FireLogPeriodicEntryPage({ itemKey, record, canEdit, onSave, onRequestCorrection, onDismissCorrection, onClose }) {
  const itemDef = FIRE_LOG_ITEMS.fire_periodic.find((i) => i.key === (record?.periodicItemKey || itemKey));
  const locked = record ? isFireLogLocked(record) : false;
  const editable = !locked || canEdit;
  const readOnlyView = locked && !canEdit;
  const [comments, setComments] = useState(record?.checks?.[itemDef.key]?.comments || "");
  const [dateLogged, setDateLogged] = useState(record?.dateLogged || todayStr());
  const pending = record ? hasPendingCorrection(record) : false;

  return (
    <FormPage title={itemDef.label} onClose={onClose} footer={
      readOnlyView
        ? (record && <button type="button" className="btn btn-primary" onClick={() => onRequestCorrection(record)}><MessageSquareWarning size={15} /> Request correction</button>)
        : <>
            {record && locked && canEdit && pending && <button type="button" className="btn btn-ghost" onClick={() => onDismissCorrection(record.id)}>Dismiss request</button>}
            <button type="button" className="btn btn-primary" onClick={() => onSave(itemDef.key, { done: true, comments }, dateLogged)}>Save</button>
          </>
    }>
      {locked && !readOnlyView && <PatternCallout icon={Repeat}>This entry locked 24 hours after it was first saved — you're editing directly as General Manager.</PatternCallout>}
      {readOnlyView && <PatternCallout icon={Repeat}>This entry is locked. Request a correction if something needs fixing — the original stays on record either way.</PatternCallout>}
      <label>Date<input type="date" value={dateLogged} disabled={!editable} onChange={(e) => setDateLogged(e.target.value)} /></label>
      <label>Comments<textarea rows={4} value={comments} disabled={!editable} onChange={(e) => setComments(e.target.value)} maxLength={400} /></label>
      {record && <HistoryList history={record.history} />}
    </FormPage>
  );
}

/* ---------------------------------------------------------
   WINDOW RESTRICTION CHECKS — one record per (checkpoint, month), found
   not created, same golden rule as Fire Log. Tick OK to mark every window
   at that checkpoint checked in one action; Not OK opens a note and
   automatically raises a maintenance issue — something's wrong, it needs
   fixing, not just a note nobody sees again.
--------------------------------------------------------- */
