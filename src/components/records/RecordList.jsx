import React, { useState, useMemo, useContext } from "react";
import {
  Plus,
  Pencil,
  ListFilter,
  Eye,
  Share2,
  Archive,
  ArchiveRestore,
  MessageSquareWarning,
} from "lucide-react";
import { AttachChip, CategoryTag, SaveStatusBanner, Stamp } from "../shared/UI";
import { PUB_VENUE_NAME, RoleContext, STATUS_META, TEMPLATES, TEMPLATE_LIST, categoryFilterMatches } from "../../lib/constants";
import { checkResult, daysUntil, fmtDate, getDueDate, getEventDate, getStatus, hasPendingCorrection, isOpenIssue, isScheduleMode, matchesQuery, recordDetailText, recordWhoText, roomLabelText, todayStr } from "../../lib/helpers";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function RecordRow({ record, assets, rooms, contractors = [], staff = [], onView, onEdit, onDelete, onResolve, onRestore, onRequestCorrection }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const status = getStatus(record);
  const due = getDueDate(record);
  const showDue = isScheduleMode(record);
  const d = showDue ? daysUntil(due) : null;
  const dateCol = showDue ? fmtDate(due) : fmtDate(record.dateReported || record.dateRaised || record.completedDate || record.dateLogged || record.lastReviewed || record.periodKey);
  const who = recordWhoText(record, contractors, staff);
  const secondary = recordDetailText(record, assets, rooms, contractors, staff);
  const pending = hasPendingCorrection(record);
  // Pulled in read-only from the other venue's own deployment — it has no id in this venue's own
  // storage, so View/Edit/Delete/Resolve would either 404 or (worse) silently write a foreign
  // record into this venue's own data. Every action is suppressed; resolving still happens on the
  // other venue's own site, same as anywhere else this comes up.
  const pulled = !!record.__pulled;

  return (
    <div className="ledger-row">
      <span><CategoryTag category={record.category} /></span>
      <span className="mono-strong" style={pulled ? undefined : { cursor: "pointer" }} onClick={pulled ? undefined : () => onView(record)}>{record.title} <AttachChip count={record.attachments?.length} />{(record.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
      <span className="muted">{secondary}</span>
      <span className="muted">{who}</span>
      <span className="mono">{dateCol}{showDue && <span className="days-hint">{d < 0 ? ` · ${Math.abs(d)}d overdue` : ` · in ${d}d`}</span>}</span>
      <span><Stamp status={status} dense />{record.flagged && !record.flagResolved && <span className="flag-tag">Flagged</span>}{record.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}{pending && <span className="flag-tag" style={{ color: "#2A3A6E", background: "#EEF0FA" }}>Correction requested</span>}</span>
      <span className="row-actions">
        {pulled && <span className="flag-tag" style={{ color: "#2A3A6E", background: "#EEF0FA", fontSize: 12.5, padding: "5px 10px", fontWeight: 600, margin: 0 }}>{PUB_VENUE_NAME}</span>}
        {!pulled && !record.archived && isOpenIssue(record) && <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={() => onResolve(record)}>Resolve</button>}
        {!pulled && <button className="icon-btn" onClick={() => onView(record)}><Eye size={15} /></button>}
        {!pulled && !record.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(record)}><Pencil size={15} /></button>}
        {!pulled && !record.archived && !canEdit && onRequestCorrection && <button className="icon-btn" onClick={() => onRequestCorrection(record)} title="Request a correction"><MessageSquareWarning size={15} /></button>}
        {!pulled && canDelete && (record.archived
          ? <button className="icon-btn" onClick={() => onRestore(record.id)}><ArchiveRestore size={15} /></button>
          : <button className="icon-btn" onClick={() => onDelete(record.id)}><Archive size={15} /></button>)}
      </span>
    </div>
  );
}

export function RecordTable({ records, assets, rooms = [], contractors = [], staff = [], onView, onEdit, onDelete, onResolve, onRestore, onRequestCorrection, emptyText }) {
  if (records.length === 0) return <div className="empty-state">{emptyText}</div>;
  return (
    <div className="ledger-table">
      <div className="ledger-row ledger-row--head"><span>Type</span><span>Title</span><span>Detail</span><span>Who</span><span>Date</span><span>Status</span><span></span></div>
      {records.map((r) => <RecordRow key={r.id} record={r} assets={assets} rooms={rooms} contractors={contractors} staff={staff} onView={onView} onEdit={onEdit} onDelete={onDelete} onResolve={onResolve} onRestore={onRestore} onRequestCorrection={onRequestCorrection} />)}
    </div>
  );
}

export function Ledger({ records, assets, rooms, contractors, staff, venuePull, filters, setFilters, onView, onEdit, onDelete, onRestore, onResolve, onRequestCorrection, onAdd, onExportFallback, branding }) {
  const { role } = useContext(RoleContext);
  const [showArchived, setShowArchived] = useState(false);
  // Pulled Maintenance/Pest issues from the other venue merge straight into this same list —
  // id is namespaced (it belongs to the other venue's own storage, never this one's), and the
  // asset/room/contractor/staff context travels alongside so recordDetailText/recordWhoText
  // resolve correctly. IDs from two independent deployments won't collide in practice, so
  // concatenating rather than keying by venue is enough — no per-row context switching needed.
  // General Manager only, same as the switcher link and the Home dashboard's own pub section —
  // not because this data is sensitive, but for one consistent boundary around the whole feature.
  const pubActive = role === "General Manager" && !!venuePull?.available;
  const pulledRecords = useMemo(() => (pubActive ? venuePull.issues.map((r) => ({ ...r, id: `pull:${r.id}`, __pulled: true })) : []), [pubActive, venuePull]);
  const allRecords = useMemo(() => [...records, ...pulledRecords], [records, pulledRecords]);
  const allAssets = useMemo(() => [...assets, ...(pubActive ? venuePull.assets : [])], [assets, pubActive, venuePull]);
  const allRooms = useMemo(() => [...rooms, ...(pubActive ? venuePull.rooms : [])], [rooms, pubActive, venuePull]);
  const allContractors = useMemo(() => [...contractors, ...(pubActive ? venuePull.contractors : [])], [contractors, pubActive, venuePull]);
  const allStaff = useMemo(() => [...staff, ...(pubActive ? venuePull.staff : [])], [staff, pubActive, venuePull]);
  const archivedCount = useMemo(() => records.filter((r) => r.archived).length, [records]);
  const filtered = useMemo(() => {
    let list = allRecords.filter((r) =>
      (showArchived ? r.archived : !r.archived) &&
      (filters.category === "all" || categoryFilterMatches(r, filters.category)) &&
      matchesQuery(r, filters.query, allRooms, allContractors) &&
      (filters.status === "all" || (filters.status === "open-issues" ? isOpenIssue(r) : getStatus(r) === filters.status))
    );
    const rank = { overdue: 0, open: 0, "review-overdue": 0, "in-progress": 1, "due-soon": 1, "review-due": 1, compliant: 3, resolved: 3, logged: 3, reviewed: 3 };
    return list.sort((a, b) => (rank[getStatus(a)] ?? 2) - (rank[getStatus(b)] ?? 2) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [allRecords, filters, showArchived, allRooms, allContractors]);

  const filterLabel = [
    filters.category !== "all" ? TEMPLATES[filters.category].label : null,
    filters.status !== "all" ? (filters.status === "open-issues" ? "Open issues" : STATUS_META[filters.status]?.label) : null,
    filters.query ? `"${filters.query}"` : null,
  ].filter(Boolean).join(" · ") || "All records";

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const title = `Compliance Ledger — ${filterLabel}`;
    const subtitle = `Saved ${fmtDate(todayStr())} · ${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    const columns = [
      { key: "type", label: "Type", width: 0.1 },
      { key: "detail", label: "Detail", width: 0.24 },
      { key: "who", label: "Who", width: 0.16 },
      { key: "date", label: "Date", width: 0.13 },
      { key: "result", label: "Result", width: 0.13 },
      { key: "status", label: "Status", width: 0.24, chip: true },
    ];
    // One heading + table per group, rather than one flat list — so a filter with several
    // different tasks in it reads as separate, clearly-labelled groups instead of one
    // undifferentiated table that only gets harder to scan as more records pile up under it.
    // Grouped by room when a record has one — for room-linked issues (Maintenance, Pest, an
    // Equipment check against a room's asset…) that's what's actually useful to scan by; a free-typed
    // title groups near-identical problems inconsistently and tells a reader nothing about where the
    // work is. Records with no room (Staff Training, a whole-building Fire Safety check…) still group
    // by title, since there's no room axis to use instead.
    const groups = new Map();
    for (const r of filtered) {
      const room = r.roomId ? allRooms.find((rm) => rm.id === r.roomId) : null;
      const key = room ? `room:${room.id}` : `title:${r.title || "Untitled"}`;
      if (!groups.has(key)) groups.set(key, { heading: room ? roomLabelText(room.roomNumber) : (r.title || "Untitled"), isRoomGroup: !!room, records: [] });
      groups.get(key).records.push(r);
    }
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => groups.get(a).heading.localeCompare(groups.get(b).heading, undefined, { numeric: true }));
    const sections = [];
    for (const key of sortedKeys) {
      const { heading, isRoomGroup, records } = groups.get(key);
      sections.push({ type: "heading", text: heading });
      // "Completed" would be a lie for a still-open Maintenance/Pest issue — getEventDate returns
      // when it was raised/reported for those, since there's no completion date yet. Once resolved,
      // show the actual completion date (resolvedDate) instead of the original raised/reported date.
      // When grouped by room, the title is no longer the heading, so it has to go in Detail instead —
      // otherwise a room full of issues would just repeat the same asset/location with no indication
      // of what's actually wrong with each one.
      const rows = records.map((r) => {
        const detail = recordDetailText(r, allAssets, allRooms, allContractors, allStaff);
        const type = TEMPLATES[r.category]?.short || "";
        return {
          type: r.__pulled ? `${type} (${PUB_VENUE_NAME})` : type, detail: isRoomGroup ? `${r.title || "Untitled"} — ${detail}` : detail,
          who: recordWhoText(r, allContractors, allStaff), date: fmtDate(r.resolvedDate && getStatus(r) === "resolved" ? r.resolvedDate : getEventDate(r)),
          result: checkResult(r), status: getStatus(r),
        };
      });
      sections.push({ type: "table", columns, rows });
    }
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections });
    const result = await exportPdfReport(`compliance-ledger-${todayStr()}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><ListFilter size={22} color="#197386" /><h2>All records</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New record</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="filter-rail">
        <div className="chip-row">
          <button className={"chip" + (filters.category === "all" ? " chip--active" : "")} onClick={() => setFilters((f) => ({ ...f, category: "all" }))}>All</button>
          {TEMPLATE_LIST.map((t) => (
            <button key={t.key} className={"chip" + (filters.category === t.key ? " chip--active" : "")} style={filters.category === t.key ? { backgroundColor: t.accent, borderColor: t.accent, color: "#fff" } : undefined} onClick={() => setFilters((f) => ({ ...f, category: t.key }))}>{t.short}</button>
          ))}
        </div>
        <div className="chip-row">
          {[["all", "Any status"], ["overdue", "Overdue"], ["due-soon", "Due soon"], ["review-overdue", "Review overdue"], ["review-due", "Review due"], ["open-issues", "Open issues"], ["compliant", "Compliant"], ["resolved", "Resolved"]].map(([k, l]) => (
            <button key={k} className={"chip chip--status" + (filters.status === k ? " chip--active" : "")} onClick={() => setFilters((f) => ({ ...f, status: k }))}>{l}</button>
          ))}
          {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
        </div>
      </div>
      <RecordTable records={filtered} assets={allAssets} rooms={allRooms} contractors={allContractors} staff={allStaff} onView={onView} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} onResolve={onResolve} onRequestCorrection={onRequestCorrection} emptyText={showArchived ? "No archived records." : "No records match this filter yet."} />
    </div>
  );
}
