import React, { useState, useMemo, useContext } from "react";
import {
  Bug,
  Hammer,
  Search,
  Plus,
  Pencil,
  CheckCircle2,
  Clock,
  Package,
  ArrowLeft,
  Camera,
  ClipboardCheck,
  BedDouble,
  Share2,
  Archive,
  ArchiveRestore,
  Repeat,
} from "lucide-react";
import { RecordTable } from "../records/RecordList";
import { AttachmentsField } from "../shared/AttachmentsField";
import { CategoryTag, ErrorBanner, FormPage, HistoryList, PatternCallout, SaveStatusBanner, Stamp, Timeline } from "../shared/UI";
import { ASSET_TYPES, ROOM_TYPES, RoleContext } from "../../lib/constants";
import { assetComplianceStatus, belongsToRoom, daysUntil, escapeHtml, exportReport, findRecurringIssue, fmtDate, getDueDate, getEventDate, getStatus, isOpenIssue, isScheduleMode, todayStr, uid, validateRoom } from "../../lib/helpers";

export function RoomFormPage({ room, prefill, onSave, onClose }) {
  const [form, setForm] = useState(room || { id: uid(), roomNumber: "", floor: prefill?.floor || "", roomType: prefill?.roomType || ROOM_TYPES[0], notes: "", attachments: [], tags: [] });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const isNew = !room;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = (logAnother) => {
    const errs = validateRoom(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags }, logAnother);
  };
  return (
    <>
      <FormPage title={room ? "Edit room" : "New room"} onClose={onClose} footer={
        isNew
          ? <><button type="button" className="btn btn-ghost" onClick={() => handleSubmit(true)}>Save &amp; add another</button><button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Add room</button></>
          : <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Save changes</button>
      }>
        <ErrorBanner errors={errors} />
        <div className="row-2">
          <label>Room number<input value={form.roomNumber} onChange={(e) => set("roomNumber", e.target.value)} placeholder="e.g. 302" /></label>
          <label>Floor <span className="muted">(optional)</span><input value={form.floor} onChange={(e) => set("floor", e.target.value)} placeholder="e.g. 3" /></label>
        </div>
        <label>Room type<select value={form.roomType} onChange={(e) => set("roomType", e.target.value)}>{ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Tags <span className="muted">(comma-separated)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. accessible, sea-view" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
      </FormPage>
    </>
  );
}

export function RoomSection({ title, icon: Icon, color, records, assets, onView, onEdit, onDelete, onRestore, onResolve, emptyText }) {
  return (
    <div className="feed-section">
      <div className="feed-section-head"><h3><Icon size={16} color={color} /> {title} <span className="feed-count">{records.length}</span></h3></div>
      <RecordTable records={records} assets={assets} onView={onView} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} onResolve={onResolve} emptyText={emptyText} />
    </div>
  );
}

export function RoomDetail({ room, records, assets, onBack, onEditRoom, onLogForRoom, onViewRecord, onEditRecord, onDeleteRecord, onRestoreRecord, onResolve, onOpenAsset }) {
  const { canEdit } = useContext(RoleContext);
  const mine = useMemo(() => records.filter((r) => belongsToRoom(r, room.id, assets)), [records, room.id, assets]);
  const recurringIssue = useMemo(() => findRecurringIssue(mine), [mine]);
  const openMaintenance = mine.filter((r) => r.category === "maintenance" && isOpenIssue(r));
  const previousIssues = mine.filter((r) => r.category === "maintenance" && getStatus(r) === "resolved");
  const pestReports = mine.filter((r) => r.category === "pest").sort((a, b) => (b.dateReported || "").localeCompare(a.dateReported || ""));
  const inspections = mine.filter((r) => r.category === "room_inspection").sort((a, b) => (b.dateLogged || "").localeCompare(a.dateLogged || ""));
  const photos = mine.filter((r) => r.category === "room_photo").sort((a, b) => (b.dateLogged || "").localeCompare(a.dateLogged || ""));
  const compliance = mine.filter((r) => isScheduleMode(r)).sort((a, b) => daysUntil(getDueDate(a)) - daysUntil(getDueDate(b)));
  const roomAssets = assets.filter((a) => a.roomId === room.id);

  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to room register</button>
      <div className="module-header">
        <div className="module-title"><BedDouble size={22} color="#16263D" /><h2>Room {room.roomNumber}{room.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          {!room.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEditRoom(room)}><Pencil size={15} /> Edit room</button>}
          {!room.archived && <button className="btn btn-primary" onClick={() => onLogForRoom(room)}><Plus size={16} /> Log for this room</button>}
        </div>
      </div>
      {recurringIssue && (
        <PatternCallout icon={Repeat}>"{recurringIssue.title}" has been logged {recurringIssue.count} times for this room — worth checking whether the underlying cause has actually been fixed.</PatternCallout>
      )}
      <div className="asset-info-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div><span className="field-label">Floor</span><p>{room.floor || "—"}</p></div>
        <div><span className="field-label">Type</span><p>{room.roomType}</p></div>
        <div><span className="field-label">Assets in this room</span><p>{roomAssets.length === 0 ? "None" : roomAssets.map((a) => a.assetCode).join(", ")}</p></div>
      </div>
      {room.notes && <p className="muted" style={{ marginBottom: 10 }}>{room.notes}</p>}

      <div className="feed-section">
        <div className="feed-section-head"><h3><Clock size={16} color="#16263D" /> Timeline <span className="feed-count">{mine.filter((r) => getEventDate(r)).length}</span></h3></div>
        <Timeline records={mine} assets={assets} onEdit={onViewRecord} />
      </div>

      {roomAssets.length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Package size={16} color="#8A6D1F" /> Assets in this room <span className="feed-count">{roomAssets.length}</span></h3></div>
          <div className="ledger-table">
            {roomAssets.map((a) => (
              <div key={a.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenAsset(a.id)}>
                <span><CategoryTag category={a.category} /></span>
                <span className="mono-strong">{a.assetCode}</span>
                <span className="muted">{a.name || ASSET_TYPES.find((t) => t.key === a.assetType)?.label}</span>
                <span className="muted">{a.status}</span>
                <span><Stamp status={assetComplianceStatus(a, records)} dense /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <RoomSection title="Open maintenance" icon={Hammer} color="#A8402F" records={openMaintenance} assets={assets} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="Nothing open right now." />
      <RoomSection title="Previous issues" icon={CheckCircle2} color="#2F6B4C" records={previousIssues} assets={assets} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="No resolved maintenance history yet." />
      <RoomSection title="Pest reports" icon={Bug} color="#7A4B26" records={pestReports} assets={assets} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="No pest reports for this room." />
      <RoomSection title="Inspections" icon={ClipboardCheck} color="#4A5A8A" records={inspections} assets={assets} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="No inspections logged yet." />
      <RoomSection title="Photographs" icon={Camera} color="#8A4A6E" records={photos} assets={assets} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="No photos logged yet." />
      <RoomSection title="Recurring compliance tasks" icon={Clock} color="#2A6F97" records={compliance} assets={assets} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="No fire, water, or equipment checks linked to this room yet." />
      <HistoryList history={room.history} />
    </div>
  );
}

export function RoomsList({ rooms, records, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, onBulkImport, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => rooms.filter((r) => r.archived).length, [rooms]);
  const filtered = useMemo(() => rooms.filter((r) => (showArchived ? r.archived : !r.archived) && (!query || r.roomNumber.toLowerCase().includes(query.toLowerCase()))), [rooms, query, showArchived]);
  const openCount = (roomId) => records.filter((r) => r.roomId === roomId && r.category === "maintenance" && isOpenIssue(r) && !r.archived).length;

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const rows = filtered.map((r) => `<tr><td>Room ${escapeHtml(r.roomNumber)}</td><td>${escapeHtml(r.floor || "—")}</td><td>${escapeHtml(r.roomType)}</td><td>${openCount(r.id)}</td></tr>`).join("");
    const body = filtered.length === 0 ? '<p class="muted">None.</p>' : `<table><thead><tr><th>Room</th><th>Floor</th><th>Type</th><th>Open issues</th></tr></thead><tbody>${rows}</tbody></table>`;
    const result = await exportReport(`room-register-${todayStr()}.html`, "Room Register", `Saved ${fmtDate(todayStr())} · ${filtered.length} room${filtered.length === 1 ? "" : "s"}`, body, branding);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><BedDouble size={22} color="#16263D" /><h2>Room register</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          {canDelete && <button className="btn btn-ghost" onClick={onBulkImport}><Package size={15} /> Import room asset kit</button>}
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New room</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail"><div className="chip-row">
        <input className="search-inline" placeholder="Search room number…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived rooms." : "No rooms registered yet. Add Room 302 to get started."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Room</span><span>Floor</span><span>Type</span><span>Open issues</span><span></span><span></span></div>
          {filtered.map((r) => (
            <div className="ledger-row ledger-row--asset" key={r.id}>
              <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(r.id)}>Room {r.roomNumber}{r.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
              <span className="muted">{r.floor || "—"}</span>
              <span className="muted">{r.roomType}</span>
              <span>{openCount(r.id) > 0 ? <span className="flag-tag" style={{ marginLeft: 0 }}>{openCount(r.id)} open</span> : <span className="muted">None</span>}</span>
              <span></span>
              <span className="row-actions">
                {!r.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(r)}><Pencil size={15} /></button>}
                {canDelete && (r.archived
                  ? <button className="icon-btn" onClick={() => onRestore(r.id)}><ArchiveRestore size={15} /></button>
                  : <button className="icon-btn" onClick={() => onDelete(r.id)}><Archive size={15} /></button>)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export function BulkImportRoomAssetsPage({ onImport, onClose }) {
  const [roomNumbersText, setRoomNumbersText] = useState(
    "001\n101\n102\n103\n104\n105\n106\n107\n108\n201\n202\n203\n204\n205\n206\n207\n208\n301\n302\n303\n304\n305\n306\n307\n308"
  );
  const [result, setResult] = useState(null);
  const assetsPerRoom = ROOM_ASSET_KIT.reduce((n, k) => n + (k.sides ? k.sides.length : 1), 0);
  const roomNumbers = useMemo(
    () => roomNumbersText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    [roomNumbersText]
  );
  const count = roomNumbers.length;

  const handleImport = () => {
    if (count === 0) return;
    setResult(onImport(roomNumbers));
  };

  return (
    <FormPage title="Import room asset kit" onClose={onClose} footer={
      result
        ? <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        : <button type="button" className="btn btn-primary" disabled={count === 0} onClick={handleImport}>Create {count > 0 ? `${count} room${count === 1 ? "" : "s"} × up to ${assetsPerRoom} assets` : "assets"}</button>
    }>
      {!result ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Creates a kettle, TV, AC unit, AC filter, phone, fridge, underfloor heating, main sockets panel,
            bedside socket panels (L &amp; R), bedside lamps (L &amp; R), and a desk lamp for every room number
            listed below — {assetsPerRoom} assets per room. Rooms that already exist (matched by exact room
            number), and assets that already exist with the same code, are skipped and left untouched — nothing
            here edits or duplicates an existing room, so this is safe to run more than once.
          </p>
          <label>Room numbers <span className="muted">(one per line, or comma-separated — pre-filled with the numbers you gave me)</span>
            <textarea rows={10} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }} value={roomNumbersText} onChange={(e) => setRoomNumbersText(e.target.value)} />
          </label>
          <p className="muted">{count} room number{count === 1 ? "" : "s"} detected.</p>
        </>
      ) : (
        <p>
          <strong>{result.createdRooms.length}</strong> room{result.createdRooms.length === 1 ? "" : "s"} created
          and <strong>{result.createdAssets.length}</strong> asset{result.createdAssets.length === 1 ? "" : "s"} created.
          {result.reconciledAssets.length > 0 && ` ${result.reconciledAssets.length} existing asset${result.reconciledAssets.length === 1 ? "" : "s"} had ${result.reconciledAssets.length === 1 ? "its" : "their"} type corrected to match the current kit.`}
          {(result.skippedAssets.length - result.reconciledAssets.length) > 0 && ` ${result.skippedAssets.length - result.reconciledAssets.length} asset${(result.skippedAssets.length - result.reconciledAssets.length) === 1 ? "" : "s"} already existed and ${(result.skippedAssets.length - result.reconciledAssets.length) === 1 ? "was" : "were"} left alone.`}
        </p>
      )}
    </FormPage>
  );
}

/* ---------------------------------------------------------
   CONTRACTOR FORM PAGE
--------------------------------------------------------- */
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
