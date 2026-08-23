import React, { useState, useMemo, useContext } from "react";
import { Plus, X, Pencil, Archive, ArchiveRestore, MapPin, Package, ArrowLeft, CheckCircle2, AlertCircle, Blinds, Droplet, Thermometer, PackagePlus } from "lucide-react";
import { RoleContext, ASSET_TYPES } from "../../lib/constants";
import {
  uid, tagBlob, attachmentBlob, dateSearchBlob, checkpointCheckPeriodLabel, isCheckpointCheckLocked,
  legionellaCheckPeriodLabel, isLegionellaCheckLocked, legionellaCheckEligibleItems,
} from "../../lib/helpers";
import { ErrorBanner, FormPage, HistoryList, CategoryTag } from "../shared/UI";
import { AttachmentsField } from "../shared/AttachmentsField";

const FIXTURE_KIT = ["tap", "shower_head"];

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
export function CheckpointsList({ checkpoints, assets, onOpen, onAdd, onEdit, onDelete, onRestore, onBulkImportFixtures }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => checkpoints.filter((c) => c.archived).length, [checkpoints]);
  const filtered = useMemo(() => checkpoints.filter((c) => (showArchived ? c.archived : !c.archived) && (!query || checkpointHaystack(c).includes(query.toLowerCase()))), [checkpoints, query, showArchived]);
  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><MapPin size={22} color="#197386" /><h2>Checkpoints</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && <button className="btn btn-ghost" onClick={onBulkImportFixtures}><PackagePlus size={16} /> Bulk add tap / shower head</button>}
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New checkpoint</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Physical locations used by checks like Window Restriction and Legionella — deliberately separate from the Room
        register, since not every checkpoint is a guest room (corridors, reception, the bar, communal areas).
      </p>
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search checkpoints…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived checkpoints." : "No checkpoints yet — add one for every location that needs a Window Restriction or Legionella check: rooms, corridors, reception, the bar, communal bathrooms."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Name</span><span>Linked assets</span><span></span><span></span><span></span><span></span></div>
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
/** Same "skip if it already exists, safe to re-run" idempotence as Rooms' "Import room asset
    kit" — but for Legionella fixtures linked to Checkpoints, which (unlike rooms) already exist,
    so this picks from the existing list rather than parsing a list of numbers to create. */
export function BulkImportCheckpointFixturesPage({ checkpoints, assets, onImport, onClose }) {
  const activeCheckpoints = useMemo(() => checkpoints.filter((cp) => !cp.archived), [checkpoints]);
  const hasFixture = (cp, typeKey) => assets.some((a) => !a.archived && a.checkpointId === cp.id && a.assetType === typeKey);
  const [selected, setSelected] = useState(() => new Set());
  const [fixtureKeys, setFixtureKeys] = useState(() => new Set(FIXTURE_KIT));
  const [result, setResult] = useState(null);

  const toggleCheckpoint = (id) => setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected((s) => (s.size === activeCheckpoints.length ? new Set() : new Set(activeCheckpoints.map((cp) => cp.id))));
  const toggleFixture = (key) => setFixtureKeys((s) => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const handleImport = () => {
    if (selected.size === 0 || fixtureKeys.size === 0) return;
    setResult(onImport(Array.from(selected), Array.from(fixtureKeys)));
  };

  return (
    <FormPage title="Bulk add tap / shower head" onClose={onClose} footer={
      result
        ? <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        : <button type="button" className="btn btn-primary" disabled={selected.size === 0 || fixtureKeys.size === 0} onClick={handleImport}>
            Add to {selected.size} checkpoint{selected.size === 1 ? "" : "s"}
          </button>
    }>
      {!result ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Creates a Tap and/or Shower Head asset — whichever you tick below — linked to each checkpoint you
            select, so Legionella descaling and water temperature checks pick them up. A checkpoint that
            already has one of these fixtures is skipped for that one and left untouched, so this is safe to
            run more than once.
          </p>
          <div className="row-2">
            <label className="checkbox-row"><input type="checkbox" checked={fixtureKeys.has("tap")} onChange={() => toggleFixture("tap")} /> Tap</label>
            <label className="checkbox-row"><input type="checkbox" checked={fixtureKeys.has("shower_head")} onChange={() => toggleFixture("shower_head")} /> Shower Head</label>
          </div>
          {activeCheckpoints.length === 0 ? (
            <p className="empty-state">No checkpoints yet — add checkpoints first, then come back here.</p>
          ) : (
            <>
              <label className="checkbox-row" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={selected.size === activeCheckpoints.length} onChange={toggleAll} /> Select all ({activeCheckpoints.length})
              </label>
              <div className="ledger-table">
                {activeCheckpoints.map((cp) => (
                  <div key={cp.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => toggleCheckpoint(cp.id)}>
                    <span className="checkbox-row" style={{ margin: 0 }}><input type="checkbox" checked={selected.has(cp.id)} readOnly /> {cp.name}</span>
                    <span className="muted">{hasFixture(cp, "tap") ? "Has tap" : "No tap"}</span>
                    <span className="muted">{hasFixture(cp, "shower_head") ? "Has shower head" : "No shower head"}</span>
                    <span></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p>
          <strong>{result.created.length}</strong> asset{result.created.length === 1 ? "" : "s"} created.
          {result.skipped.length > 0 && ` ${result.skipped.length} already existed and ${result.skipped.length === 1 ? "was" : "were"} left alone.`}
        </p>
      )}
    </FormPage>
  );
}

export function CheckpointDetail({ checkpoint, assets, records, onBack, onEdit, onOpenAsset, onOpenCheck, onOpenLegionellaCheck, onOpenLegionellaTempCheck }) {
  const { canEdit } = useContext(RoleContext);
  const linkedAssets = assets.filter((a) => a.checkpointId === checkpoint.id);
  const checks = useMemo(
    () => records.filter((r) => r.category === "window_restriction_check" && r.checkpointId === checkpoint.id && !r.archived).sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || "")),
    [records, checkpoint.id]
  );
  const legionellaChecks = useMemo(
    () => records.filter((r) => r.category === "legionella_check" && r.checkpointId === checkpoint.id && !r.archived).sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || "")),
    [records, checkpoint.id]
  );
  const legionellaTempChecks = useMemo(
    () => records.filter((r) => r.category === "legionella_temp_check" && r.checkpointId === checkpoint.id && !r.archived).sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || "")),
    [records, checkpoint.id]
  );
  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to checkpoints</button>
      <div className="module-header">
        <div className="module-title"><MapPin size={22} color="#197386" /><h2>{checkpoint.name}{checkpoint.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        {!checkpoint.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEdit(checkpoint)}><Pencil size={15} /> Edit checkpoint</button>}
      </div>
      {checkpoint.notes && <p className="muted" style={{ marginBottom: 10 }}>{checkpoint.notes}</p>}
      <div className="feed-section">
        <div className="feed-section-head"><h3><Package size={16} color="#8A6D1F" /> Assets here <span className="feed-count">{linkedAssets.length}</span></h3></div>
        {linkedAssets.length === 0 ? <p className="empty-state">No assets linked to this checkpoint yet.</p> : (
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
      <div className="feed-section">
        <div className="feed-section-head"><h3><Droplet size={16} color="#2A6F97" /> Legionella check history <span className="feed-count">{legionellaChecks.length}</span></h3></div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>One check per quarter covers every kettle, shower head, and tap at this checkpoint together — that's why history lives here, not on an individual fixture asset.</p>
        {legionellaChecks.length === 0 ? <p className="empty-state">No checks logged for this checkpoint yet.</p> : (
          <div className="ledger-table">
            {legionellaChecks.map((r) => {
              const locked = isLegionellaCheckLocked(r);
              const items = legionellaCheckEligibleItems(checkpoint, assets);
              const okCount = items.filter((item) => r.checks?.[item.key]?.status === "ok").length;
              const notOkCount = items.filter((item) => r.checks?.[item.key]?.status === "not_ok").length;
              return (
                <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenLegionellaCheck(checkpoint, r.periodKey, r)}>
                  <span className="mono-strong">
                    {notOkCount > 0 && <AlertCircle size={14} color="#A8402F" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    {notOkCount === 0 && okCount > 0 && <CheckCircle2 size={14} color="#2F6B4C" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    {legionellaCheckPeriodLabel(r.periodKey)}
                  </span>
                  <span className="muted">{okCount} OK{notOkCount > 0 ? `, ${notOkCount} Not OK` : ""}</span>
                  <span className="muted">{locked ? "Locked" : "Open"}</span>
                  <span></span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="feed-section">
        <div className="feed-section-head"><h3><Thermometer size={16} color="#2A6F97" /> Legionella water temperature history <span className="feed-count">{legionellaTempChecks.length}</span></h3></div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>One check per month covers the hot and cold reading at this checkpoint — that's why history lives here, not on an individual fixture asset.</p>
        {legionellaTempChecks.length === 0 ? <p className="empty-state">No checks logged for this checkpoint yet.</p> : (
          <div className="ledger-table">
            {legionellaTempChecks.map((r) => {
              const locked = isCheckpointCheckLocked(r);
              return (
                <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenLegionellaTempCheck(checkpoint, r.periodKey, r)}>
                  <span className="mono-strong">
                    {r.status === "ok" && <CheckCircle2 size={14} color="#2F6B4C" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    {r.status === "not_ok" && <AlertCircle size={14} color="#A8402F" style={{ verticalAlign: -2, marginRight: 5 }} />}
                    {checkpointCheckPeriodLabel(r.periodKey)}
                  </span>
                  <span className="muted">Hot {r.hotTempC ?? "—"}°C · Cold {r.coldTempC ?? "—"}°C</span>
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
