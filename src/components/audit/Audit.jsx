import React, { useState } from "react";
import {
  Pencil,
  ChevronRight,
  Clock,
  AlertCircle,
  ListChecks,
  ChevronLeft,
  FileSearch,
  Share2,
} from "lucide-react";
import { LibraryDisclaimer } from "../library/Library";
import { Ledger } from "../records/RecordList";
import { ReqCategoryTag, SaveStatusBanner, Stamp } from "../shared/UI";
import { ANSWER_OPTIONS, AUDIT_CATEGORIES, PRIORITY_ORDER, REQUIREMENTS, TEMPLATES, auditCategoryLabel, getAuditPriority, getImmediateAction } from "../../lib/constants";
import { fmtDate, todayStr } from "../../lib/helpers";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";

export function AuditIntro({ audit, onStart, onResume, onViewReport }) {
  const answered = Object.keys(audit.responses || {}).length;
  const inProgress = answered > 0 && !audit.completedAt;
  return (
    <div className="module-view">
      <div className="module-header"><div className="module-title"><ListChecks size={22} color="#16263D" /><h2>First Day Audit</h2></div></div>
      <LibraryDisclaimer />
      <div className="audit-intro-card">
        <h3>Built for taking over with missing paperwork</h3>
        <p>Walk through every requirement in the Compliance Library and answer one simple question for each: does this already exist, and is it current? At the end you get a gap report — what's missing, what to fix first, and what to start logging from today.</p>
        <p className="muted">This takes about 10–15 minutes for all {REQUIREMENTS.length} requirements. You can stop and resume any time — nothing is lost.</p>
        {audit.completedAt && <p className="muted">Last completed {fmtDate(audit.completedAt)}.</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {inProgress ? (
            <button className="btn btn-primary" onClick={onResume}><ChevronRight size={16} /> Resume audit ({answered}/{REQUIREMENTS.length} answered)</button>
          ) : (
            <button className="btn btn-primary" onClick={onStart}><ListChecks size={16} /> {audit.completedAt ? "Redo audit" : "Start audit"}</button>
          )}
          {audit.completedAt && <button className="btn btn-ghost" onClick={onViewReport}><FileSearch size={16} /> View last report</button>}
        </div>
      </div>
    </div>
  );
}

export function AuditWizardStep({ stepIndex, responses, onAnswer, onNext, onBack, onFinish }) {
  const category = AUDIT_CATEGORIES[stepIndex];
  const items = category === "general" ? REQUIREMENTS.filter((r) => r.category === null) : REQUIREMENTS.filter((r) => r.category === category);
  const isLast = stepIndex === AUDIT_CATEGORIES.length - 1;
  const totalAnswered = Object.keys(responses).length;

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><ListChecks size={22} color="#16263D" /><h2>{auditCategoryLabel(category)}</h2></div>
        <span className="muted">Step {stepIndex + 1} of {AUDIT_CATEGORIES.length} · {totalAnswered}/{REQUIREMENTS.length} answered overall</span>
      </div>
      <div className="audit-question-list">
        {items.map((req) => (
          <div key={req.id} className="audit-question">
            <div className="audit-question-title">{req.title}<span className="muted"> — {req.whatToKeep}</span></div>
            <div className="chip-row">
              {ANSWER_OPTIONS.map((opt) => (
                <button key={opt.key} className={"chip" + (responses[req.id] === opt.key ? " chip--active" : "")}
                  style={responses[req.id] === opt.key ? { backgroundColor: opt.color, borderColor: opt.color, color: "#fff" } : undefined}
                  onClick={() => onAnswer(req.id, opt.key)}>{opt.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="form-page-foot" style={{ border: "none", padding: "18px 0 0" }}>
        <button className="btn btn-ghost" onClick={onBack} disabled={stepIndex === 0}><ChevronLeft size={15} /> Back</button>
        {isLast
          ? <button className="btn btn-primary" onClick={onFinish}><FileSearch size={16} /> Generate gap report</button>
          : <button className="btn btn-primary" onClick={onNext}>Next <ChevronRight size={15} /></button>}
      </div>
    </div>
  );
}

export function AuditReport({ audit, records, onEditWizard, onOpenRequirement, onExportFallback, branding }) {
  const rows = REQUIREMENTS.map((req) => ({ req, answer: audit.responses[req.id] || "unanswered", priority: getAuditPriority(req) }));
  const gaps = rows.filter((r) => r.answer === "no" || r.answer === "unsure" || r.answer === "unanswered")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const partial = rows.filter((r) => r.answer === "yes-outdated");
  const ok = rows.filter((r) => r.answer === "yes-current");
  const highGaps = gaps.filter((r) => r.priority === "high");

  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = async () => {
    const columns = [
      { key: "category", label: "Category", width: 0.18 },
      { key: "requirement", label: "Requirement", width: 0.28 },
      { key: "status", label: "Status", width: 0.16 },
      { key: "next", label: "Next step", width: 0.38 },
    ];
    const rowsFor = (list) => list.map(({ req, answer }) => ({
      category: req.category ? TEMPLATES[req.category].short : "General",
      requirement: req.title,
      status: answer === "unanswered" ? "Not answered" : answer === "unsure" ? "Not sure" : "Missing",
      next: getImmediateAction(req),
    }));
    const title = "First Day Compliance Audit — Gap Report";
    const sections = [
      { type: "heading", text: `Do these first (${highGaps.length})` },
      { type: "table", columns, rows: rowsFor(highGaps) },
      { type: "heading", text: `Other gaps (${gaps.length - highGaps.length})` },
      { type: "table", columns, rows: rowsFor(gaps.filter((r) => r.priority !== "high")) },
      { type: "heading", text: `Needs review — exists but outdated (${partial.length})` },
      { type: "table", columns, rows: rowsFor(partial) },
      { type: "heading", text: `Confirmed in place (${ok.length})` },
      { type: "table", columns, rows: rowsFor(ok) },
      { type: "heading", text: "What to build from today onward" },
      { type: "paragraph", text: "Don't try to fabricate history you don't have — an assessor or inspector would rather see an honest, dated start than backfilled records." },
      { type: "paragraph", text: "1. Book the high-priority gaps above first — a Fire Risk Assessment and Legionella Risk Assessment are the two foundation documents almost everything else depends on." },
      { type: "paragraph", text: "2. From today, log every check, service, certificate, and training session as it happens — that's the audit trail an inspector actually wants to see." },
      { type: "paragraph", text: "3. Use the Compliance Library any time you're unsure what's expected, and revisit this audit in a few months to see the gap list shrink." },
    ];
    const subtitle = `Saved ${fmtDate(audit.completedAt || todayStr())}`;
    const pdfBytes = await buildRegisterPdf({ title, subtitle, branding, sections });
    const result = await exportPdfReport(`first-day-audit-${todayStr()}.pdf`, title, pdfBytes);
    if (result.status === "fallback") onExportFallback(result);
    else setSaveStatus(result.status);
  };

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><FileSearch size={22} color="#16263D" /><h2>Gap report</h2></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleSave}><Share2 size={15} /> Save report</button>
          <button className="btn btn-ghost" onClick={onEditWizard}><Pencil size={15} /> Edit answers</button>
        </div>
      </div>
      <SaveStatusBanner status={saveStatus} />
      <div className="stat-row" style={{ marginTop: 18 }}>
        <div className="stat-card" style={{ borderTop: "3px solid #A8402F" }}><span className="stat-num">{gaps.length}</span><span className="stat-label">Gaps found</span></div>
        <div className="stat-card" style={{ borderTop: "3px solid #B8862B" }}><span className="stat-num">{partial.length}</span><span className="stat-label">Exists but outdated</span></div>
        <div className="stat-card" style={{ borderTop: "3px solid #2F6B4C" }}><span className="stat-num">{ok.length}</span><span className="stat-label">Confirmed in place</span></div>
      </div>

      <div className="feed-section">
        <div className="feed-section-head"><h3><AlertCircle size={16} color="#A8402F" /> Do these first <span className="feed-count">{highGaps.length}</span></h3></div>
        {highGaps.length === 0 ? <p className="empty-state">No high-priority gaps — the essentials are covered.</p> : (
          <div className="ledger-table">
            {highGaps.map(({ req, answer }) => (
              <div key={req.id} className="audit-report-row" onClick={() => onOpenRequirement(req.id)}>
                <div className="audit-report-row-head">
                  <ReqCategoryTag category={req.category} />
                  <span className="mono-strong">{req.title}</span>
                  <span className="flag-tag" style={{ marginLeft: "auto" }}>{answer === "unanswered" ? "Not answered" : answer === "unsure" ? "Not sure" : "Missing"}</span>
                </div>
                <p className="muted">{getImmediateAction(req)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="feed-section">
        <div className="feed-section-head"><h3><Clock size={16} color="#B8862B" /> Other gaps to work through <span className="feed-count">{gaps.length - highGaps.length}</span></h3></div>
        {gaps.length - highGaps.length === 0 ? <p className="empty-state">Nothing else outstanding.</p> : (
          <div className="ledger-table">
            <div className="ledger-row ledger-row--flat ledger-row--head"><span>Category</span><span>Requirement</span><span>Status</span><span>Next step</span></div>
            {gaps.filter((r) => r.priority !== "high").map(({ req, answer }) => (
              <div key={req.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenRequirement(req.id)}>
                <span><ReqCategoryTag category={req.category} /></span>
                <span className="mono-strong">{req.title}</span>
                <span className="muted">{answer === "unanswered" ? "Not answered" : answer === "unsure" ? "Not sure" : "Missing"}</span>
                <span className="muted">{getImmediateAction(req)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {partial.length > 0 && (
        <div className="feed-section">
          <div className="feed-section-head"><h3><Pencil size={16} color="#B8862B" /> Needs review — exists but outdated <span className="feed-count">{partial.length}</span></h3></div>
          <div className="ledger-table">
            <div className="ledger-row ledger-row--flat ledger-row--head"><span>Category</span><span>Requirement</span><span>Frequency</span><span></span></div>
            {partial.map(({ req }) => (
              <div key={req.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenRequirement(req.id)}>
                <span><ReqCategoryTag category={req.category} /></span>
                <span className="mono-strong">{req.title}</span>
                <span className="muted">{req.frequency}</span>
                <span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="audit-intro-card">
        <h3>What to build from today onward</h3>
        <p>Don't try to fabricate history you don't have — an assessor or inspector would rather see an honest, dated start than backfilled records. Instead:</p>
        <p>1. Book the high-priority gaps above first — a Fire Risk Assessment and Legionella Risk Assessment are the two foundation documents almost everything else depends on.</p>
        <p>2. From today, log every check, service, certificate, and training session in the Ledger as it happens — that's the audit trail an inspector actually wants to see.</p>
        <p>3. Use the Compliance Library any time you're unsure what's expected for a specific item, and revisit this audit in a few months to see the gap list shrink.</p>
      </div>

      {ok.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>Confirmed already in place ({ok.length})</summary>
          <div className="ledger-table" style={{ marginTop: 10 }}>
            {ok.map(({ req }) => (
              <div key={req.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenRequirement(req.id)}>
                <span><ReqCategoryTag category={req.category} /></span>
                <span className="mono-strong">{req.title}</span>
                <span className="muted">{req.frequency}</span>
                <span><Stamp status="tracked" dense /></span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   COMPLIANCE LIBRARY
--------------------------------------------------------- */
