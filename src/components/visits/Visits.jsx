import React, { useState, useMemo, useContext } from "react";
import {
  Search,
  Plus,
  Pencil,
  Paperclip,
  ArrowLeft,
  Share2,
  Archive,
  ArchiveRestore,
  Landmark,
} from "lucide-react";
import { AttachmentsField } from "../shared/AttachmentsField";
import { ErrorBanner, FormPage, HistoryList, SaveStatusBanner, Stamp } from "../shared/UI";
import { RoleContext, SERIOUS_OUTCOMES, VISIT_OUTCOMES, VISIT_TYPES } from "../../lib/constants";
import { fmtDate, formatBytes, todayStr, uid, validateVisit, visitHaystack, visitStatus } from "../../lib/helpers";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function VisitFormPage({ visit, onSave, onClose }) {
  const [form, setForm] = useState(visit || { id: uid(), visitType: VISIT_TYPES[0], visitDate: todayStr(), officerName: "", authority: "", outcome: VISIT_OUTCOMES[0], findings: "", actionsRequired: "", followUpDate: "", status: "Open", notes: "", attachments: [], tags: [] });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = () => {
    const errs = validateVisit(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags });
  };
  const isSerious = SERIOUS_OUTCOMES.includes(form.outcome);
  return (
    <>
      <FormPage title={visit ? "Edit visit" : "Log a regulatory visit"} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}>{visit ? "Save changes" : "Log visit"}</button>}>
        <ErrorBanner errors={errors} />
        <div className="row-2">
          <label>Visit type<select value={form.visitType} onChange={(e) => set("visitType", e.target.value)}>{VISIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Date<input type="date" value={form.visitDate} onChange={(e) => set("visitDate", e.target.value)} /></label>
        </div>
        <div className="row-2">
          <label>Officer name<input value={form.officerName} onChange={(e) => set("officerName", e.target.value)} placeholder="e.g. J. Patel" /></label>
          <label>Authority / organisation<input value={form.authority} onChange={(e) => set("authority", e.target.value)} placeholder="e.g. Local Council Environmental Health" /></label>
        </div>
        <label>Outcome<select value={form.outcome} onChange={(e) => set("outcome", e.target.value)}>{VISIT_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></label>
        {isSerious && <div className="form-error-banner" style={{ background: "#FCF6EE", borderColor: "#EEDFC4", color: "#7A5A1D" }}>This outcome carries formal weight — make sure the notice/letter is attached below and actions required are clearly recorded.</div>}
        <label>Findings<textarea rows={3} value={form.findings} onChange={(e) => set("findings", e.target.value)} placeholder="What the officer found or said" /></label>
        <label>Actions required<textarea rows={2} value={form.actionsRequired} onChange={(e) => set("actionsRequired", e.target.value)} placeholder="What needs to be done as a result — leave blank if none" /></label>
        <div className="row-2">
          <label>Follow-up / deadline date <span className="muted">(optional)</span><input type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} /></label>
          <label>Status<select value={form.status} onChange={(e) => set("status", e.target.value)}><option>Open</option><option>Closed</option></select></label>
        </div>
        <label>Tags <span className="muted">(comma-separated)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. annual visit" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
        <p className="muted" style={{ margin: 0 }}>Upload any notice, letter, or report left by the officer above.</p>
      </FormPage>
    </>
  );
}

export function VisitDetail({ visit, onBack, onEdit }) {
  const { canEdit } = useContext(RoleContext);
  const status = visitStatus(visit);
  const isSerious = SERIOUS_OUTCOMES.includes(visit.outcome);
  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to visits</button>
      <div className="module-header">
        <div className="module-title"><Landmark size={22} color="#16263D" /><h2>{visit.visitType}{visit.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        {!visit.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(visit)}><Pencil size={15} /> Edit visit</button>}
      </div>
      {isSerious && <div className="form-error-banner" style={{ background: "#FCF6EE", borderColor: "#EEDFC4", color: "#7A5A1D", marginBottom: 16 }}>This visit resulted in a formal outcome: {visit.outcome}.</div>}
      <div className="asset-info-grid">
        <div><span className="field-label">Date</span><p>{fmtDate(visit.visitDate)}</p></div>
        <div><span className="field-label">Officer</span><p>{visit.officerName || "—"}</p></div>
        <div><span className="field-label">Authority</span><p>{visit.authority || "—"}</p></div>
        <div><span className="field-label">Outcome</span><p>{visit.outcome}</p></div>
        <div><span className="field-label">Status</span><p><Stamp status={status} dense /></p></div>
        <div><span className="field-label">Follow-up due</span><p>{visit.followUpDate ? fmtDate(visit.followUpDate) : "—"}</p></div>
      </div>
      {visit.findings && (<div className="feed-section"><div className="feed-section-head"><h3>Findings</h3></div><p style={{ margin: 0 }}>{visit.findings}</p></div>)}
      {visit.actionsRequired && (<div className="feed-section"><div className="feed-section-head"><h3>Actions required</h3></div><p style={{ margin: 0 }}>{visit.actionsRequired}</p></div>)}
      {visit.notes && <p className="muted" style={{ marginBottom: 10 }}>{visit.notes}</p>}
      {(visit.attachments || []).length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Paperclip size={16} color="#16263D" /> Documents <span className="feed-count">{visit.attachments.length}</span></h3></div>
          <div className="attach-list">
            {visit.attachments.map((a) => (
              <div className="attach-item" key={a.fileId}><Paperclip size={13} /><span className="attach-name">{a.name}</span><span className="muted">{formatBytes(a.size)}</span></div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Open "Edit visit" to download any of these.</p>
        </div>
      )}
      <HistoryList history={visit.history} />
    </div>
  );
}

export function VisitsList({ visits, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => visits.filter((v) => v.archived).length, [visits]);
  const filtered = useMemo(() => visits.filter((v) =>
    (showArchived ? v.archived : !v.archived) && (!query || visitHaystack(v).includes(query.toLowerCase()))
  ).sort((a, b) => (b.visitDate || "").localeCompare(a.visitDate || "")), [visits, query, showArchived]);

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const rows = filtered.map((v) => ({ date: fmtDate(v.visitDate), type: v.visitType, officer: v.officerName || "", outcome: v.outcome, status: visitStatus(v) }));
    const title = "Regulatory Visit Log";
    const columns = [
      { key: "date", label: "Date", width: 0.16 },
      { key: "type", label: "Type", width: 0.18 },
      { key: "officer", label: "Officer", width: 0.22 },
      { key: "outcome", label: "Outcome", width: 0.28 },
      { key: "status", label: "Status", width: 0.16, chip: true },
    ];
    const subtitle = `Saved ${fmtDate(todayStr())} · ${filtered.length} visit${filtered.length === 1 ? "" : "s"}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`regulatory-visits-${todayStr()}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><Landmark size={22} color="#16263D" /><h2>Regulatory visits</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Log a visit</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>Every EHO, Fire Officer, or other regulatory visit — what they found, and what it means for you.</p>
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search visits…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived visits." : "No regulatory visits logged yet."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Date</span><span>Type</span><span>Outcome</span><span>Status</span><span></span><span></span></div>
          {filtered.map((v) => (
            <div className="ledger-row ledger-row--asset" key={v.id}>
              <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(v.id)}>{fmtDate(v.visitDate)}{v.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
              <span className="muted">{v.visitType}</span>
              <span className="muted">{v.outcome}{SERIOUS_OUTCOMES.includes(v.outcome) && <span className="flag-tag">Serious</span>}</span>
              <span><Stamp status={visitStatus(v)} dense /></span>
              <span></span>
              <span className="row-actions">
                {!v.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(v)}><Pencil size={15} /></button>}
                {canDelete && (v.archived
                  ? <button className="icon-btn" onClick={() => onRestore(v.id)}><ArchiveRestore size={15} /></button>
                  : <button className="icon-btn" onClick={() => onDelete(v.id)}><Archive size={15} /></button>)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
