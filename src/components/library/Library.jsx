import React, { useMemo } from "react";
import {
  Plus,
  ArrowLeft,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { RecordTable } from "../records/RecordList";
import { ReqCategoryTag, Stamp } from "../shared/UI";
import { REQUIREMENTS, TEMPLATES } from "../../lib/constants";
import { certificateStatus, fmtDate, matchRequirement, requirementStatus } from "../../lib/helpers";

export function LibraryDisclaimer() {
  return (
    <div className="library-disclaimer">
      <AlertCircle size={15} />
      <p>General guidance to help you get organised — not legal advice. Requirements vary by property, size, and location. Confirm specifics with your fire risk assessor, environmental health officer, or a qualified H&S consultant.</p>
    </div>
  );
}

export function LibraryList({ records, certificates, onOpen, catFilter, setCatFilter }) {
  const rows = useMemo(() => REQUIREMENTS.map((req) => {
    const matched = matchRequirement(req, records, certificates);
    return { req, matched, status: requirementStatus(req, matched) };
  }), [records, certificates]);
  const filtered = catFilter === "all" ? rows : catFilter === "general" ? rows.filter((r) => r.req.category === null) : rows.filter((r) => r.req.category === catFilter);
  const missingCount = rows.filter((r) => r.status === "missing").length;
  const gapCount = rows.filter((r) => r.status === "not-tracked").length;
  const categories = ["fire", "legionella", "equipment", "risk", "training", "pest"];

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><BookOpen size={22} color="#197386" /><h2>Compliance Library</h2></div>
      </div>
      <LibraryDisclaimer />
      <div className="stat-row" style={{ marginTop: 18 }}>
        <div className="stat-card"><span className="stat-num">{rows.length}</span><span className="stat-label">Requirements in the library</span></div>
        <div className="stat-card" style={{ borderTop: "3px solid #A8402F" }}><span className="stat-num">{missingCount}</span><span className="stat-label">Never logged — start here</span></div>
        <div className="stat-card" style={{ borderTop: "3px solid #8A6D1F" }}><span className="stat-num">{gapCount}</span><span className="stat-label">No record type in this app yet</span></div>
      </div>
      <div className="filter-rail">
        <div className="chip-row">
          <button className={"chip" + (catFilter === "all" ? " chip--active" : "")} onClick={() => setCatFilter("all")}>All</button>
          {categories.map((c) => (
            <button key={c} className={"chip" + (catFilter === c ? " chip--active" : "")} style={catFilter === c ? { backgroundColor: TEMPLATES[c].accent, borderColor: TEMPLATES[c].accent, color: "#fff" } : undefined} onClick={() => setCatFilter(c)}>{TEMPLATES[c].short}</button>
          ))}
          <button className={"chip" + (catFilter === "general" ? " chip--active" : "")} onClick={() => setCatFilter("general")}>General</button>
        </div>
      </div>
      <div className="ledger-table">
        <div className="ledger-row ledger-row--flat ledger-row--head"><span>Category</span><span>Requirement</span><span>Frequency</span><span>Records</span><span>Status</span></div>
        {filtered.map(({ req, matched, status }) => (
          <div key={req.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpen(req.id)}>
            <span><ReqCategoryTag category={req.category} /></span>
            <span className="mono-strong">{req.title}</span>
            <span className="muted">{req.frequency}</span>
            <span className="muted">{matched.records.length + matched.certificates.length}</span>
            <span><Stamp status={status} dense /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RequirementDetail({ req, records, certificates, onBack, onLogNow, onViewRecord, onEditRecord, onDeleteRecord, onResolve, onOpenCertificate }) {
  const matched = matchRequirement(req, records, certificates);
  const status = requirementStatus(req, matched);
  const template = req.category ? TEMPLATES[req.category] : null;
  return (
    <div className="module-view">
      <button className="btn btn-ghost" style={{ padding: "4px 0", marginBottom: 10 }} onClick={onBack}><ArrowLeft size={15} /> Back to library</button>
      <div className="module-header">
        <div className="module-title"><ReqCategoryTag category={req.category} /><h2>{req.title}</h2></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Stamp status={status} />
          {req.matchMode !== "none" && <button className="btn btn-primary" style={{ backgroundColor: template?.accent, color: "#fff" }} onClick={() => onLogNow(req)}><Plus size={16} /> Log this now</button>}
        </div>
      </div>
      <div className="req-detail-grid">
        <div><span className="field-label">What to keep</span><p>{req.whatToKeep}</p></div>
        <div><span className="field-label">Why it's required</span><p>{req.why}</p></div>
        <div><span className="field-label">Recommended frequency</span><p>{req.frequency}</p></div>
        <div><span className="field-label">Evidence required</span><p>{req.evidence}</p></div>
        <div><span className="field-label">Retention period</span><p>{req.retention}</p></div>
        <div><span className="field-label">Legislation / guidance</span><p>{req.legislation}</p></div>
      </div>
      {req.appNote && <p className="muted" style={{ fontStyle: "italic" }}>{req.appNote}</p>}
      {req.certTypes && (
        <p className="muted" style={{ marginTop: -4 }}>This also recognises evidence filed in the Certificate Register as "{req.certTypes.join('" or "')}" — you don't need to log it twice.</p>
      )}
      {matched.certificates.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "18px 0 10px" }}>Linked certificates ({matched.certificates.length})</h3>
          <div className="ledger-table">
            {matched.certificates.map((c) => (
              <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenCertificate(c.id)}>
                <span className="mono-strong">{c.title}</span>
                <span className="muted">{c.certType}</span>
                <span className="muted">{c.issuer || "—"}</span>
                <span className="mono">{fmtDate(c.expiryDate)}</span>
                <span><Stamp status={certificateStatus(c)} dense /></span>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "18px 0 10px" }}>Linked records ({matched.records.length})</h3>
      <RecordTable records={matched.records} assets={[]} onView={onViewRecord} onEdit={onEditRecord} onDelete={onDeleteRecord} onResolve={onResolve} emptyText="Nothing logged against this requirement yet." />
    </div>
  );
}
