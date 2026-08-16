import React, { useState, useMemo, useContext } from "react";
import {
  Hammer,
  Search,
  Plus,
  Pencil,
  Paperclip,
  Clock,
  ArrowLeft,
  Phone,
  Mail,
  Share2,
  Archive,
  ArchiveRestore,
  Users,
} from "lucide-react";
import { AttachmentsField } from "../shared/AttachmentsField";
import { ErrorBanner, FormPage, HistoryList, SaveStatusBanner, Stamp, Timeline } from "../shared/UI";
import { RoleContext } from "../../lib/constants";
import { escapeHtml, exportReport, fmtDate, formatBytes, getEventDate, getMode, staffHaystack, staffTrainingStatus, statusChipHTML, todayStr, uid, validateStaff } from "../../lib/helpers";

export function StaffFormPage({ member, onSave, onClose }) {
  const [form, setForm] = useState(member || { id: uid(), name: "", role: "", email: "", phone: "", startDate: "", notes: "", attachments: [], tags: [] });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = () => {
    const errs = validateStaff(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags });
  };
  return (
    <>
      <FormPage title={member ? "Edit staff member" : "New staff member"} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}>{member ? "Save changes" : "Add staff member"}</button>}>
        <ErrorBanner errors={errors} />
        <label>Full name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Jane Smith" /></label>
        <div className="row-2">
          <label>Role / position<input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Housekeeping" /></label>
          <label>Start date <span className="muted">(optional)</span><input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        </div>
        <div className="row-2">
          <label>Phone<input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
        </div>
        <label>Tags <span className="muted">(comma-separated)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. first aider, fire marshal" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
        <p className="muted" style={{ margin: 0 }}>Upload ID, contracts, or right-to-work documents above — they'll be attached directly to this staff record.</p>
      </FormPage>
    </>
  );
}

/* ---------------------------------------------------------
   CERTIFICATE FORM PAGE
--------------------------------------------------------- */

export function StaffDetail({ member, records, assets, onBack, onEdit, onViewRecord, onEditRecord, onResolve }) {
  const { canEdit, canViewSensitive } = useContext(RoleContext);
  const linked = useMemo(() => records.filter((r) => r.staffId === member.id), [records, member.id]);
  const trainings = useMemo(() => linked.filter((r) => getMode(r) === "expiry").sort((a, b) => (getEventDate(b) || "").localeCompare(getEventDate(a) || "")), [linked]);
  const workRecords = useMemo(() => linked.filter((r) => getMode(r) !== "expiry").sort((a, b) => (getEventDate(b) || "").localeCompare(getEventDate(a) || "")), [linked]);
  const status = staffTrainingStatus(member, records);

  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to staff</button>
      <div className="module-header">
        <div className="module-title"><Users size={22} color="#16263D" /><h2>{member.name}{member.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        {!member.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(member)}><Pencil size={15} /> Edit staff member</button>}
      </div>
      <div className="asset-info-grid">
        <div><span className="field-label">Role</span><p>{member.role || "—"}</p></div>
        <div><span className="field-label">Phone</span><p>{member.phone ? <><Phone size={12} style={{ verticalAlign: -1 }} /> {member.phone}</> : "—"}</p></div>
        <div><span className="field-label">Email</span><p>{member.email ? <><Mail size={12} style={{ verticalAlign: -1 }} /> {member.email}</> : "—"}</p></div>
        <div><span className="field-label">Training status</span><p><Stamp status={status} dense /></p></div>
        <div><span className="field-label">Start date</span><p>{member.startDate ? fmtDate(member.startDate) : "—"}</p></div>
      </div>
      {member.notes && <p className="muted" style={{ marginBottom: 10 }}>{member.notes}</p>}
      {(member.attachments || []).length > 0 && canViewSensitive && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Paperclip size={16} color="#16263D" /> Documents <span className="feed-count">{member.attachments.length}</span></h3></div>
          <div className="attach-list">
            {member.attachments.map((a) => (
              <div className="attach-item" key={a.fileId}><Paperclip size={13} /><span className="attach-name">{a.name}</span><span className="muted">{formatBytes(a.size)}</span></div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>Open "Edit staff member" to download any of these.</p>
        </div>
      )}
      {workRecords.length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Hammer size={16} color="#8A6D1F" /> Work carried out <span className="feed-count">{workRecords.length}</span></h3></div>
          <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>Built automatically from every check, clean, or repair logged as completed by this person.</p>
          <Timeline records={workRecords} assets={assets} onEdit={onViewRecord} />
        </div>
      )}
      <div className="feed-section">
        <div className="feed-section-head"><h3><Clock size={16} color="#16263D" /> Training history <span className="feed-count">{trainings.length}</span></h3></div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>Built automatically from every training record linked to this person.</p>
        <Timeline records={trainings} assets={[]} onEdit={onViewRecord} />
      </div>
      <HistoryList history={member.history} />
    </div>
  );
}

export function StaffList({ staff, records, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => staff.filter((s) => s.archived).length, [staff]);
  const filtered = useMemo(() => staff.filter((s) => (showArchived ? s.archived : !s.archived) && (!query || staffHaystack(s).includes(query.toLowerCase()))), [staff, query, showArchived]);

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const rows = filtered.map((s) => {
      const trainings = records.filter((r) => r.staffId === s.id).length;
      return `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.role || "")}</td><td>${escapeHtml(s.phone || s.email || "")}</td><td>${trainings}</td><td>${statusChipHTML(staffTrainingStatus(s, records))}</td></tr>`;
    }).join("");
    const body = filtered.length === 0 ? '<p class="muted">None.</p>' : `<table><thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Records</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
    const result = await exportReport(`staff-register-${todayStr()}.html`, "Staff Register", `Saved ${fmtDate(todayStr())} · ${filtered.length} staff member${filtered.length === 1 ? "" : "s"}`, body, branding);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><Users size={22} color="#16263D" /><h2>Staff</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New staff member</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search staff…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived staff." : "No staff registered yet. Add the people whose training you need to track."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Name</span><span>Role</span><span>Records</span><span>Status</span><span></span><span></span></div>
          {filtered.map((s) => {
            const trainings = records.filter((r) => r.staffId === s.id).length;
            return (
              <div className="ledger-row ledger-row--asset" key={s.id}>
                <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(s.id)}>{s.name}{s.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
                <span className="muted">{s.role || "—"}</span>
                <span className="muted">{trainings}</span>
                <span><Stamp status={staffTrainingStatus(s, records)} dense /></span>
                <span></span>
                <span className="row-actions">
                  {!s.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(s)}><Pencil size={15} /></button>}
                  {canDelete && (s.archived
                    ? <button className="icon-btn" onClick={() => onRestore(s.id)}><ArchiveRestore size={15} /></button>
                    : <button className="icon-btn" onClick={() => onDelete(s.id)}><Archive size={15} /></button>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
