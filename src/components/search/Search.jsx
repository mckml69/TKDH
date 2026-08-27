import React, { useContext, useMemo } from "react";
import {
  Search,
  ListFilter,
  Package,
  BookOpen,
  HardHat,
  Users,
  Award,
  Landmark,
} from "lucide-react";
import { RecordTable } from "../records/RecordList";
import { CategoryTag, ReqCategoryTag, Stamp } from "../shared/UI";
import { ASSET_TYPES, ROOM_ICON, ROOM_LABEL, ROOM_LABEL_PLURAL, RoleContext } from "../../lib/constants";
import { assetComplianceStatus, certificateStatus, contractorVisitedRecord, fmtDate, matchRequirement, requirementStatus, roomLabelText, staffTrainingStatus, universalSearch, visitStatus } from "../../lib/helpers";

export function SearchSection({ title, icon: Icon, count, children }) {
  if (count === 0) return null;
  return (
    <div className="feed-section">
      <div className="feed-section-head"><h3><Icon size={16} color="#197386" /> {title} <span className="feed-count">{count}</span></h3></div>
      {children}
    </div>
  );
}

export function SearchResults({ query, records, assets, rooms, contractors, staff, certificates, visits, venuePull, onView, onEditRecord, onDeleteRecord, onResolve, onOpenAsset, onOpenRoom, onOpenContractor, onOpenStaff, onOpenCertificate, onOpenVisit, onOpenRequirement }) {
  const { role } = useContext(RoleContext);
  // Same merge as the Ledger and Home dashboard's "pub issues" section — General Manager only,
  // and the pulled records carry their own asset/room/contractor/staff context along with them so
  // recordHaystack can still resolve "Room X" / contractor name text for a room that only exists
  // in the other venue's own storage.
  const pubActive = role === "General Manager" && !!venuePull?.available;
  const pulledRecords = useMemo(() => (pubActive ? venuePull.issues.map((r) => ({ ...r, id: `pull:${r.id}`, __pulled: true })) : []), [pubActive, venuePull]);
  const allRecords = useMemo(() => [...records, ...pulledRecords], [records, pulledRecords]);
  const allRooms = useMemo(() => [...rooms, ...(pubActive ? venuePull.rooms : [])], [rooms, pubActive, venuePull]);
  const allContractors = useMemo(() => [...contractors, ...(pubActive ? venuePull.contractors : [])], [contractors, pubActive, venuePull]);
  const results = useMemo(() => universalSearch(query, allRecords, assets, allRooms, allContractors, staff, certificates, visits), [query, allRecords, assets, allRooms, allContractors, staff, certificates, visits]);
  const total = results.records.length + results.assets.length + results.rooms.length + results.requirements.length + results.contractors.length + results.staff.length + results.certificates.length + results.visits.length;

  if (!query.trim()) {
    return (
      <div className="module-view">
        <div className="module-header"><div className="module-title"><Search size={22} color="#197386" /><h2>Search everything</h2></div></div>
        <div className="empty-state">Search by {ROOM_LABEL.toLowerCase()}, asset code, contractor or supplier name, staff member, certificate, maintenance issue, pest report, inspection, notes, attachment filename, a date, or a tag — it searches records, assets, {ROOM_LABEL_PLURAL.toLowerCase()}, contractors, staff, certificates, regulatory visits, and the Compliance Library all at once.</div>
      </div>
    );
  }

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><Search size={22} color="#197386" /><h2>Results for "{query}"</h2></div>
        <span className="muted">{total} result{total === 1 ? "" : "s"}</span>
      </div>

      {total === 0 ? (
        <div className="empty-state">No matches anywhere — try a different {ROOM_LABEL.toLowerCase()} name, tag, or date format.</div>
      ) : (
        <>
          <SearchSection title="Records" icon={ListFilter} count={results.records.length}>
            <RecordTable records={results.records} assets={assets} rooms={allRooms} contractors={allContractors} staff={staff} onView={onView} onEdit={onEditRecord} onDelete={onDeleteRecord} onResolve={onResolve} emptyText="" />
          </SearchSection>

          <SearchSection title="Assets" icon={Package} count={results.assets.length}>
            <div className="ledger-table">
              {results.assets.map((a) => (
                <div key={a.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenAsset(a.id)}>
                  <span><CategoryTag category={a.category} /></span>
                  <span className="mono-strong">{a.assetCode}{(a.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
                  <span className="muted">{a.name || ASSET_TYPES.find((t) => t.key === a.assetType)?.label}</span>
                  <span className="muted">{a.location || "—"}</span>
                  <span><Stamp status={assetComplianceStatus(a, records)} dense /></span>
                </div>
              ))}
            </div>
          </SearchSection>

          <SearchSection title={ROOM_LABEL_PLURAL} icon={ROOM_ICON} count={results.rooms.length}>
            <div className="ledger-table">
              {results.rooms.map((r) => (
                <div key={r.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenRoom(r.id)}>
                  <span className="mono-strong">{roomLabelText(r.roomNumber)}{(r.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
                  <span className="muted">{r.roomType}</span>
                  <span className="muted">Floor {r.floor || "—"}</span>
                  <span className="muted">{r.notes ? r.notes.slice(0, 60) : "—"}</span>
                  <span></span>
                </div>
              ))}
            </div>
          </SearchSection>

          <SearchSection title="Contractors" icon={HardHat} count={results.contractors.length}>
            <div className="ledger-table">
              {results.contractors.map((c) => (
                <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenContractor(c.id)}>
                  <span className="mono-strong">{c.name}{(c.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
                  <span className="muted">{c.contactName || "—"}</span>
                  <span className="muted">{c.phone || c.email || "—"}</span>
                  <span className="muted">{records.filter((r) => contractorVisitedRecord(r, c.id)).length} visit{records.filter((r) => contractorVisitedRecord(r, c.id)).length === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          </SearchSection>

          <SearchSection title="Staff" icon={Users} count={results.staff.length}>
            <div className="ledger-table">
              {results.staff.map((s) => (
                <div key={s.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenStaff(s.id)}>
                  <span className="mono-strong">{s.name}{(s.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
                  <span className="muted">{s.role || "—"}</span>
                  <span className="muted">{s.phone || s.email || "—"}</span>
                  <span className="muted">{records.filter((r) => r.staffId === s.id).length} training{records.filter((r) => r.staffId === s.id).length === 1 ? "" : "s"}</span>
                  <span><Stamp status={staffTrainingStatus(s, records)} dense /></span>
                </div>
              ))}
            </div>
          </SearchSection>

          <SearchSection title="Certificates" icon={Award} count={results.certificates.length}>
            <div className="ledger-table">
              {results.certificates.map((c) => (
                <div key={c.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenCertificate(c.id)}>
                  <span className="mono-strong">{c.title}{(c.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
                  <span className="muted">{c.certType}</span>
                  <span className="muted">{c.issuer || "—"}</span>
                  <span className="mono">{fmtDate(c.expiryDate)}</span>
                  <span><Stamp status={certificateStatus(c)} dense /></span>
                </div>
              ))}
            </div>
          </SearchSection>

          <SearchSection title="Regulatory Visits" icon={Landmark} count={results.visits.length}>
            <div className="ledger-table">
              {results.visits.map((v) => (
                <div key={v.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenVisit(v.id)}>
                  <span className="mono-strong">{v.visitType}{(v.tags || []).map((t) => <span key={t} className="tag-pill">{t}</span>)}</span>
                  <span className="muted">{v.officerName || "—"}</span>
                  <span className="muted">{v.outcome}</span>
                  <span className="mono">{fmtDate(v.visitDate)}</span>
                  <span><Stamp status={visitStatus(v)} dense /></span>
                </div>
              ))}
            </div>
          </SearchSection>

          <SearchSection title="Compliance Library" icon={BookOpen} count={results.requirements.length}>
            <div className="ledger-table">
              {results.requirements.map((req) => {
                const matched = matchRequirement(req, records, certificates);
                const matchedCount = matched.records.length + matched.certificates.length;
                return (
                  <div key={req.id} className="ledger-row ledger-row--flat" style={{ cursor: "pointer" }} onClick={() => onOpenRequirement(req.id)}>
                    <span><ReqCategoryTag category={req.category} /></span>
                    <span className="mono-strong">{req.title}</span>
                    <span className="muted">{req.frequency}</span>
                    <span className="muted">{matchedCount} record{matchedCount === 1 ? "" : "s"}</span>
                    <span><Stamp status={requirementStatus(req, matched)} dense /></span>
                  </div>
                );
              })}
            </div>
          </SearchSection>
        </>
      )}
    </div>
  );
}
