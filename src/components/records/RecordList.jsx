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
import { RoleContext, STATUS_META, TEMPLATES, TEMPLATE_LIST, categoryFilterMatches } from "../../lib/constants";
import { daysUntil, fmtDate, getDueDate, getEventDate, getStatus, hasPendingCorrection, isOpenIssue, isScheduleMode, matchesQuery, recordDetailText, recordWhoText, todayStr } from "../../lib/helpers";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function RecordRow({ record, assets, rooms, contractors = [], staff = [], onView, onEdit, onDelete, onResolve, onRestore, onRequestCorrection }) {
  const { canDelete, canEdit } = useContext(RoleContext);
  const status = getStatus(record);
  const due = getDueDate(record);
  const showDue = isScheduleMode(record);
  const d = showDue ? daysUntil(due) : null;
  const dateCol = showDue ? fmtDate(due) : fmtDate(record.dateReported || record.dateRaised || record.completedDate || record.dateLogged || record.periodKey);
  const who = recordWhoText(record, contractors, staff);
  const secondary = recordDetailText(record, assets, rooms, contractors, staff);
  const pending = hasPendingCorrection(record);

  return (
    <div className="ledger-row">
      <span><CategoryTag category={record.category} /></span>
      <span className="mono-strong" style={{ cursor: "pointer" }} onClick={() => onView(record)}>{record.title} <AttachChip count={record.attachments?.length} />{(record.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
      <span className="muted">{secondary}</span>
      <span className="muted">{who}</span>
      <span className="mono">{dateCol}{showDue && <span className="days-hint">{d < 0 ? ` · ${Math.abs(d)}d overdue` : ` · in ${d}d`}</span>}</span>
      <span><Stamp status={status} dense />{record.flagged && !record.flagResolved && <span className="flag-tag">Flagged</span>}{record.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}{pending && <span className="flag-tag" style={{ color: "#2A3A6E", background: "#EEF0FA" }}>Correction requested</span>}</span>
      <span className="row-actions">
        {!record.archived && isOpenIssue(record) && <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={() => onResolve(record)}>Resolve</button>}
        <button className="icon-btn" onClick={() => onView(record)}><Eye size={15} /></button>
        {!record.archived && canEdit && <button className="icon-btn" onClick={() => onEdit(record)}><Pencil size={15} /></button>}
        {!record.archived && !canEdit && onRequestCorrection && <button className="icon-btn" onClick={() => onRequestCorrection(record)} title="Request a correction"><MessageSquareWarning size={15} /></button>}
        {canDelete && (record.archived
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

export function Ledger({ records, assets, rooms, contractors, staff, filters, setFilters, onView, onEdit, onDelete, onRestore, onResolve, onRequestCorrection, onAdd, onExportFallback, branding }) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = useMemo(() => records.filter((r) => r.archived).length, [records]);
  const filtered = useMemo(() => {
    let list = records.filter((r) =>
      (showArchived ? r.archived : !r.archived) &&
      (filters.category === "all" || categoryFilterMatches(r, filters.category)) &&
      matchesQuery(r, filters.query, rooms, contractors) &&
      (filters.status === "all" || (filters.status === "open-issues" ? isOpenIssue(r) : getStatus(r) === filters.status))
    );
    const rank = { overdue: 0, open: 0, "in-progress": 1, "due-soon": 1, compliant: 3, resolved: 3, logged: 3 };
    return list.sort((a, b) => (rank[getStatus(a)] ?? 2) - (rank[getStatus(b)] ?? 2) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [records, filters, showArchived]);

  const filterLabel = [
    filters.category !== "all" ? TEMPLATES[filters.category].label : null,
    filters.status !== "all" ? (filters.status === "open-issues" ? "Open issues" : STATUS_META[filters.status]?.label) : null,
    filters.query ? `"${filters.query}"` : null,
  ].filter(Boolean).join(" · ") || "All records";

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const title = `Compliance Ledger — ${filterLabel}`;
    const subtitle = `Saved ${fmtDate(todayStr())} · ${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    const rows = filtered.map((r) => {
      const showDue = isScheduleMode(r);
      return {
        type: TEMPLATES[r.category]?.short || "", title: r.title, detail: recordDetailText(r, assets, rooms, contractors, staff),
        who: recordWhoText(r, contractors, staff), date: fmtDate(showDue ? getDueDate(r) : getEventDate(r)), status: getStatus(r),
      };
    });
    const columns = [
      { key: "type", label: "Type", width: 0.12 },
      { key: "title", label: "Title", width: 0.22 },
      { key: "detail", label: "Detail", width: 0.24 },
      { key: "who", label: "Who", width: 0.14 },
      { key: "date", label: "Date", width: 0.12 },
      { key: "status", label: "Status", width: 0.16, chip: true },
    ];
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
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
          {[["all", "Any status"], ["overdue", "Overdue"], ["due-soon", "Due soon"], ["open-issues", "Open issues"], ["compliant", "Compliant"], ["resolved", "Resolved"]].map(([k, l]) => (
            <button key={k} className={"chip chip--status" + (filters.status === k ? " chip--active" : "")} onClick={() => setFilters((f) => ({ ...f, status: k }))}>{l}</button>
          ))}
          {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
        </div>
      </div>
      <RecordTable records={filtered} assets={assets} rooms={rooms} contractors={contractors} staff={staff} onView={onView} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} onResolve={onResolve} onRequestCorrection={onRequestCorrection} emptyText={showArchived ? "No archived records." : "No records match this filter yet."} />
    </div>
  );
}
