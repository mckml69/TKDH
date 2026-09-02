import React, { useState, useContext } from "react";
import {
  Pencil,
  CheckCircle2,
  Link2,
  CheckSquare,
  MessageSquareWarning,
} from "lucide-react";
import { AttachmentsField } from "../shared/AttachmentsField";
import { CategoryTag, ErrorBanner, FormPage, HistoryList } from "../shared/UI";
import { ASSET_TYPES, FREQUENCY_PRESETS, PRESET_DEFAULT_FREQUENCY, PUB_VENUE_NAME, TRAINING_DEFAULT_VALIDITY_DAYS, REQUIREMENTS, RoleContext, BASIS_LABELS } from "../../lib/constants";
import { addDays, fmtDate, getMode, hasPendingCorrection, roomLabelText, todayStr, uid, validateRecord } from "../../lib/helpers";

const REVIEW_REASONS = ["Routine review", "Significant change (refit, new furniture, change of use)", "New equipment affecting risk", "Occupancy change", "Incident or near miss", "Failure or deterioration of a precaution", "Other"];

/** Looks up the Compliance Library entry behind a selected preset, if any — used to show the form a
    small honest note about what actually backs this preset's timing (law/guidance/manufacturer/
    risk-based/policy), the same information the Library page already has, right where it's useful. */
function findRequirementFor(categoryKey, presetValue) {
  return REQUIREMENTS.find((req) => (req.matchCategories || [req.category]).includes(categoryKey) && req.matchValues.includes(presetValue));
}
function BasisNote({ categoryKey, presetValue }) {
  const req = findRequirementFor(categoryKey, presetValue);
  if (!req) return null;
  const labels = req.basis.map((b) => BASIS_LABELS[b]).join(" + ");
  return (
    <p className="muted" style={{ margin: "-4px 0 0", fontSize: 12.5 }}>
      {labels}{req.sourceConfidence === "unverified" ? " — not independently verified against a primary source" : ""}. See the Compliance Library for details.
    </p>
  );
}

export function RecordFormPage({ template, record, assets, rooms, contractors, staff, prefill, initialViewOnly, readOnly, onSave, onClose, onRequestCorrection, onDismissCorrection }) {
  const { canEdit } = useContext(RoleContext);
  const [viewOnly, setViewOnly] = useState(!!initialViewOnly);
  const [form, setForm] = useState(record || (() => {
    const base = { id: uid(), category: template.key, notes: "", attachments: [], location: "", people: "", assetId: null, roomId: null, contractorId: null, staffId: null, tags: [] };
    const initialMode = template.mode; // a template's own default preset never happens to be an overridden one, so this always matches getMode() at mount
    let byMode;
    if (initialMode === "expiry") byMode = { ...base, title: "", detail: template.presets[0], completedDate: todayStr(), expiryDate: addDays(todayStr(), TRAINING_DEFAULT_VALIDITY_DAYS[template.presets[0]] ?? 365) };
    else if (initialMode === "incident") byMode = { ...base, title: template.presets[0], dateReported: todayStr(), actionTaken: "", status: "Open" };
    else if (initialMode === "maintenance") byMode = { ...base, title: "", dateRaised: todayStr(), priority: "Medium", status: "Open" };
    else if (initialMode === "log") byMode = { ...base, title: template.key === "room_photo" ? "Room photo" : "Room inspection", dateLogged: todayStr() };
    else if (initialMode === "review") byMode = { ...base, title: template.presets[0], lastReviewed: null, nextReviewTarget: null, reviewReason: null };
    else byMode = { ...base, title: template.presets[0], lastCompleted: todayStr(), frequencyDays: PRESET_DEFAULT_FREQUENCY[template.presets[0]] ?? 30, flagged: false, flagDescription: "", flagResolved: false };
    return { ...byMode, ...(prefill || {}) };
  }));
  // Reactive, not fixed to template.mode: most presets share their category's mode, but a few (the
  // Fire Risk Assessment, Health & Safety Induction) need a different one than their category's
  // default — see getMode's MODE_OVERRIDE_LOOKUP. Recomputed every render off the current selection.
  const mode = getMode({ category: template.key, title: form.title, detail: form.detail });
  const [freqPreset, setFreqPreset] = useState(() => {
    if (mode !== "recurring") return null;
    const match = FREQUENCY_PRESETS.find((f) => f.days === form.frequencyDays);
    return match ? match.label : "Custom";
  });
  const [attachments, setAttachments] = useState(form.attachments || []);
  const [tagsInput, setTagsInput] = useState((form.tags || []).join(", "));
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSubmit = (logAnother) => {
    const errs = validateRecord(mode, form);
    if (errs.length) { setErrors(errs); return; }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ ...form, attachments, tags }, logAnother);
  };

  // Once a room is picked, narrow the asset list to that room's own assets — otherwise every room's
  // AC filter/kettle/etc. shows up in one flat list under an identical-looking label (e.g. "AC Filter"),
  // making it easy to link the record to the wrong room's asset by mistake.
  const eligibleAssets = template.assetEligible
    ? assets.filter((a) => (template.key === "maintenance" || a.category === template.key) && (!form.roomId || a.roomId === form.roomId))
    : [];

  return (
    <>
      <FormPage
        title={viewOnly ? `View record · ${template.label}` : `${record ? "Edit" : "New"} record · ${template.label}`}
        onClose={onClose}
        footer={viewOnly
          ? (readOnly
              ? null
              : (canEdit
                  ? <>
                      {record && hasPendingCorrection(record) && onDismissCorrection && <button type="button" className="btn btn-ghost" onClick={() => onDismissCorrection(record.id)}>Dismiss request</button>}
                      <button type="button" className="btn btn-primary" style={{ backgroundColor: template.accent, color: "#fff" }} onClick={() => setViewOnly(false)}><Pencil size={15} /> Edit</button>
                    </>
                  : (record && !record.archived && onRequestCorrection ? <button type="button" className="btn btn-primary" style={{ backgroundColor: template.accent, color: "#fff" }} onClick={() => onRequestCorrection(record)}><MessageSquareWarning size={15} /> Request correction</button> : null)))
          : <>
              {!record && <button type="button" className="btn btn-ghost" onClick={() => handleSubmit(true)}>Save &amp; log another</button>}
              <button type="button" className="btn btn-primary" style={{ backgroundColor: template.accent, color: "#fff" }} onClick={() => handleSubmit(false)}>{record ? "Save changes" : "Add record"}</button>
            </>}
      >
        <ErrorBanner errors={errors} />
        {readOnly && (
          <p className="muted" style={{ margin: "-4px 0 0" }}>Read-only — this record belongs to {PUB_VENUE_NAME}'s own system. Resolving or editing it happens there.</p>
        )}
        <fieldset disabled={viewOnly} className="view-fieldset">

        {(template.roomEligible || template.assetEligible) && (
          <div className="row-2">
            {template.roomEligible && (
              <label>Linked room <span className="muted">(optional)</span>
                <select value={form.roomId || ""} onChange={(e) => {
                  const roomId = e.target.value || null;
                  setForm((f) => {
                    const staleAsset = f.assetId && !assets.find((a) => a.id === f.assetId && (!roomId || a.roomId === roomId));
                    return { ...f, roomId, assetId: staleAsset ? null : f.assetId };
                  });
                }}>
                  <option value="">Not linked</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{roomLabelText(r.roomNumber)}</option>)}
                </select>
              </label>
            )}
            {template.assetEligible && (
              <label>Linked asset <span className="muted">(optional)</span>
                <select value={form.assetId || ""} onChange={(e) => set("assetId", e.target.value || null)}>
                  <option value="">Not linked / general</option>
                  {eligibleAssets.map((a) => <option key={a.id} value={a.id}>{a.assetCode} — {a.name || ASSET_TYPES.find((t) => t.key === a.assetType)?.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {template.contractorEligible && (
          <label>{mode === "maintenance" ? "Assigned to" : "Completed by"} <span className="muted">(optional — contractor or in-house staff{mode === "maintenance" ? " — who actually did the work is recorded separately, when you resolve it" : ""})</span>
            <select
              value={form.contractorId ? `contractor:${form.contractorId}` : form.staffId ? `staff:${form.staffId}` : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) { setForm((f) => ({ ...f, contractorId: null, staffId: null })); return; }
                const [kind, id] = val.split(":");
                setForm((f) => ({ ...f, contractorId: kind === "contractor" ? id : null, staffId: kind === "staff" ? id : null }));
              }}>
              <option value="">Not specified</option>
              {contractors.length > 0 && (
                <optgroup label="Contractors">
                  {contractors.map((c) => <option key={c.id} value={`contractor:${c.id}`}>{c.__pulled ? `${c.name} (${PUB_VENUE_NAME})` : c.name}</option>)}
                </optgroup>
              )}
              {staff.length > 0 && (
                <optgroup label="Staff">
                  {staff.map((s) => <option key={s.id} value={`staff:${s.id}`}>{s.name}{s.role ? ` — ${s.role}` : ""}</option>)}
                </optgroup>
              )}
            </select>
          </label>
        )}

        {template.mode === "expiry" && (<>
          {template.staffEligible && staff.length > 0 && (
            <label>Link to staff register <span className="muted">(optional — fills the name in below)</span>
              <select value={form.staffId || ""} onChange={(e) => {
                const id = e.target.value || null;
                set("staffId", id);
                if (id) { const s = staff.find((x) => x.id === id); if (s) set("title", s.name); }
              }}>
                <option value="">Not linked — type name manually</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` — ${s.role}` : ""}</option>)}
              </select>
            </label>
          )}
          <label>Staff member<input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Full name" /></label>
          <label>Training type
            <select value={form.detail} onChange={(e) => {
              const val = e.target.value;
              const newMode = getMode({ category: template.key, detail: val });
              if (!record && newMode !== mode) {
                // crossing into/out of Health & Safety Induction's log-shaped fields
                if (newMode === "log") setForm((f) => ({ ...f, detail: val, dateLogged: f.completedDate || todayStr() }));
                else setForm((f) => ({ ...f, detail: val, completedDate: f.dateLogged || todayStr(), expiryDate: addDays(todayStr(), TRAINING_DEFAULT_VALIDITY_DAYS[val] ?? 365) }));
                return;
              }
              set("detail", val);
              if (!record && newMode === "expiry") set("expiryDate", addDays(form.completedDate || todayStr(), TRAINING_DEFAULT_VALIDITY_DAYS[val] ?? 365));
            }}>{template.presets.map((p) => <option key={p}>{p}</option>)}<option>Other</option></select>
          </label>
          <BasisNote categoryKey={template.key} presetValue={form.detail} />
          {mode === "log" ? (
            <label>Date<input type="date" value={form.dateLogged} onChange={(e) => set("dateLogged", e.target.value)} /></label>
          ) : (
            <div className="row-2">
              <label>Completed on<input type="date" value={form.completedDate} onChange={(e) => set("completedDate", e.target.value)} /></label>
              <label>Expires on<input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></label>
            </div>
          )}
          <label>Venue / location <span className="muted">(optional)</span><input list="loc-presets" value={form.location} onChange={(e) => set("location", e.target.value)} /></label>
        </>)}

        {(template.mode === "recurring" || template.mode === "review") && (<>
          <label>Task
            <select value={form.title} onChange={(e) => {
              const val = e.target.value;
              const newMode = getMode({ category: template.key, title: val });
              if (!record && newMode !== mode) {
                // crossing into/out of a review-based preset (e.g. Fire Risk Assessment, within the otherwise-recurring Fire Safety category)
                if (newMode === "review") setForm((f) => ({ ...f, title: val, lastReviewed: null, nextReviewTarget: null, reviewReason: null }));
                else setForm((f) => ({ ...f, title: val, lastCompleted: todayStr(), frequencyDays: PRESET_DEFAULT_FREQUENCY[val] ?? 30, flagged: false, flagDescription: "", flagResolved: false }));
                return;
              }
              set("title", val);
              if (!record && newMode === "recurring" && PRESET_DEFAULT_FREQUENCY[val] != null) {
                const days = PRESET_DEFAULT_FREQUENCY[val];
                set("frequencyDays", days);
                const match = FREQUENCY_PRESETS.find((f) => f.days === days);
                setFreqPreset(match ? match.label : "Custom");
              }
            }}>{template.presets.map((p) => <option key={p}>{p}</option>)}<option>Other</option></select>
          </label>
          <BasisNote categoryKey={template.key} presetValue={form.title} />
        </>)}

        {mode === "review" && (<>
          <div className="row-2">
            <label>Last reviewed<input type="date" value={form.lastReviewed || ""} onChange={(e) => set("lastReviewed", e.target.value || null)} /></label>
            <label>Next review target <span className="muted">(optional)</span><input type="date" value={form.nextReviewTarget || ""} onChange={(e) => set("nextReviewTarget", e.target.value || null)} /></label>
          </div>
          <p className="muted" style={{ margin: "-4px 0 0", fontSize: 12.5 }}>Internal target only — not a statutory expiry date.</p>
          <label>Reason for review
            <select value={form.reviewReason || "Routine review"} onChange={(e) => set("reviewReason", e.target.value)}>
              {REVIEW_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label>Responsible person / role<input value={form.people} onChange={(e) => set("people", e.target.value)} placeholder="e.g. Duty Manager" /></label>
        </>)}

        {mode === "recurring" && (<>
          <label>Location <span className="muted">(room or area)</span><input list="loc-presets" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Room 214, or Plant Room" /></label>
          <div className="row-2">
            <label>Last completed<input type="date" value={form.lastCompleted} onChange={(e) => set("lastCompleted", e.target.value)} /></label>
            <label>Frequency
              <select value={freqPreset} onChange={(e) => {
                const p = FREQUENCY_PRESETS.find((f) => f.label === e.target.value);
                setFreqPreset(e.target.value);
                if (p && p.days) set("frequencyDays", p.days);
              }}>{FREQUENCY_PRESETS.map((f) => <option key={f.label}>{f.label}</option>)}</select>
            </label>
          </div>
          {freqPreset === "Custom" && (<label>Every how many days?<input type="number" min="1" value={form.frequencyDays} onChange={(e) => set("frequencyDays", parseInt(e.target.value || "0", 10))} /></label>)}
          <label>Responsible person / role<input value={form.people} onChange={(e) => set("people", e.target.value)} placeholder="e.g. Duty Manager" /></label>
          {template.key === "legionella" && (
            <div className="row-2">
              <label>Reading type
                <select value={form.readingType || "N/A"} onChange={(e) => set("readingType", e.target.value)}>
                  <option value="N/A">Not applicable</option>
                  <option>Hot water outlet</option>
                  <option>Cold water outlet</option>
                  <option>Calorifier</option>
                  <option>Tank</option>
                </select>
              </label>
              <label>Temperature reading (°C) <span className="muted">(optional)</span>
                <input type="number" step="0.1" value={form.temperatureC ?? ""} onChange={(e) => set("temperatureC", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="e.g. 54" />
              </label>
            </div>
          )}
          {template.key === "legionella" && form.readingType && form.readingType !== "N/A" && (
            <p className="muted" style={{ margin: 0 }}>
              For reference, HSE ACOP L8 guidance generally targets hot water ≥50°C at the outlet within 1 minute and cold water ≤20°C within 2 minutes — confirm the exact figures against your own risk assessment, as this varies by system.
            </p>
          )}
          <div className="flag-box">
            <label className="checkbox-row"><input type="checkbox" checked={form.flagged} onChange={(e) => set("flagged", e.target.checked)} /> Flag as failed / needs follow-up</label>
            {form.flagged && (<label>What did the check find?<textarea rows={2} value={form.flagDescription} onChange={(e) => set("flagDescription", e.target.value)} placeholder="e.g. Outlet reading 45°C, expected ≥50°C. Needs retest." /></label>)}
            {form.flagged && form.flagResolved && (<p className="muted" style={{ marginTop: 2 }}>Resolved {fmtDate(form.flagResolvedDate)}{form.flagResolvedNotes ? ` — ${form.flagResolvedNotes}` : ""}. Manage this from the Maintenance record it created.</p>)}
          </div>
        </>)}

        {mode === "incident" && (<>
          <label>Pest type<select value={form.title} onChange={(e) => set("title", e.target.value)}>{template.presets.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Location<input list="loc-presets" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Room 214, kitchen store" /></label>
          <div className="row-2">
            <label>Date reported<input type="date" value={form.dateReported} onChange={(e) => set("dateReported", e.target.value)} /></label>
            <label>Reported by<input value={form.people} onChange={(e) => set("people", e.target.value)} /></label>
          </div>
          <label>Action taken / needed<textarea rows={2} value={form.actionTaken} onChange={(e) => set("actionTaken", e.target.value)} /></label>
          <label>Status<select value={form.status} onChange={(e) => set("status", e.target.value)}><option>Open</option><option>In Progress</option><option>Resolved</option></select></label>
        </>)}

                {mode === "maintenance" && (<>
          <label>Issue<input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Broken light fitting, corridor 3" /></label>
          <label>Location<input list="loc-presets" value={form.location} onChange={(e) => set("location", e.target.value)} /></label>
          <div className="row-2">
            <label>Date raised<input type="date" value={form.dateRaised} onChange={(e) => set("dateRaised", e.target.value)} /></label>
            <label>Raised by<input value={form.people} onChange={(e) => set("people", e.target.value)} /></label>
          </div>
          <div className="row-2">
            <label>Priority<select value={form.priority} onChange={(e) => set("priority", e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label>Status <span className="muted">(resolving happens from the Resolve button, not here)</span>
              {form.status === "Resolved"
                ? <input value="Resolved" disabled />
                : <select value={form.status} onChange={(e) => set("status", e.target.value)}><option>Open</option><option>Awaiting</option></select>}
            </label>
          </div>
          {form.status === "Awaiting" && (
            <label>Who's been contacted? <span className="muted">(informational — whoever actually attends is recorded at resolution, even if it's someone else)</span>
              <select
                value={form.awaitingContractorId ? `contractor:${form.awaitingContractorId}` : form.awaitingStaffId ? `staff:${form.awaitingStaffId}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) { setForm((f) => ({ ...f, awaitingContractorId: null, awaitingStaffId: null, awaitingContactName: null })); return; }
                  const [kind, id] = val.split(":");
                  const name = kind === "contractor" ? contractors.find((c) => c.id === id)?.name : staff.find((s) => s.id === id)?.name;
                  setForm((f) => ({ ...f, awaitingContractorId: kind === "contractor" ? id : null, awaitingStaffId: kind === "staff" ? id : null, awaitingContactName: name || null }));
                }}>
                <option value="">Not specified</option>
                {contractors.length > 0 && <optgroup label="Contractors">{contractors.map((c) => <option key={c.id} value={`contractor:${c.id}`}>{c.__pulled ? `${c.name} (${PUB_VENUE_NAME})` : c.name}</option>)}</optgroup>}
                {staff.length > 0 && <optgroup label="Staff">{staff.map((s) => <option key={s.id} value={`staff:${s.id}`}>{s.name}{s.role ? ` — ${s.role}` : ""}</option>)}</optgroup>}
              </select>
            </label>
          )}
        </>)}

        {template.mode === "log" && (<>
          <label>Title<input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={template.key === "room_photo" ? "e.g. Bathroom ceiling, water stain" : "e.g. Routine housekeeping inspection"} /></label>
          <div className="row-2">
            <label>Date<input type="date" value={form.dateLogged} onChange={(e) => set("dateLogged", e.target.value)} /></label>
            <label>{template.key === "room_photo" ? "Taken by" : "Inspector"}<input value={form.people} onChange={(e) => set("people", e.target.value)} /></label>
          </div>
        </>)}

        {(form.status === "Resolved") && (mode === "incident" || mode === "maintenance") && (<>
          <label>Resolved on<input type="date" value={form.resolvedDate || todayStr()} onChange={(e) => set("resolvedDate", e.target.value)} /></label>
          <label>Resolution notes<textarea rows={2} value={form.resolvedNotes || ""} onChange={(e) => set("resolvedNotes", e.target.value)} /></label>
        </>)}

        <label>Tags <span className="muted">(comma-separated — contractor, supplier, certificate ref, anything you'll want to search by later)</span>
          <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. Acme Fire Ltd, CP12-4471" />
        </label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></label>
        </fieldset>
        <AttachmentsField recordId={form.id} attachments={attachments} setAttachments={setAttachments} readOnly={viewOnly} />
        <HistoryList history={record?.history} />
      </FormPage>
    </>
  );
}

/* ---------------------------------------------------------
   ASSET FORM PAGE
--------------------------------------------------------- */

export function ResolveFormPage({ record, contractors, staff, onClose, onSubmit }) {
  const isMaintenance = record.category === "maintenance";
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayStr());
  const [resolvedContractorId, setResolvedContractorId] = useState(null);
  const [resolvedStaffId, setResolvedStaffId] = useState(null);
  const [errors, setErrors] = useState([]);

  const handleSubmit = () => {
    if (isMaintenance && !resolvedContractorId && !resolvedStaffId) { setErrors(["Record who actually did the work — the person contacted and the person who attended aren't always the same, and this is what makes the record mean something later."]); return; }
    if (isMaintenance && !notes.trim()) { setErrors(["Describe the action taken."]); return; }
    setErrors([]);
    onSubmit({ notes, date, resolvedContractorId, resolvedStaffId });
  };

  return (
    <>
      <FormPage title="Mark resolved" onClose={onClose} footer={<button type="button" className="btn btn-primary" style={{ backgroundColor: "#2F6B4C", color: "#fff" }} onClick={handleSubmit}><CheckCircle2 size={15} /> Mark resolved</button>}>
        <ErrorBanner errors={errors} />
        <p className="muted" style={{ margin: 0 }}>{record.title}{record.location ? ` — ${record.location}` : ""}</p>
        <label>{isMaintenance ? "Actual completion date" : "Resolved on"} <span className="muted">{isMaintenance ? "(when the work was really done, not today's date)" : ""}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {isMaintenance && (
          <label>Resolved by <span className="muted">(who actually attended — not necessarily who was first contacted)</span>
            <select
              value={resolvedContractorId ? `contractor:${resolvedContractorId}` : resolvedStaffId ? `staff:${resolvedStaffId}` : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) { setResolvedContractorId(null); setResolvedStaffId(null); return; }
                const [kind, id] = val.split(":");
                setResolvedContractorId(kind === "contractor" ? id : null);
                setResolvedStaffId(kind === "staff" ? id : null);
              }}>
              <option value="">Select who did the work</option>
              {contractors.length > 0 && <optgroup label="Contractors">{contractors.map((c) => <option key={c.id} value={`contractor:${c.id}`}>{c.__pulled ? `${c.name} (${PUB_VENUE_NAME})` : c.name}</option>)}</optgroup>}
              {staff.length > 0 && <optgroup label="Staff">{staff.map((s) => <option key={s.id} value={`staff:${s.id}`}>{s.name}{s.role ? ` — ${s.role}` : ""}</option>)}</optgroup>}
            </select>
          </label>
        )}
        <label>{isMaintenance ? "Action taken" : "Resolution notes"}<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done to fix it" /></label>
      </FormPage>
    </>
  );
}

export function CorrectionRequestFormPage({ record, onSubmit, onClose }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = () => {
    if (!note.trim()) { setError("Describe what's wrong."); return; }
    onSubmit(record.id, note.trim());
  };
  return (
    <FormPage title={`Request correction — ${record.title}`} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={handleSubmit}><MessageSquareWarning size={15} /> Send request</button>}>
      <ErrorBanner errors={error ? [error] : []} />
      <p className="muted" style={{ marginTop: 0 }}>The original entry stays exactly as it is — this just flags it for a General Manager to review and fix. Your note becomes part of this record's permanent history either way.</p>
      <label>What's wrong?<textarea rows={4} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I logged the wrong date — should be 24 July, not 25 July" /></label>
    </FormPage>
  );
}

export function RoomLinkReview({ room, candidates, onLink, onSkip }) {
  const [checked, setChecked] = useState(() => Object.fromEntries(candidates.map((c) => [c.id, true])));
  const toggle = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  return (
    <FormPage
      title={`Link existing records to ${roomLabelText(room.roomNumber)}?`}
      onClose={onSkip}
      closeLabel="Skip"
      footer={<button type="button" className="btn btn-primary" onClick={() => onLink(candidates.filter((c) => checked[c.id]).map((c) => c.id))}><Link2 size={15} /> Link selected</button>}
    >
      <p className="muted" style={{ margin: 0 }}>Found {candidates.length} existing record{candidates.length === 1 ? "" : "s"} mentioning "{room.roomNumber}" in their location that aren't linked to any room yet.</p>
      <div className="ledger-table">
        {candidates.map((c) => (
          <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => toggle(c.id)}>
            <span><CheckSquare size={16} color={checked[c.id] ? "#197386" : "#C9C6BC"} /></span>
            <span className="mono-strong">{c.title}</span>
            <span className="muted">{c.location}</span>
            <span className="mono">{fmtDate(c.updatedAt || c.createdAt)}</span>
            <span><CategoryTag category={c.category} /></span>
          </div>
        ))}
      </div>
    </FormPage>
  );
}
