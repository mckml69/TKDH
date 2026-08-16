import React, { useState, useMemo, useContext } from "react";
import { Plus, X, Pencil, Archive, ArchiveRestore, MapPin, Package, ArrowLeft, CheckCircle2, AlertCircle, Blinds } from "lucide-react";
import { RoleContext } from "../../lib/constants";
import { uid, tagBlob, attachmentBlob, dateSearchBlob, checkpointCheckPeriodLabel, isCheckpointCheckLocked } from "../../lib/helpers";
import { ErrorBanner, FormPage, HistoryList, CategoryTag } from "../shared/UI";
import { AttachmentsField } from "../shared/AttachmentsField";

export function validateCheckpoint(form) {
  const errors = [];
  if (!form.name.trim()) errors.push("Checkpoint name is required.");
  return errors;
}
export function CheckpointFormPage({ checkpoint, onSave, onClose }) {
  const [form, setForm] = useState(checkpoint || { id: uid(), name: "", notes: "", attachments: [], tags: [] });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = (logAnother) => {
    const errs = validateCheckpoint(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags }, logAnother);
  };
  const isNew = !checkpoint;
  return (
    <>
      <FormPage title={checkpoint ? "Edit checkpoint" : "New checkpoint"} onClose={onClose} footer={
        isNew
          ? <><button type="button" className="btn btn-ghost" onClick={() => handleSubmit(true)}>Save &amp; add another</button><button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Add checkpoint</button></>
          : <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Save changes</button>
      }>
        <ErrorBanner errors={errors} />
        <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Room 204, Corridor 3F, Reception, Bar" /></label>
        <label>Tags <span className="muted">(comma-separated)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. ground-floor" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
      </FormPage>
    </>
  );
}
export function checkpointHaystack(cp) {
  const dates = [cp.createdAt, cp.updatedAt];
  return [cp.name, cp.notes, tagBlob(cp.tags), attachmentBlob(cp.attachments), dateSearchBlob(dates)].filter(Boolean).join(" ").toLowerCase();
}
export function CheckpointsList({ checkpoints, assets, onOpen, onAdd, onEdit, onDelete, onRestore }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => checkpoints.filter((c) => c.archived).length, [checkpoints]);
  const filtered = useMemo(() => checkpoints.filter((c) => (showArchived ? c.archived : !c.archived) && (!query || checkpointHaystack(c).includes(query.toLowerCase()))), [checkpoints, query, showArchived]);
  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><MapPin size={22} color="#16263D" /><h2>Checkpoints</h2></div>
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New checkpoint</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Physical locations used by checks like Window Restriction — deliberately separate from the Room register,
        since not every checkpoint is a guest room (corridors, reception, the bar, communal areas).
      </p>
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search checkpoints…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived checkpoints." : "No checkpoints yet — add one for every location that needs a Window Restriction check: rooms, corridors, reception, the bar, communal bathrooms."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Name</span><span>Window assets</span><span></span><span></span><span></span><span></span></div>
          {filtered.map((cp) => {
            const count = assets.filter((a) => a.checkpointId === cp.id && !a.archived).length;
            return (
              <div className="ledger-row ledger-row--asset" key={cp.id}>
                <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(cp.id)}>{cp.name}{cp.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
                <span className="muted">{count} asset{count === 1 ? "" : "s"}</span>
                <span></span><span></span>
                <span></span>
                <span className="row-actions">
                  {!cp.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(cp)}><Pencil size={15} /></button>}
                  {canDelete && (cp.archived
                    ? <button className="icon-btn" onClick={() => onRestore(cp.id)}><ArchiveRestore size={15} /></button>
                    : <button className="icon-btn" onClick={() => onDelete(cp.id)}><Archive size={15} /></button>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export function CheckpointDetail({ checkpoint, assets, records, onBack, onEdit, onOpenAsset, onOpenCheck }) {
  const { canEdit } = useContext(RoleContext);
  const linkedAssets = assets.filter((a) => a.checkpointId === checkpoint.id);
  const checks = useMemo(
    () => records.filter((r) => r.category === "window_restriction_check" && r.checkpointId === checkpoint.id && !r.archived).sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || "")),
    [records, checkpoint.id]
  );
  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to checkpoints</button>
      <div className="module-header">
        <div className="module-title"><MapPin size={22} color="#16263D" /><h2>{checkpoint.name}{checkpoint.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        {!checkpoint.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(checkpoint)}><Pencil size={15} /> Edit checkpoint</button>}
      </div>
      {checkpoint.notes && <p className="muted" style={{ marginBottom: 10 }}>{checkpoint.notes}</p>}
      <div className="feed-section">
        <div className="feed-section-head"><h3><Package size={16} color="#8A6D1F" /> Window assets here <span className="feed-count">{linkedAssets.length}</span></h3></div>
        {linkedAssets.length === 0 ? <p className="empty-state">No window assets linked to this checkpoint yet.</p> : (
          <div className="ledger-table">
            {linkedAssets.map((a) => (
              <div key={a.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenAsset(a.id)}>
                <span><CategoryTag category={a.category} /></span>
                <span className="mono-strong">{a.assetCode}</span>
                <span className="muted">{a.name || "—"}</span>
                <span className="muted">{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="feed-section">
        <div className="feed-section-head"><h3><Blinds size={16} color="#3A6B5C" /> Window Restriction check history <span className="feed-count">{checks.length}</span></h3></div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>One check per month covers every window at this checkpoint together — that's why history lives here, not on an individual window asset.</p>
        {checks.length === 0 ? <p className="empty-state">No checks logged for this checkpoint yet.</p> : (
          <div className="ledger-table">
            {checks.map((r) => {
              const locked = isCheckpointCheckLocked(r);
              return (
                <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenCheck(checkpoint, r.periodKey, r)}>
                  <span className="mono-strong">
                    {r.status === "ok" && <CheckCircle2 size={14} color="#2F6B4C" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    {r.status === "not_ok" && <AlertCircle size={14} color="#A8402F" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    {checkpointCheckPeriodLabel(r.periodKey)}
                  </span>
                  <span className="muted">{r.status === "ok" ? "OK" : "Not OK"}</span>
                  <span className="muted">{locked ? "Locked" : "Open"}</span>
                  <span className="muted">{r.note ? r.note.slice(0, 50) : "—"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <HistoryList history={checkpoint.history} />
    </div>
  );
}
