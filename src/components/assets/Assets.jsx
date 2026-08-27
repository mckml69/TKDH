import React, { useState, useMemo, useContext } from "react";
import {
  Plus, Pencil, Trash2, ArrowLeft, Package, MapPin, Repeat, ArchiveRestore, Archive, Search, ListFilter, Blinds, Award, Share2,
} from "lucide-react";
import { RoleContext, TEMPLATES, ASSET_TYPES, ASSET_STATUSES, DECOMMISSION_REASONS, STATUS_META } from "../../lib/constants";
import {
  uid, todayStr, fmtDate, generateAssetCode, copyLifecycleFields, validateAsset, getEventDate, getStatus,
  assetComplianceStatus, isIssueMode, isOpenIssue, findRecurringIssue, findRepeatContractor, findRepeatFailure,
  certificateStatus, roomLabelText,
} from "../../lib/helpers";
import { AttachChip, CategoryTag, ErrorBanner, FormPage, HistoryList, PatternCallout, SaveStatusBanner, Stamp } from "../shared/UI";
import { AttachmentsField } from "../shared/AttachmentsField";
import { RecordTable } from "../records/RecordList";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function AssetFormPage({ asset, assets, rooms, checkpoints, prefill, onSave, onClose }) {
  const [form, setForm] = useState(asset || (() => {
    const t = ASSET_TYPES.find((a) => a.key === prefill?.assetType) || ASSET_TYPES[0];
    return { id: uid(), assetType: t.key, category: t.category, eligibleFor: t.eligibleFor, assetCode: generateAssetCode(t.key, assets), name: "", location: prefill?.location || "", roomId: null, checkpointId: null, manufacturer: "", model: "", serialNumber: "", installDate: "", status: "In Service", notes: "", attachments: [] };
  }));
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const isNew = !asset;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const usesCheckpoint = form.category === "window_restriction";
  const showsLegionellaCheckpoint = ["kettle", "shower_head", "tap"].includes(form.assetType);
  const handleTypeChange = (key) => {
    const t = ASSET_TYPES.find((a) => a.key === key);
    setForm((f) => ({ ...f, assetType: key, category: t.category, eligibleFor: t.eligibleFor, assetCode: isNew ? generateAssetCode(key, assets) : f.assetCode }));
  };
  const handleSubmit = (logAnother) => {
    const errs = validateAsset(form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags }, logAnother);
  };

  return (
    <>
      <FormPage title={asset ? "Edit asset" : "New asset"} onClose={onClose} footer={
        isNew
          ? <><button type="button" className="btn btn-ghost" onClick={() => handleSubmit(true)}>Save &amp; add another</button><button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Add asset</button></>
          : <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)}>Save changes</button>
      }>
        <ErrorBanner errors={errors} />
        <label>Asset type<select value={form.assetType} onChange={(e) => handleTypeChange(e.target.value)}>{ASSET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
        <div className="row-2">
          <label>Asset code<input value={form.assetCode} onChange={(e) => set("assetCode", e.target.value)} placeholder="e.g. FE-014" /></label>
          <label>Status<select value={form.status} onChange={(e) => set("status", e.target.value)}>{ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <label>Name / description <span className="muted">(optional)</span><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Corridor 3F extinguisher" /></label>
        <div className="row-2">
          {usesCheckpoint ? (
            <label>Checkpoint <span className="muted">(where this window is)</span>
              <select value={form.checkpointId || ""} onChange={(e) => set("checkpointId", e.target.value || null)}>
                <option value="">Not assigned yet</option>
                {checkpoints.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
              </select>
            </label>
          ) : (
            <label>Room <span className="muted">(if inside a bedroom)</span>
              <select value={form.roomId || ""} onChange={(e) => set("roomId", e.target.value || null)}>
                <option value="">Not in a room</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{roomLabelText(r.roomNumber)}</option>)}
              </select>
            </label>
          )}
          <label>Location<input list="loc-presets" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Corridor 3F" /></label>
        </div>
        {showsLegionellaCheckpoint && (
          <label>Legionella checkpoint <span className="muted">(pairs this fixture with a quarterly Legionella check, independent of the room above)</span>
            <select value={form.checkpointId || ""} onChange={(e) => set("checkpointId", e.target.value || null)}>
              <option value="">Not assigned yet</option>
              {checkpoints.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
            </select>
          </label>
        )}
        <div className="row-2">
          <label>Manufacturer<input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></label>
          <label>Model<input value={form.model} onChange={(e) => set("model", e.target.value)} /></label>
        </div>
        <div className="row-2">
          <label>Serial number<input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} /></label>
          <label>Installed on<input type="date" value={form.installDate} onChange={(e) => set("installDate", e.target.value)} /></label>
        </div>
        <label>Tags <span className="muted">(comma-separated — supplier, contractor, etc.)</span><input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. Chubb Fire, warranty-2028" /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} />
      </FormPage>
    </>
  );
}

export function ReplaceAssetPage({ asset, assets, onReplace, onClose }) {
  const type = ASSET_TYPES.find((t) => t.key === asset.assetType);
  const [reason, setReason] = useState(DECOMMISSION_REASONS[0]);
  const [reasonOther, setReasonOther] = useState("");
  const [decommissionDate, setDecommissionDate] = useState(todayStr());
  const [newCode, setNewCode] = useState(asset.assetCode);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [installDate, setInstallDate] = useState(todayStr());
  const [errors, setErrors] = useState([]);

  const handleSubmit = () => {
    const finalReason = reason === "Other" ? reasonOther.trim() : reason;
    const errs = [];
    if (!finalReason) errs.push("Decommission reason is required.");
    if (!newCode.trim()) errs.push("The replacement asset needs a code.");
    if (errs.length) { setErrors(errs); return; }
    onReplace(asset.id, { reason: finalReason, date: decommissionDate }, {
      assetCode: newCode.trim(), name: asset.name,
      manufacturer: manufacturer.trim(), model: model.trim(), serialNumber: serialNumber.trim(),
      installDate, status: "In Service", notes: "",
    });
  };

  return (
    <FormPage title={`Replace ${asset.assetCode}`} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}><Repeat size={15} /> Decommission &amp; create replacement</button>}>
      <ErrorBanner errors={errors} />
      <p className="muted" style={{ marginTop: 0 }}>
        {asset.assetCode} will be archived and marked decommissioned — its full history is kept, nothing is deleted.
        A new {type?.label.toLowerCase()} is created in the same spot, linked both ways so each asset's page shows the other.
      </p>
      <div className="row-2">
        <label>Reason for decommissioning
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{DECOMMISSION_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label>Decommission date<input type="date" value={decommissionDate} onChange={(e) => setDecommissionDate(e.target.value)} /></label>
      </div>
      {reason === "Other" && <label>Details<input value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} placeholder="What happened to it?" /></label>}

      <h4 style={{ margin: "6px 0 -4px", fontSize: 13, fontWeight: 700, color: "#4A463D" }}>New {type?.label.toLowerCase()}</h4>
      <div className="row-2">
        <label>Asset code<input value={newCode} onChange={(e) => setNewCode(e.target.value)} /></label>
        <label>Installed on<input type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} /></label>
      </div>
      <div className="row-2">
        <label>Manufacturer <span className="muted">(optional)</span><input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></label>
        <label>Model <span className="muted">(optional)</span><input value={model} onChange={(e) => setModel(e.target.value)} /></label>
      </div>
      <label>Serial number <span className="muted">(optional)</span><input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></label>
      <p className="muted">Same location and room as {asset.assetCode} — edit the new asset afterward if it's moving somewhere else.</p>
    </FormPage>
  );
}

export function AssetsList({ assets, records, onOpen, onAdd, onEdit, onDelete, onRestore, onExportFallback, branding }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => assets.filter((a) => a.archived).length, [assets]);
  const filtered = useMemo(() => assets.filter((a) => {
    const hay = [a.assetCode, a.name, a.location, ASSET_TYPES.find((t) => t.key === a.assetType)?.label].filter(Boolean).join(" ").toLowerCase();
    return (showArchived ? a.archived : !a.archived) && (catFilter === "all" || a.category === catFilter) && (typeFilter === "all" || a.assetType === typeFilter) && (!query || hay.includes(query.toLowerCase()));
  }), [assets, query, catFilter, typeFilter, showArchived]);

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const rows = filtered.map((a) => ({
      code: a.assetCode, type: ASSET_TYPES.find((t) => t.key === a.assetType)?.label || "",
      name: a.name || "", location: a.location || "", compliance: assetComplianceStatus(a, records),
    }));
    const title = "Asset Register";
    const columns = [
      { key: "code", label: "Code", width: 0.16 },
      { key: "type", label: "Type", width: 0.22 },
      { key: "name", label: "Name", width: 0.24 },
      { key: "location", label: "Location", width: 0.2 },
      { key: "compliance", label: "Compliance", width: 0.18, chip: true },
    ];
    const subtitle = `Saved ${fmtDate(todayStr())} · ${filtered.length} asset${filtered.length === 1 ? "" : "s"}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`asset-register-${todayStr()}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><Package size={22} color="#197386" /><h2>Asset register</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New asset</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail">
        <div className="chip-row">
          <input className="search-inline" placeholder="Search assets…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className={"chip" + (catFilter === "all" ? " chip--active" : "")} onClick={() => setCatFilter("all")}>All</button>
          {["fire", "legionella", "equipment", "window_restriction"].map((c) => (
            <button key={c} className={"chip" + (catFilter === c ? " chip--active" : "")} style={catFilter === c ? { backgroundColor: TEMPLATES[c].accent, borderColor: TEMPLATES[c].accent, color: "#fff" } : undefined} onClick={() => setCatFilter(c)}>{TEMPLATES[c].short}</button>
          ))}
          <select className="search-inline" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {ASSET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived assets." : "No assets registered yet. Add your first fire extinguisher, boiler, or lift."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Code</span><span>Type</span><span>Name / location</span><span>Records</span><span>Compliance</span><span></span></div>
          {filtered.map((a) => {
            const linkedCount = records.filter((r) => r.assetId === a.id).length;
            const compliance = assetComplianceStatus(a, records);
            return (
              <div className="ledger-row ledger-row--asset" key={a.id}>
                <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onOpen(a.id)}>{a.assetCode}{a.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
                <span className="muted">{ASSET_TYPES.find((t) => t.key === a.assetType)?.label}</span>
                <span className="muted" style={{ cursor: "pointer" }} onClick={() => onOpen(a.id)}>{a.name || a.location || "—"}</span>
                <span className="muted">{linkedCount}</span>
                <span><Stamp status={compliance} dense /></span>
                <span className="row-actions">
                  {!a.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(a)}><Pencil size={15} /></button>}
                  {canDelete && (a.archived
                    ? <button className="icon-btn" onClick={() => onRestore(a.id)}><ArchiveRestore size={15} /></button>
                    : <button className="icon-btn" onClick={() => onDelete(a.id)}><Archive size={15} /></button>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ---------------------------------------------------------
   TIMELINE — chronological, cross-category history for any object
--------------------------------------------------------- */
export function Timeline({ records, assets, onEdit }) {
  const grouped = useMemo(() => {
    const dated = records.filter((r) => getEventDate(r)).sort((a, b) => (getEventDate(a) || "").localeCompare(getEventDate(b) || ""));
    const groups = [];
    let currentMonth = null;
    for (const r of dated) {
      const d = getEventDate(r);
      const monthLabel = new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      if (monthLabel !== currentMonth) {
        groups.push({ month: monthLabel, items: [] });
        currentMonth = monthLabel;
      }
      groups[groups.length - 1].items.push(r);
    }
    return groups;
  }, [records]);

  if (grouped.length === 0) return <div className="empty-state">Nothing dated yet — the timeline fills in as records are logged.</div>;

  return (
    <div className="timeline">
      {grouped.map((group) => (
        <div key={group.month} className="timeline-month-group">
          <div className="timeline-month-label">{group.month}</div>
          {group.items.map((r) => {
            const linkedAsset = r.assetId ? assets.find((a) => a.id === r.assetId) : null;
            return (
              <div key={r.id} className="timeline-item" onClick={() => onEdit(r)}>
                <span className="timeline-dot" style={{ background: STATUS_META[getStatus(r)].color }} />
                <div className="timeline-item-body">
                  <div className="timeline-item-head">
                    <CategoryTag category={r.category} />
                    <span className="mono-strong">{r.title}</span>
                    <AttachChip count={r.attachments?.length} />
                    <Stamp status={getStatus(r)} dense />
                  </div>
                  <p className="muted">{fmtDate(getEventDate(r))}{r.people ? ` · ${r.people}` : ""}{linkedAsset ? ` · ${linkedAsset.assetCode}` : ""}{r.location ? ` · ${r.location}` : ""}</p>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}


export function AssetDetail({ asset, assets, records, rooms, checkpoints, certificates, contractors, onBack, onEditAsset, onLogForAsset, onReplaceAsset, onViewRecord, onEditRecord, onDeleteRecord, onRestoreRecord, onResolve, onOpenRoom, onOpenCertificate, onOpenContractor, onOpenAsset, onOpenCheckpoint }) {
  const { canEdit, canViewSensitive } = useContext(RoleContext);
  const linked = useMemo(() => records.filter((r) => r.assetId === asset.id).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")), [records, asset.id]);
  const openItems = useMemo(() => linked.filter((r) => (r.flagged && !r.flagResolved) || (isIssueMode(r) && isOpenIssue(r))), [linked]);
  const coveringCerts = useMemo(() => certificates.filter((c) => c.assetId === asset.id && !c.archived), [certificates, asset.id]);
  const recurringIssue = useMemo(() => findRecurringIssue(linked), [linked]);
  const repeatContractor = useMemo(() => findRepeatContractor(linked, asset.id, contractors), [linked, asset.id, contractors]);
  const repeatFailure = useMemo(() => findRepeatFailure(linked), [linked]);
  const compliance = assetComplianceStatus(asset, records);
  const type = ASSET_TYPES.find((t) => t.key === asset.assetType);
  const room = asset.roomId ? rooms.find((r) => r.id === asset.roomId) : null;
  const checkpoint = asset.checkpointId ? checkpoints.find((cp) => cp.id === asset.checkpointId) : null;
  const checkpointCheckCount = checkpoint ? records.filter((r) => r.category === "window_restriction_check" && r.checkpointId === checkpoint.id && !r.archived).length : 0;
  const replacedBy = asset.supersededByAssetId ? assets.find((a) => a.id === asset.supersededByAssetId) : null;
  const replaces = asset.replacesAssetId ? assets.find((a) => a.id === asset.replacesAssetId) : null;

  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to register</button>
      <div className="module-header">
        <div className="module-title"><Package size={22} color={TEMPLATES[asset.category]?.accent} /><h2>{asset.assetCode}{asset.name ? ` — ${asset.name}` : ""}{asset.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          {!asset.archived && canEdit && <button className="btn btn-ghost" onClick={() => onEditAsset(asset)}><Pencil size={15} /> Edit asset</button>}
          {!asset.archived && canEdit && <button className="btn btn-ghost" onClick={() => onReplaceAsset(asset)}><Repeat size={15} /> Replace asset</button>}
          {!asset.archived && <button className="btn btn-primary" style={{ backgroundColor: TEMPLATES[asset.category]?.accent, color: "#fff" }} onClick={() => onLogForAsset(asset)}><Plus size={16} /> Log for this asset</button>}
        </div>
      </div>
      {checkpoint && (
        <PatternCallout icon={Blinds}>
          This asset is checked as part of <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenCheckpoint(checkpoint.id)}>{checkpoint.name}</span> —
          {checkpointCheckCount > 0 ? ` ${checkpointCheckCount} check${checkpointCheckCount === 1 ? "" : "s"} logged there so far` : " nothing logged there yet"},
          since Window Restriction checks cover the whole checkpoint together, not one window at a time.
        </PatternCallout>
      )}
      {replacedBy && (
        <PatternCallout icon={Repeat}>
          Decommissioned{asset.decommissionReason ? ` (${asset.decommissionReason})` : ""}{asset.decommissionDate ? ` on ${fmtDate(asset.decommissionDate)}` : ""} — replaced by{" "}
          <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenAsset(replacedBy.id)}>{replacedBy.assetCode}</span>.
        </PatternCallout>
      )}
      {replaces && (
        <PatternCallout icon={Repeat}>
          Replaces <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenAsset(replaces.id)}>{replaces.assetCode}</span>, decommissioned{replaces.decommissionReason ? ` (${replaces.decommissionReason})` : ""} — its full history is still on that record.
        </PatternCallout>
      )}
      {repeatFailure && (
        <PatternCallout icon={Repeat}>"{repeatFailure.title}" has failed {repeatFailure.count} times on this asset — this keeps coming back, not a one-off.</PatternCallout>
      )}
      {recurringIssue && (!repeatFailure || repeatFailure.title !== recurringIssue.title) && (
        <PatternCallout icon={Repeat}>"{recurringIssue.title}" has been logged {recurringIssue.count} times for this asset — worth checking whether the underlying cause has actually been fixed.</PatternCallout>
      )}
      {repeatContractor && (
        <PatternCallout icon={Repeat}><span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenContractor(repeatContractor.contractor.id)}>{repeatContractor.contractor.name}</span> has attended this asset {repeatContractor.count} times — the fix may not be sticking.</PatternCallout>
      )}
      <div className="asset-info-grid">
        <div><span className="field-label">Type</span><p>{type?.label}{(asset.eligibleFor || [asset.category]).length > 1 && <span className="muted" style={{ fontWeight: 400 }}> — also linkable under {(asset.eligibleFor || []).filter((c) => c !== asset.category).map((c) => TEMPLATES[c]?.short || c).join(", ")}</span>}</p></div>
        <div><span className="field-label">Status</span><p>{asset.status}</p></div>
        <div><span className="field-label">Location</span><p><MapPin size={12} style={{ verticalAlign: -1 }} /> {room ? <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => onOpenRoom(room.id)}>{roomLabelText(room.roomNumber)}</span> : (asset.location || "—")}</p></div>
        <div><span className="field-label">Compliance</span><p><Stamp status={compliance} dense /></p></div>
        <div><span className="field-label">Manufacturer / model</span><p>{[asset.manufacturer, asset.model].filter(Boolean).join(" · ") || "—"}</p></div>
        <div><span className="field-label">Serial</span><p>{asset.serialNumber || "—"}</p></div>
        <div><span className="field-label">Installed</span><p>{asset.installDate ? fmtDate(asset.installDate) : "—"}</p></div>
      </div>
      {asset.notes && <p className="muted" style={{ marginBottom: 20 }}>{asset.notes}</p>}
      {coveringCerts.length > 0 && canViewSensitive && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Award size={16} color="#B8862B" /> Certificates covering this asset <span className="feed-count">{coveringCerts.length}</span></h3></div>
          <div className="ledger-table">
            {coveringCerts.map((c) => (
              <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenCertificate(c.id)}>
                <span className="mono-strong">{c.title}</span>
                <span className="muted">{c.certType}</span>
                <span className="muted">{c.issuer || "—"}</span>
                <span className="mono">{fmtDate(c.expiryDate)}</span>
                <span><Stamp status={certificateStatus(c)} dense /></span>
              </div>
            ))}
          </div>
        </div>
      )}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Timeline</h3>
      <Timeline records={linked} assets={[asset]} onEdit={onViewRecord} />
      {openItems.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "22px 0 10px" }}>Needs action ({openItems.length})</h3>
          <RecordTable records={openItems} assets={[asset]} rooms={rooms} contractors={contractors} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onRestore={onRestoreRecord} onResolve={onResolve} emptyText="" />
        </>
      )}
      <HistoryList history={asset.history} />
    </div>
  );
}

