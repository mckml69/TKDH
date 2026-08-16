import React, { useMemo, useContext } from "react";
import {
  GraduationCap,
  Sparkles,
  Package,
  BedDouble,
  HardHat,
  Award,
  Repeat,
  Sunrise,
  MessageSquareWarning,
} from "lucide-react";
import { RecordTable } from "../records/RecordList";
import { ResponsiblePersonCard } from "../settings/ResponsiblePerson";
import { BrandingCard } from "../settings/Branding";
import { CategoryTag, DashboardSection, Stamp } from "../shared/UI";
import { REQUIREMENTS, RoleContext } from "../../lib/constants";
import { assetComplianceStatus, assetUnreliability, belongsToRoom, briefingCanWait, briefingForgotten, briefingLikely, briefingToday, certificateStatus, findRecurringIssue, findRepeatFailure, fmtDate, getMode, getStatus, hasPendingCorrection, insuranceStatus, isScheduleMode, matchRequirement, requirementStatus, roomProblemCounts, timeGreeting, todaysActionItems } from "../../lib/helpers";

export function BriefingPanel({ today, dueSoonCount, patternCount, patternExample, forgottenCount, canWaitCount, onOpenToday, onOpenForgotten }) {
  return (
    <div className="briefing-panel">
      <div className="briefing-head"><Sunrise size={18} /> {timeGreeting()} Here's where things stand.</div>
      <div className="briefing-item" style={{ cursor: "pointer" }} onClick={onOpenToday}><strong>What needs your attention today?</strong> {briefingToday(today)}</div>
      <div className="briefing-item"><strong>What's most likely to become a problem?</strong> {briefingLikely({ dueSoonCount, patternCount, patternExample })}</div>
      <div className="briefing-item" style={{ cursor: "pointer" }} onClick={onOpenForgotten}><strong>What have you forgotten?</strong> {briefingForgotten(forgottenCount)}</div>
      <div className="briefing-item"><strong>What can wait?</strong> {briefingCanWait(canWaitCount)}</div>
    </div>
  );
}

export function Home({ records, assets, rooms, contractors, certificates, responsiblePerson, onEditResponsiblePerson, branding, onEditBranding, onEdit, onOpenRoom, onOpenAsset, onOpenContractor, onOpenCertificate, onOpenLibrary, goToLedger }) {
  const { role } = useContext(RoleContext);
  const activeRecords = useMemo(() => records.filter((r) => !r.archived), [records]);
  const pendingCorrections = useMemo(() => activeRecords.filter(hasPendingCorrection), [activeRecords]);
  const activeAssets = useMemo(() => assets.filter((a) => !a.archived), [assets]);
  const activeRooms = useMemo(() => rooms.filter((r) => !r.archived), [rooms]);
  const activeContractors = useMemo(() => contractors.filter((c) => !c.archived), [contractors]);
  const activeCertificates = useMemo(() => certificates.filter((c) => !c.archived), [certificates]);
  const today = useMemo(() => todaysActionItems(activeRecords), [activeRecords]);
  const contractorsDue = useMemo(() => activeContractors.filter((c) => ["overdue", "due-soon"].includes(insuranceStatus(c))).sort((a, b) => (a.insuranceExpiry || "").localeCompare(b.insuranceExpiry || "")), [activeContractors]);
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

  const dueSoonCount = useMemo(() => {
    const recs = activeRecords.filter((r) => isScheduleMode(r) && getStatus(r) === "due-soon").length;
    const certs = certsExpiringMerged.filter((item) => item.status === "due-soon").length;
    const contr = contractorsDue.filter((c) => insuranceStatus(c) === "due-soon").length;
    return recs + certs + contr;
  }, [activeRecords, certsExpiringMerged, contractorsDue]);
  const patternCount = roomProblems.length + unreliableAssets.length;
  const patternExample = useMemo(() => {
    if (roomProblems[0]) return `Room ${roomProblems[0].room.roomNumber}`;
    if (unreliableAssets[0]) return unreliableAssets[0].asset.assetCode;
    return null;
  }, [roomProblems, unreliableAssets]);
  const forgottenCount = useMemo(() => REQUIREMENTS.filter((req) => {
    if (req.matchMode === "none") return false;
    const matched = matchRequirement(req, activeRecords, activeCertificates);
    return requirementStatus(req, matched) === "missing";
  }).length, [activeRecords, activeCertificates]);
  const canWaitCount = useMemo(() => activeRecords.filter((r) => isScheduleMode(r) && getStatus(r) === "compliant").length, [activeRecords]);

  return (
    <div className="overview">
      <BriefingPanel today={today} dueSoonCount={dueSoonCount} patternCount={patternCount} patternExample={patternExample} forgottenCount={forgottenCount} canWaitCount={canWaitCount}
        onOpenToday={() => goToLedger({ category: "all", status: "all", query: "" })}
        onOpenForgotten={onOpenLibrary} />
      <ResponsiblePersonCard person={responsiblePerson} onEdit={onEditResponsiblePerson} />
      <BrandingCard branding={branding} onEdit={onEditBranding} />

      {role === "General Manager" && pendingCorrections.length > 0 && (
        <DashboardSection title="Correction requests" icon={MessageSquareWarning} color="#B8862B" count={pendingCorrections.length} emptyText="">
          <RecordTable records={pendingCorrections} assets={assets} onView={onEdit} onEdit={onEdit} onDelete={() => {}} onResolve={() => {}} emptyText="" />
        </DashboardSection>
      )}

      <DashboardSection title="Needs doing today" icon={Sparkles} color="#16263D" count={today.length} emptyText="Nothing needs attention right now — genuinely clear." onViewAll={() => goToLedger({ category: "all", status: "all", query: "" })}>
        <RecordTable records={today.slice(0, 8)} assets={assets} onView={onEdit} onEdit={onEdit} onDelete={() => {}} onResolve={() => {}} emptyText="" />
      </DashboardSection>

      <DashboardSection title="Which contractors or suppliers are due?" icon={HardHat} color="#B8862B" count={contractorsDue.length} emptyText="No insurance expiring soon.">
        <div className="ledger-table">
          {contractorsDue.slice(0, 8).map((c) => (
            <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenContractor(c.id)}>
              <span className="mono-strong">{c.name}</span>
              <span className="muted">{c.contactName || "—"}</span>
              <span className="muted">Insurance</span>
              <span className="mono">{c.insuranceExpiry ? fmtDate(c.insuranceExpiry) : "Not on file"}</span>
              <span><Stamp status={insuranceStatus(c)} dense /></span>
            </div>
          ))}
        </div>
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

      <DashboardSection title="Which assets are most unreliable?" icon={Package} color="#A8402F" count={unreliableAssets.length} emptyText="No asset has any failed checks or maintenance history yet.">
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
        <RecordTable records={overdueTraining.slice(0, 8)} assets={assets} onView={onEdit} onEdit={onEdit} onDelete={() => {}} onResolve={() => {}} emptyText="" />
      </DashboardSection>
    </div>
  );
}
