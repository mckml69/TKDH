import React, { useMemo, useEffect, useState } from "react";
import {
  X,
  ChevronRight,
  Paperclip,
  CheckCircle2,
  ArrowLeft,
  FileSearch,
  Archive,
  History,
} from "lucide-react";
import { historyLine } from "../../lib/auditTrail";
import { STATUS_META, TEMPLATES } from "../../lib/constants";
import { daysUntil, fmtDate, getDueDate, getEventDate, getStatus, isScheduleMode } from "../../lib/helpers";

export function Stamp({ status, dense }) {
  const meta = STATUS_META[status];
  return <span className={"stamp" + (dense ? " stamp--dense" : "")} style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>;
}

export function AttachChip({ count }) {
  if (!count) return null;
  return <span className="attach-chip"><Paperclip size={11} /> {count}</span>;
}

export function CategoryTag({ category }) {
  const t = TEMPLATES[category];
  return <span className="cat-tag" style={{ color: t.accent, borderColor: t.accent }}>{t.short}</span>;
}

export function ReqCategoryTag({ category }) {
  if (!category) return <span className="cat-tag" style={{ color: "#6E6A61", borderColor: "#6E6A61" }}>General</span>;
  return <CategoryTag category={category} />;
}

export function ErrorBanner({ errors }) {
  if (!errors || errors.length === 0) return null;
  return <div className="form-error-banner">{errors.map((e) => <div key={e}>{e}</div>)}</div>;
}

export function HistoryList({ history }) {
  const entries = (history || []).slice().reverse();
  if (entries.length === 0) return null;
  return (
    <div className="history-list">
      <span className="field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><History size={13} /> History</span>
      {entries.map((e, i) => (
        <div className="history-entry" key={i}>
          <div className="history-entry-head">{historyLine(e)}</div>
          {e.note && <div className="history-change">"{e.note}"</div>}
          {e.changes && e.changes.map((c, ci) => (
            <div key={ci} className="history-change">{c.field}: <span className="history-from">{c.from}</span> → <span className="history-to">{c.to}</span></div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SaveStatusBanner({ status }) {
  if (!status) return null;
  if (status === "shared") return <div className="print-hint"><CheckCircle2 size={15} /> Shared successfully.</div>;
  if (status === "downloaded") return <div className="print-hint"><CheckCircle2 size={15} /> Downloaded — check your device's downloads or files.</div>;
  if (status === "cancelled") return null;
  return null;
}

export function PatternCallout({ icon: Icon, children }) {
  return (
    <div className="pattern-callout"><Icon size={15} /> <span>{children}</span></div>
  );
}

export function DashboardSection({ title, icon: Icon, color, count, emptyText, onViewAll, children }) {
  return (
    <div className="feed-section">
      <div className="feed-section-head">
        <h3><Icon size={16} color={color} /> {title} <span className="feed-count">{count}</span></h3>
        {count > 0 && onViewAll && <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: "4px 8px" }} onClick={onViewAll}>View all <ChevronRight size={13} /></button>}
      </div>
      {count === 0 ? <p className="empty-state" style={{ padding: 14 }}>{emptyText}</p> : children}
    </div>
  );
}

export function FeedSection({ title, icon: Icon, color, items, assets, emptyText, onViewAll, onEdit }) {
  return (
    <div className="feed-section">
      <div className="feed-section-head">
        <h3><Icon size={16} color={color} /> {title} <span className="feed-count">{items.length}</span></h3>
        {items.length > 0 && <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: "4px 8px" }} onClick={onViewAll}>View all <ChevronRight size={13} /></button>}
      </div>
      {items.length === 0 ? <p className="empty-state" style={{ padding: 14 }}>{emptyText}</p> : (
        <div className="ledger-table">
          {items.slice(0, 5).map((r) => {
            const status = getStatus(r);
            const due = getDueDate(r);
            const showDue = isScheduleMode(r);
            const d = showDue ? daysUntil(due) : null;
            return (
              <div className="ledger-row ledger-row--flat" key={r.id} onClick={() => onEdit(r)} style={{ cursor: "pointer" }}>
                <span><CategoryTag category={r.category} /></span>
                <span className="mono-strong">{r.title}</span>
                <span className="muted">{r.location || r.detail || "—"}</span>
                <span className="mono">{showDue ? `${fmtDate(due)}${d < 0 ? ` · ${Math.abs(d)}d overdue` : ` · in ${d}d`}` : fmtDate(r.updatedAt)}</span>
                <span><Stamp status={status} dense /></span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FormPage({ title, onClose, closeLabel, children, footer }) {
  return (
    <div className="form-page">
      <div className="form-page-head">
        <h3>{title}</h3>
        <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="form-page-body">{children}</div>
      <div className="form-page-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{closeLabel || "Cancel"}</button>
        {footer}
      </div>
    </div>
  );
}

export function ConfirmDeletePage({ message, onCancel, onConfirm }) {
  return (
    <FormPage title="Confirm archive" onClose={onCancel} closeLabel="Cancel" footer={<button type="button" className="btn" style={{ backgroundColor: "#B8862B", color: "#fff" }} onClick={onConfirm}><Archive size={15} /> Archive</button>}>
      <p style={{ margin: 0 }}>{message}</p>
    </FormPage>
  );
}

/** For the rare browser where both the native share sheet and a direct file download are
    blocked — renders the generated PDF inline so the user can still view/save/print it via
    the browser's own PDF controls. */
export function ReportFallback({ title, pdfBytes, onBack }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [pdfBytes]);

  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back</button>
      <div className="module-header"><div className="module-title"><FileSearch size={22} color="#16263D" /><h2>{title}</h2></div></div>
      <div className="print-hint" style={{ marginBottom: 16 }}>
        Automatic saving isn't available in this browser. Use your browser's own Print/Save controls below, or the download link.
      </div>
      {url && (
        <>
          <embed src={url} type="application/pdf" className="report-fallback-embed" style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 8 }} />
          <a href={url} download={`${title || "report"}.pdf`} className="btn btn-ghost" style={{ marginTop: 10 }}>Download the PDF</a>
        </>
      )}
    </div>
  );
}

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

export function TemplatePickerPage({ templates, onPick, onClose }) {
  return (
    <FormPage title="New record — choose a type" onClose={onClose} footer={null}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {templates.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" className="template-card" style={{ borderLeft: `4px solid ${t.accent}` }} onClick={() => onPick(t)}>
              <Icon size={20} color={t.accent} /><span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </FormPage>
  );
}
