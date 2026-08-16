import React, { useState, useMemo, useContext } from "react";
import {
  Search,
  Plus,
  Pencil,
  Paperclip,
  Clock,
  Package,
  ArrowLeft,
  HardHat,
  Phone,
  Mail,
  Share2,
  Archive,
  ArchiveRestore,
  Award,
} from "lucide-react";
import { AttachmentsField } from "../shared/AttachmentsField";
import { CategoryTag, ErrorBanner, FormPage, HistoryList, SaveStatusBanner, Stamp, Timeline } from "../shared/UI";
import { ASSET_TYPES, RoleContext } from "../../lib/constants";
import { assetComplianceStatus, certificateStatus, contractorHaystack, escapeHtml, exportReport, fmtDate, formatBytes, getEventDate, insuranceStatus, statusChipHTML, todayStr, uid, validateContractor } from "../../lib/helpers";

export function ContractorFormPage({ contractor, onSave, onClose }) {
  const [form, setForm] = useState(contractor || { id: uid(), name: "", contactName: "", phone: "", email: "", insuranceExpiry: "", notes: "", attachments: [], tags: [] });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = () => {
    const errs = validateContractor(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags });
  };
  return (
    <>
      <FormPage title={contractor ? "Edit contractor / supplier" : "New contractor / supplier"} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}>{contractor ? "Save changes" : "Add contractor / supplier"}</button>}>
        <ErrorBanner errors={errors} />
        <label>Company / contractor / supplier name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Fire Ltd" /></label>
        <div className="row-2">
          <label>Contact person<input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
          <label>Insurance expiry <span className="muted">(optional)</span><input type="date" value={form.insuranceExpiry} onChange={(e) => set("insuranceExpiry", e.target.value)} /></label>
        </div>
        <div className="row-2">
          <label>Phone<input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
        </div>
        <label>Tags <span className="muted">(comma-separated — trades, specialties)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. fire alarms, gas safe" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
        <p className="muted" style={{ margin: 0 }}>Upload insurance certificates and qualification documents above — they'll be attached directly to this contractor's record.</p>
      </FormPage>
    </>
  );
}

export function ContractorDetail({ contractor, records, assets, certificates, onBack, onEdit, onViewRecord, onEditRecord, onDeleteRecord, onRestoreRecord, onResolve, onOpenAsset, onOpenCertificate }) {
  const { canEdit, canViewSensitive } = useContext(RoleContext);
  const visits = useMemo(() => records.filter((r) => r.contractorId === contractor.id).sort((a, b) => (getEventDate(b) || "").localeCompare(getEventDate(a) || "")), [records, contractor.id]);
  const servicedAssetIds = [...new Set(visits.map((r) => r.assetId).filter(Boolean))];
  const servicedAssets = assets.filter((a) => servicedAssetIds.includes(a.id));
  const issuedCerts = useMemo(() => certificates.filter((c) => c.contractorId === contractor.id && !c.archived), [certificates, contractor.id]);
  const iStatus = insuranceStatus(contractor);

  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to contractors &amp; suppliers</button>
      <div className="module-header">
        <div className="module-title"><HardHat size={22} color="#16263D" /><h2>{contractor.name}{contractor.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        {!contractor.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(contractor)}><Pencil size={15} /> Edit contractor</button>}
      </div>
      <div className="asset-info-grid">
        <div><span className="field-label">Contact</span><p>{contractor.contactName || "—"}</p></div>
        <div><span className="field-label">Phone</span><p>{contractor.phone ? <><Phone size={12} style={{ verticalAlign: -1 }} /> {contractor.phone}</> : "—"}</p></div>
        <div><span className="field-label">Email</span><p>{contractor.email ? <><Mail size={12} style={{ verticalAlign: -1 }} /> {contractor.email}</> : "—"}</p></div>
        <div><span className="field-label">Insurance expiry</span><p><Stamp status={iStatus} dense /> {contractor.insuranceExpiry ? fmtDate(contractor.insuranceExpiry) : "Not on file"}</p></div>
      </div>
      {contractor.notes && <p className="muted" style={{ marginBottom: 10 }}>{contractor.notes}</p>}
      {(contractor.attachments || []).length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Paperclip size={16} color="#16263D" /> Certificates & documents <span className="feed-count">{contractor.attachments.length}</span></h3></div>
          <div className="attach-list">
            {contractor.attachments.map((a) => (
              <div className="attach-item" key={a.fileId}><Paperclip size={13} /><span className="attach-name">{a.name}</span><span className="muted">{formatBytes(a.size)}</span></div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Open "Edit contractor" to download any of these.</p>
        </div>
      )}
      {issuedCerts.length > 0 && canViewSensitive && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Award size={16} color="#B8862B" /> Certificates issued <span className="feed-count">{issuedCerts.length}</span></h3></div>
          <div className="ledger-table">
            {issuedCerts.map((c) => (
              <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenCertificate(c.id)}>
                <span className="mono-strong">{c.title}</span>
                <span className="muted">{c.certType}</span>
                <span className="muted">{c.coverage || "—"}</span>
                <span className="mono">{fmtDate(c.expiryDate)}</span>
                <span><Stamp status={certificateStatus(c)} dense /></span>
              </div>
            ))}
          </div>
        </div>
      )}
      {servicedAssets.length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Package size={16} color="#8A6D1F" /> Assets serviced <span className="feed-count">{servicedAssets.length}</span></h3></div>
          <div className="ledger-table">
            {servicedAssets.map((a) => (
              <div key={a.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenAsset(a.id)}>
                <span><CategoryTag category={a.category} /></span>
                <span className="mono-strong">{a.assetCode}</span>
                <span className="muted">{a.name || ASSET_TYPES.find((t) => t.key === a.assetType)?.label}</span>
                <span className="muted">{visits.filter((v) => v.assetId === a.id).length} visit{visits.filter((v) => v.assetId === a.id).length === 1 ? "" : "s"}</span>
                <span><Stamp status={assetComplianceStatus(a, records)} dense /></span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="feed-section">
        <div className="feed-section-head"><h3><Clock size={16} color="#16263D" /> Visit history <span className="feed-count">{visits.length}</span></h3></div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>Built automatically from every record linked to this contractor — work completed, dates, and any invoice or certificate attached to that visit.</p>
        <Timeline records={visits} assets={assets} onEdit={onViewRecord} />
      </div>
      <HistoryList history={contractor.history} />
    </div>
  );
}

export function ContractorsList({ contractors, records, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => contractors.filter((c) => c.archived).length, [contractors]);
  const filtered = useMemo(() => contractors.filter((c) => (showArchived ? c.archived : !c.archived) && (!query || contractorHaystack(c).includes(query.toLowerCase()))), [contractors, query, showArchived]);

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const rows = filtered.map((c) => {
      const visits = records.filter((r) => r.contractorId === c.id).length;
      return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.contactName || "")}</td><td>${escapeHtml(c.phone || "")}</td><td>${escapeHtml(c.email || "")}</td><td>${visits}</td><td>${statusChipHTML(insuranceStatus(c))}</td></tr>`;
    }).join("");
    const body = filtered.length === 0 ? '<p class="muted">None.</p>' : `<table><thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Visits</th><th>Insurance</th></tr></thead><tbody>${rows}</tbody></table>`;
    const result = await exportReport(`contractor-register-${todayStr()}.html`, "Contractor Register", `Saved ${fmtDate(todayStr())} · ${filtered.length} contractor${filtered.length === 1 ? "" : "s"}`, body, branding);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><HardHat size={22} color="#16263D" /><h2>Contractors &amp; Suppliers</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New contractor / supplier</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search contractors & suppliers…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived entries." : "No contractors or suppliers registered yet — anyone who services your building or supplies your hotel, from the fire alarm engineer to your linen supplier."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Name</span><span>Contact</span><span>Visits</span><span>Insurance</span><span></span><span></span></div>
          {filtered.map((c) => {
            const visits = records.filter((r) => r.contractorId === c.id).length;
            return (
              <div className="ledger-row ledger-row--asset" key={c.id}>
                <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(c.id)}>{c.name}{c.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
                <span className="muted">{c.contactName || c.phone || c.email || "—"}</span>
                <span className="muted">{visits}</span>
                <span><Stamp status={insuranceStatus(c)} dense /></span>
                <span></span>
                <span className="row-actions">
                  {!c.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(c)}><Pencil size={15} /></button>}
                  {canDelete && (c.archived
                    ? <button className="icon-btn" onClick={() => onRestore(c.id)}><ArchiveRestore size={15} /></button>
                    : <button className="icon-btn" onClick={() => onDelete(c.id)}><Archive size={15} /></button>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
