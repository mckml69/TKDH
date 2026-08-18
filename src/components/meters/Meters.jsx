import React, { useState, useMemo, useContext } from "react";
import { Gauge, Plus, Pencil, Trash2, ArrowLeft, Archive, ArchiveRestore, Share2, Paperclip } from "lucide-react";
import { RoleContext, METER_TYPES } from "../../lib/constants";
import { uid, todayStr, fmtDate, formatBytes, tagBlob, attachmentBlob, dateSearchBlob } from "../../lib/helpers";
import { ErrorBanner, FormPage, HistoryList, SaveStatusBanner } from "../shared/UI";
import { AttachmentsField } from "../shared/AttachmentsField";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function validateMeter(form) {
  const errors = [];
  if (!form.name.trim()) errors.push("Meter name is required.");
  if (!form.meterType) errors.push("Meter type is required.");
  return errors;
}
export function meterHaystack(m) {
  const type = METER_TYPES.find((t) => t.key === m.meterType)?.label;
  const dates = [m.createdAt, m.updatedAt];
  return [m.name, type, m.serialNumber, m.notes, tagBlob(m.tags), attachmentBlob(m.attachments), dateSearchBlob(dates)].filter(Boolean).join(" ").toLowerCase();
}

export function MeterFormPage({ meter, onSave, onClose }) {
  const [form, setForm] = useState(meter || { id: uid(), name: "", meterType: METER_TYPES[0].key, serialNumber: "", notes: "", attachments: [], tags: [] });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = (logAnother) => {
    const errs = validateMeter(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags }, logAnother);
  };
  const isNew = !meter;
  return (
    <FormPage title={meter ? "Edit meter" : "New meter"} onClose={onClose} footer={
      isNew
        ? <><button type="button" className="btn btn-ghost" onClick={() => handleSubmit(true)}>Save &amp; add another</button><button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Add meter</button></>
        : <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Save changes</button>
    }>
      <ErrorBanner errors={errors} />
      <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Main water meter, Kitchen gas meter" /></label>
      <div className="row-2">
        <label>Type<select value={form.meterType} onChange={(e) => set("meterType", e.target.value)}>{METER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
        <label>Serial number <span className="muted">(optional)</span><input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} /></label>
      </div>
      <label>Tags <span className="muted">(comma-separated)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. basement, main-supply" /></label>
      <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional — location, access notes, anything useful" /></label>
      <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
    </FormPage>
  );
}

export function validateMeterReading(form) {
  const errors = [];
  if (!form.date) errors.push("Reading date is required.");
  if (form.value === "" || form.value === null || form.value === undefined || isNaN(Number(form.value))) errors.push("Enter a numeric reading.");
  return errors;
}
export function MeterReadingFormPage({ meter, reading, onSave, onClose }) {
  const [form, setForm] = useState(reading ? { ...reading } : { id: null, date: todayStr(), value: "", notes: "" });
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const type = METER_TYPES.find((t) => t.key === meter.meterType);
  const handleSubmit = () => {
    const errs = validateMeterReading(form);
    if (errs.length) { setErrors(errs); return; }
    onSave({ ...form, value: Number(form.value) });
  };
  return (
    <FormPage title={reading ? `Edit reading — ${meter.name}` : `Log a reading — ${meter.name}`} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}>{reading ? "Save changes" : "Log reading"}</button>}>
      <ErrorBanner errors={errors} />
      <div className="row-2">
        <label>Date<input type="date" max={todayStr()} value={form.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label>Reading {type?.unit ? `(${type.unit})` : ""}<input type="number" step="any" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="e.g. 4821" /></label>
      </div>
      <label>Notes <span className="muted">(optional)</span><input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. estimated, meter hard to access" /></label>
    </FormPage>
  );
}

export function MeterDetail({ meter, onBack, onEdit, onLogReading, onEditReading, onDeleteReading }) {
  const { canEdit, canDelete } = useContext(RoleContext);
  const type = METER_TYPES.find((t) => t.key === meter.meterType);
  const readings = useMemo(() => [...(meter.readings || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")), [meter.readings]);
  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to meters</button>
      <div className="module-header">
        <div className="module-title"><Gauge size={22} color="#197386" /><h2>{meter.name}{meter.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          {!meter.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(meter)}><Pencil size={15} /> Edit meter</button>}
          {!meter.archived && canEdit && <button className="btn btn-primary" onClick={() => onLogReading(meter)}><Plus size={16} /> Log a reading</button>}
        </div>
      </div>
      <div className="asset-info-grid">
        <div><span className="field-label">Type</span><p>{type?.label}</p></div>
        <div><span className="field-label">Serial number</span><p>{meter.serialNumber || "—"}</p></div>
        <div><span className="field-label">Latest reading</span><p>{readings[0] ? `${readings[0].value}${type?.unit ? ` ${type.unit}` : ""} — ${fmtDate(readings[0].date)}` : "—"}</p></div>
      </div>
      {meter.notes && <p className="muted" style={{ marginBottom: 10 }}>{meter.notes}</p>}
      {(meter.attachments || []).length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Paperclip size={16} color="#197386" /> Attachments <span className="feed-count">{meter.attachments.length}</span></h3></div>
          <div className="attach-list">
            {meter.attachments.map((a) => (
              <div className="attach-item" key={a.fileId}><Paperclip size={13} /><span className="attach-name">{a.name}</span><span className="muted">{formatBytes(a.size)}</span></div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Open "Edit meter" to download any of these.</p>
        </div>
      )}
      <div className="feed-section">
        <div className="feed-section-head"><h3><Gauge size={16} color="#197386" /> Readings <span className="feed-count">{readings.length}</span></h3></div>
        {readings.length === 0 ? <p className="empty-state">No readings logged yet.</p> : (
          <div className="ledger-table">
            {readings.map((r) => (
              <div key={r.id} className="ledger-row ledger-row--flat">
                <span className="mono-strong">{fmtDate(r.date)}</span>
                <span className="mono">{r.value}{type?.unit ? ` ${type.unit}` : ""}</span>
                <span className="muted">{r.notes || "—"}</span>
                <span className="muted">{r.loggedBy || "—"}</span>
                {canEdit && (
                  <span className="row-actions">
                    <button className="icon-btn" onClick={() => onEditReading(meter, r)}><Pencil size={15} /></button>
                    {canDelete && <button className="icon-btn" onClick={() => onDeleteReading(meter.id, r.id)}><Trash2 size={15} /></button>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <HistoryList history={meter.history} />
    </div>
  );
}

export function MetersList({ meters, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => meters.filter((m) => m.archived).length, [meters]);
  const filtered = useMemo(() => meters.filter((m) => (showArchived ? m.archived : !m.archived) && (!query || meterHaystack(m).includes(query.toLowerCase()))), [meters, query, showArchived]);

  const [saveStatus, setSaveStatus] = useState(null);
  const handleExport = async () => {
    const active = meters.filter((m) => !m.archived);
    const sections = [];
    for (const m of active) {
      const type = METER_TYPES.find((t) => t.key === m.meterType);
      const readings = [...(m.readings || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      sections.push({ type: "heading", text: `${m.name} — ${type?.label || m.meterType}${m.serialNumber ? ` — Serial: ${m.serialNumber}` : ""}` });
      if (readings.length === 0) {
        sections.push({ type: "paragraph", text: "No readings logged yet." });
      } else {
        const rows = readings.map((r) => ({ date: fmtDate(r.date), value: `${r.value}${type?.unit ? ` ${type.unit}` : ""}`, notes: r.notes || "", by: r.loggedBy || "" }));
        sections.push({ type: "table", columns: [
          { key: "date", label: "Date", width: 0.18 },
          { key: "value", label: "Reading", width: 0.22 },
          { key: "notes", label: "Notes", width: 0.38 },
          { key: "by", label: "Logged by", width: 0.22 },
        ], rows });
      }
    }
    const title = "Meter Readings";
    const subtitle = `Saved ${fmtDate(todayStr())} · ${active.length} meter${active.length === 1 ? "" : "s"}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections });
    const result = await exportPdfReport(`meter-readings-${todayStr()}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><Gauge size={22} color="#197386" /><h2>Meters</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleExport}><Share2 size={15} /> Export readings</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New meter</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Water, gas, and electricity meters — a simple place to record readings over time. Not linked to any
        compliance check or due date.
      </p>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search meters…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived meters." : "No meters yet — add your water, gas, or electricity meters to start logging readings."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Name</span><span>Type</span><span>Serial</span><span>Latest reading</span><span></span><span></span></div>
          {filtered.map((m) => {
            const type = METER_TYPES.find((t) => t.key === m.meterType);
            const readings = [...(m.readings || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
            const latest = readings[0];
            return (
              <div className="ledger-row ledger-row--asset" key={m.id}>
                <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(m.id)}>{m.name}{m.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
                <span className="muted">{type?.label}</span>
                <span className="muted">{m.serialNumber || "—"}</span>
                <span className="muted">{latest ? `${latest.value}${type?.unit ? ` ${type.unit}` : ""} — ${fmtDate(latest.date)}` : "No readings yet"}</span>
                <span></span>
                <span className="row-actions">
                  {!m.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(m)}><Pencil size={15} /></button>}
                  {canDelete && (m.archived
                    ? <button className="icon-btn" onClick={() => onRestore(m.id)}><ArchiveRestore size={15} /></button>
                    : <button className="icon-btn" onClick={() => onDelete(m.id)}><Archive size={15} /></button>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
