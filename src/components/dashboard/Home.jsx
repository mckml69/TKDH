import React, { useMemo, useContext } from "react";
import {
  GraduationCap,
  Sparkles,
  Package,
  BedDouble,
  Award,
  Repeat,
  MessageSquareWarning,
} from "lucide-react";
import { RecordTable } from "../records/RecordList";
import { ResponsiblePersonCard } from "../settings/ResponsiblePerson";
import { BrandingCard } from "../settings/Branding";
import { CategoryTag, DashboardSection, Stamp } from "../shared/UI";
import { REQUIREMENTS, RoleContext } from "../../lib/constants";
import { assetComplianceStatus, assetUnreliability, belongsToRoom, certificateStatus, findRecurringIssue, findRepeatFailure, fmtDate, getMode, getStatus, hasPendingCorrection, isReviewMode, isScheduleMode, matchRequirement, requirementStatus, roomProblemCounts, timeGreeting, todaysActionItems } from "../../lib/helpers";

export function Home({ records, assets, rooms, certificates, responsiblePerson, onEditResponsiblePerson, branding, onEditBranding, onEdit, onOpenRoom, onOpenAsset, onOpenCertificate, onOpenLibrary, onResolve, goToLedger }) {
  const { role, currentUser } = useContext(RoleContext);
  const activeRecords = useMemo(() => records.filter((r) => !r.archived), [records]);
  const pendingCorrections = useMemo(() => activeRecords.filter(hasPendingCorrection), [activeRecords]);
  const activeAssets = useMemo(() => assets.filter((a) => !a.archived), [assets]);
  const activeRooms = useMemo(() => rooms.filter((r) => !r.archived), [rooms]);
  const activeCertificates = useMemo(() => certificates.filter((c) => !c.archived), [certificates]);
  const today = useMemo(() => todaysActionItems(activeRecords), [activeRecords]);
  const certsExpiringTraining = useMemo(() => activeRecords.filter((r) => getMode(r) === "expiry" && ["overdue", "due-soon"].includes(getStatus(r))), [activeRecords]);
  const certsExpiringDocs = useMemo(() => activeCertificates.filter((c) => ["overdue", "due-soon"].includes(certificateStatus(c))), [activeCertificates]);
  const certsExpiringMerged = useMemo(() => {
    const fromTraining = certsExpiringTraining.map((r) => ({ kind: "Staff training", id: r.id, title: r.title, detail: r.detail, expiry: r.expiryDate, status: getStatus(r), onClick: () => onEdit(r) }));
    const fromCerts = certsExpiringDocs.map((c) => ({ kind: "Certificate", id: c.id, title: c.title, detail: c.certType, expiry: c.expiryDate, status: certificateStatus(c), onClick: () => onOpenCertificate(c.id) }));
    return [...fromTraining, ...fromCerts].sort((a, b) => (a.expiry || "").localeCompare(b.expiry || ""));
  }, [certsExpiringTraining, certsExpiringDocs]);
  const roomProblems = useMemo(() => roomProblemCounts(activeRecords, activeAssets, activeRooms), [activeRecords, activeAssets, activeRooms]);
  const unreliableAssets = useMemo(() => assetUnreliability(activeRecords, activeAssets), [activeRecords, activeAssets]);
  const overdueTraining = useMemo(() => activeRecords.filter((r) => getMode(r) === "expiry" && getStatus(r) === "overdue").sort((a, b) => (a.expiryDate || "").localeCompare(b.expiryDate || "")), [activeRecords]);
  // Deliberately separate from every schedule-mode stat below: a review target passing isn't the
  // same claim as a certificate expiring, and shouldn't be counted alongside "Overdue"/"Due soon" —
  // isScheduleMode already excludes review-mode records from those for exactly this reason.
  const reviewsDue = useMemo(() => activeRecords.filter((r) => isReviewMode(r) && ["review-due", "review-overdue"].includes(getStatus(r))).sort((a, b) => (a.nextReviewTarget || "").localeCompare(b.nextReviewTarget || "")), [activeRecords]);

  const dueSoonCount = useMemo(() => {
    const recs = activeRecords.filter((r) => isScheduleMode(r) && getStatus(r) === "due-soon").length;
    const certs = certsExpiringMerged.filter((item) => item.status === "due-soon").length;
    return recs + certs;
  }, [activeRecords, certsExpiringMerged]);
  const forgottenCount = useMemo(() => REQUIREMENTS.filter((req) => {
    if (req.matchMode === "none") return false;
    const matched = matchRequirement(req, activeRecords, activeCertificates);
    return requirementStatus(req, matched) === "missing";
  }).length, [activeRecords, activeCertificates]);
  // Not scoped to isScheduleMode: "compliant" is also what a checkpoint_check-mode record (Window
  // Restriction/Legionella checks marked OK) reports — and this card's own click-through goes to
  // the Ledger filtered by status alone, with no mode restriction, so the count has to match that
  // or the two visibly disagree (review mode uses "reviewed", log modes use "logged" — genuinely
  // distinct status keys — so nothing else can silently sneak into this count).
  const canWaitCount = useMemo(() => activeRecords.filter((r) => getStatus(r) === "compliant").length, [activeRecords]);

  return (
    <div className="overview">
      <p style={{ fontSize: 15, margin: "0 0 14px" }}>
        {timeGreeting()} {currentUser?.name ? `${currentUser.name}. ` : ""}
        {today.length === 0
          ? "Everything critical is under control."
          : `${today.length} thing${today.length === 1 ? "" : "s"} need${today.length === 1 ? "s" : ""} your attention.`}
      </p>
      <div className="stat-row">
        <div className="stat-card" style={{ cursor: "pointer", borderTopColor: today.length > 0 ? "var(--critical)" : undefined }} onClick={() => goToLedger({ category: "all", status: "all", query: "" })}>
          <span className="stat-num" style={{ color: today.length > 0 ? "var(--critical)" : "var(--ink)" }}>{today.length}</span>
          <span className="stat-label">Critical</span>
        </div>
        <div className="stat-card" style={{ cursor: "pointer", borderTopColor: dueSoonCount > 0 ? "var(--warning)" : undefined }} onClick={() => goToLedger({ category: "all", status: "due-soon", query: "" })}>
          <span className="stat-num" style={{ color: dueSoonCount > 0 ? "var(--warning)" : "var(--ink)" }}>{dueSoonCount}</span>
          <span className="stat-label">Due within 30 days</span>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={onOpenLibrary}>
          <span className="stat-num">{forgottenCount}</span>
          <span className="stat-label">Not started</span>
        </div>
        <div className="stat-card" style={{ cursor: "pointer", borderTopColor: "var(--positive)" }} onClick={() => goToLedger({ category: "all", status: "compliant", query: "" })}>
          <span className="stat-num" style={{ color: "var(--positive)" }}>{canWaitCount}</span>
          <span className="stat-label">Up to date</span>
        </div>
      </div>
      <ResponsiblePersonCard person={responsiblePerson} onEdit={onEditResponsiblePerson} />
      <BrandingCard branding={branding} onEdit={onEditBranding} />

      {role === "General Manager" && pendingCorrections.length > 0 && (
        <DashboardSection title="Correction requests" icon={MessageSquareWarning} color="#B8862B" count={pendingCorrections.length} emptyText="">
          <RecordTable records={pendingCorrections} assets={assets} onView={onEdit} onEdit={onEdit} onDelete={() => {}} onResolve={onResolve} emptyText="" />
        </DashboardSection>
      )}

      <DashboardSection title="Needs doing today" icon={Sparkles} color="#197386" count={today.length} emptyText="Nothing needs attention right now — genuinely clear." onViewAll={() => goToLedger({ category: "all", status: "all", query: "" })}>
        <RecordTable records={today.slice(0, 8)} assets={assets} onView={onEdit} onEdit={onEdit} onDelete={() => {}} onResolve={onResolve} emptyText="" />
      </DashboardSection>

      <DashboardSection title="Which certificates expire soon?" icon={Award} color="#B8862B" count={(role === "General Manager" ? certsExpiringMerged : certsExpiringMerged.filter((i) => i.kind !== "Certificate")).length} emptyText="No certificates or staff training expiring soon.">
        <div className="ledger-table">
          {(role === "General Manager" ? certsExpiringMerged : certsExpiringMerged.filter((i) => i.kind !== "Certificate")).slice(0, 8).map((item) => (
            <div key={item.kind + item.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={item.onClick}>
              <span className="mono-strong">{item.title}</span>
              <span className="muted">{item.detail || "—"}</span>
              <span className="muted">{item.kind}</span>
              <span className="mono">{fmtDate(item.expiry)}</span>
              <span><Stamp status={item.status} dense /></span>
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title="Which reviews are due?" icon={Repeat} color="#5B4A8A" count={reviewsDue.length} emptyText="No risk assessment or Fire Risk Assessment review is due — review-due, not the same claim as an expired certificate.">
        <div className="ledger-table">
          {reviewsDue.slice(0, 8).map((r) => (
            <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onEdit(r)}>
              <span className="mono-strong">{r.title}</span>
              <span className="muted">Last reviewed {r.lastReviewed ? fmtDate(r.lastReviewed) : "never"}</span>
              <span className="muted">{r.nextReviewTarget ? `Target ${fmtDate(r.nextReviewTarget)}` : "No target set"}</span>
              <span><Stamp status={getStatus(r)} dense /></span>
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title="Which rooms have repeated problems?" icon={BedDouble} color="#A8402F" count={roomProblems.length} emptyText="No room has 2 or more maintenance or pest issues.">
        <div className="ledger-table">
          {roomProblems.slice(0, 8).map(({ room, count }) => {
            const recurring = findRecurringIssue(activeRecords.filter((r) => belongsToRoom(r, room.id, activeAssets)));
            return (
              <div key={room.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenRoom(room.id)}>
                <span className="mono-strong">Room {room.roomNumber}</span>
                <span className="muted">{room.roomType}</span>
                <span className="muted">{recurring ? `"${recurring.title}" × ${recurring.count}` : `${count} issue${count === 1 ? "" : "s"} logged`}</span>
                <span className="flag-tag" style={{ marginLeft: 0 }}>Repeat</span>
              </div>
            );
          })}
        </div>
      </DashboardSection>

      <DashboardSection title="Which assets are most unreliable?" icon={Package} color="#A8402F" count={unreliableAssets.length} emptyText="No asset has failed the same check, or had the same issue logged, 2 or more times yet.">
        <div className="ledger-table">
          {unreliableAssets.slice(0, 8).map(({ asset, count }) => {
            const assetRecords = activeRecords.filter((r) => r.assetId === asset.id);
            const recurring = findRecurringIssue(assetRecords) || findRepeatFailure(assetRecords);
            return (
              <div key={asset.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenAsset(asset.id)}>
                <span><CategoryTag category={asset.category} /></span>
                <span className="mono-strong">{asset.assetCode}</span>
                <span className="muted">{recurring ? `"${recurring.title}" × ${recurring.count}` : `${count} failure${count === 1 ? "" : "s"} / repair${count === 1 ? "" : "s"}`}</span>
                <span><Stamp status={assetComplianceStatus(asset, records)} dense /></span>
              </div>
            );
          })}
        </div>
      </DashboardSection>

      <DashboardSection title="Which staff have overdue training?" icon={GraduationCap} color="#A8402F" count={overdueTraining.length} emptyText="No staff member has overdue training.">
        <RecordTable records={overdueTraining.slice(0, 8)} assets={assets} onView={onEdit} onEdit={onEdit} onDelete={() => {}} onResolve={onResolve} emptyText="" />
      </DashboardSection>
    </div>
  );
}
