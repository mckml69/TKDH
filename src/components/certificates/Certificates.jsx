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
  Award,
} from "lucide-react";
import { AttachmentsField } from "../shared/AttachmentsField";
import { ErrorBanner, FormPage, HistoryList, SaveStatusBanner, Stamp } from "../shared/UI";
import { ASSET_TYPES, CERT_TYPES, RoleContext } from "../../lib/constants";
import { addDays, certificateHaystack, certificateStatus, fmtDate, formatBytes, todayStr, uid, validateCertificate } from "../../lib/helpers";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function CertificateFormPage({ cert, assets, contractors, prefill, onSave, onClose }) {
  const [form, setForm] = useState(cert || { id: uid(), title: "", certType: CERT_TYPES[0], issuer: "", contractorId: null, assetId: null, coverage: "", issueDate: todayStr(), expiryDate: addDays(todayStr(), 365), notes: "", attachments: [], tags: [], ...(prefill || {}) });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = () => {
    const errs = validateCertificate(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags });
  };
  return (
    <>
      <FormPage title={cert ? "Edit certificate" : "New certificate"} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}>{cert ? "Save changes" : "Add certificate"}</button>}>
        <ErrorBanner errors={errors} />
        <label>Title<input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Gas Safety Certificate 2026" /></label>
        <label>Type
          <select value={form.certType} onChange={(e) => set("certType", e.target.value)}>{CERT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <div className="row-2">
          <label>Issued on<input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} /></label>
          <label>Expires on<input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></label>
        </div>
        <label>Issued by <span className="muted">(optional — contractor register)</span>
          <select value={form.contractorId || ""} onChange={(e) => {
            const id = e.target.value || null;
            set("contractorId", id);
            if (id) { const c = contractors.find((x) => x.id === id); if (c && !form.issuer) set("issuer", c.name); }
          }}>
            <option value="">Not linked — type below</option>
            {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Issuer name <span className="muted">(free text, if not in contractor register)</span><input value={form.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="e.g. Acme Gas Services" /></label>
        <div className="row-2">
          <label>Covers asset <span className="muted">(optional)</span>
            <select value={form.assetId || ""} onChange={(e) => set("assetId", e.target.value || null)}>
              <option value="">Not linked to a specific asset</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode} — {a.name || ASSET_TYPES.find((t) => t.key === a.assetType)?.label}</option>)}
            </select>
          </label>
          <label>Coverage <span className="muted">(free text)</span><input value={form.coverage} onChange={(e) => set("coverage", e.target.value)} placeholder="e.g. Whole building" /></label>
        </div>
        <label>Tags <span className="muted">(comma-separated)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. annual, statutory" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
        <p className="muted" style={{ margin: 0 }}>Upload the certificate PDF or scan above.</p>
      </FormPage>
    </>
  );
}

export function CertificateDetail({ cert, assets, contractors, onBack, onEdit, onOpenAsset, onOpenContractor }) {
  const { canEdit } = useContext(RoleContext);
  const status = certificateStatus(cert);
  const asset = cert.assetId ? assets.find((a) => a.id === cert.assetId) : null;
  const contractor = cert.contractorId ? contractors.find((c) => c.id === cert.contractorId) : null;

  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to certificates</button>
      <div className="module-header">
        <div className="module-title"><Award size={22} color="#16263D" /><h2>{cert.title}{cert.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        {!cert.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(cert)}><Pencil size={15} /> Edit certificate</button>}
      </div>
      <div className="asset-info-grid">
        <div><span className="field-label">Type</span><p>{cert.certType}</p></div>
        <div><span className="field-label">Status</span><p><Stamp status={status} dense /></p></div>
        <div><span className="field-label">Issued</span><p>{cert.issueDate ? fmtDate(cert.issueDate) : "—"}</p></div>
        <div><span className="field-label">Expires</span><p>{cert.expiryDate ? fmtDate(cert.expiryDate) : "—"}</p></div>
        <div><span className="field-label">Issuer</span><p>{contractor ? <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenContractor(contractor.id)}>{contractor.name}</span> : (cert.issuer || "—")}</p></div>
        <div><span className="field-label">Covers</span><p>{asset ? <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenAsset(asset.id)}>{asset.assetCode}</span> : (cert.coverage || "—")}</p></div>
      </div>
      {cert.notes && <p className="muted" style={{ marginBottom: 10 }}>{cert.notes}</p>}
      {(cert.attachments || []).length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Paperclip size={16} color="#16263D" /> Documents <span className="feed-count">{cert.attachments.length}</span></h3></div>
          <div className="attach-list">
            {cert.attachments.map((a) => (
              <div className="attach-item" key={a.fileId}><Paperclip size={13} /><span className="attach-name">{a.name}</span><span className="muted">{formatBytes(a.size)}</span></div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Open "Edit certificate" to download any of these.</p>
        </div>
      )}
      <HistoryList history={cert.history} />
    </div>
  );
}

export function CertificatesList({ certificates, assets, contractors, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => certificates.filter((c) => c.archived).length, [certificates]);
  const filtered = useMemo(() => certificates.filter((c) =>
    (showArchived ? c.archived : !c.archived) && (typeFilter === "all" || c.certType === typeFilter) && (!query || certificateHaystack(c).includes(query.toLowerCase()))
  ).sort((a, b) => (a.expiryDate || "").localeCompare(b.expiryDate || "")), [certificates, query, typeFilter, showArchived]);

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const rows = filtered.map((c) => ({ title: c.title, type: c.certType, issuer: c.issuer || "", expires: fmtDate(c.expiryDate), status: certificateStatus(c) }));
    const title = "Certificate Register";
    const columns = [
      { key: "title", label: "Title", width: 0.28 },
      { key: "type", label: "Type", width: 0.22 },
      { key: "issuer", label: "Issuer", width: 0.2 },
      { key: "expires", label: "Expires", width: 0.14 },
      { key: "status", label: "Status", width: 0.16, chip: true },
    ];
    const subtitle = `Saved ${fmtDate(todayStr())} · ${filtered.length} certificate${filtered.length === 1 ? "" : "s"}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`certificate-register-${todayStr()}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><Award size={22} color="#16263D" /><h2>Certificates</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New certificate</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search certificates…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="search-inline" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {CERT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived certificates." : "No certificates registered yet. Add your gas safety, EICR, or insurance certificates to track them here."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Title</span><span>Type</span><span>Expires</span><span>Status</span><span></span><span></span></div>
          {filtered.map((c) => (
            <div className="ledger-row ledger-row--asset" key={c.id}>
              <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(c.id)}>{c.title}{c.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
              <span className="muted">{c.certType}</span>
              <span className="mono">{fmtDate(c.expiryDate)}</span>
              <span><Stamp status={certificateStatus(c)} dense /></span>
              <span></span>
              <span className="row-actions">
                {!c.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(c)}><Pencil size={15} /></button>}
                {canDelete && (c.archived
                  ? <button className="icon-btn" onClick={() => onRestore(c.id)}><ArchiveRestore size={15} /></button>
                  : <button className="icon-btn" onClick={() => onDelete(c.id)}><Archive size={15} /></button>)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
