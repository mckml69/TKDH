import React, { useState, useEffect } from "react";
import {
  Home as HomeIcon,
  Search,
  Plus,
  X,
  Loader2,
  ListFilter,
  Package,
  BedDouble,
  BookOpen,
  ListChecks,
  HardHat,
  Archive,
  Users,
  Award,
  Landmark,
  ChevronDown,
  ShieldCheck,
  Flame,
  Blinds,
  MapPin,
} from "lucide-react";
import { AssetDetail, AssetFormPage, AssetsList } from "./components/assets/Assets";
import { AuditIntro, AuditReport, AuditWizardStep } from "./components/audit/Audit";
import { CertificateDetail, CertificateFormPage, CertificatesList } from "./components/certificates/Certificates";
import { CheckpointDetail, CheckpointFormPage, CheckpointsList } from "./components/checkpoints/Checkpoints";
import { ContractorDetail, ContractorFormPage, ContractorsList } from "./components/contractors/Contractors";
import { Home } from "./components/dashboard/Home";
import {
  FireLogEntryPage, FireLogExportPage, FireLogMenuPage, FireLogPeriodicEntryPage, FireLogPeriodicMenuPage,
  FireLogSuspectedListPage, FireLogTypeMenuPage,
} from "./components/firelog/FireLog";
import { LibraryList, RequirementDetail } from "./components/library/Library";
import { CorrectionRequestFormPage, RecordFormPage, ResolveFormPage, RoomLinkReview } from "./components/records/RecordForms";
import { Ledger } from "./components/records/RecordList";
import { BulkImportRoomAssetsPage, RoomDetail, RoomFormPage, RoomsList } from "./components/rooms/Rooms";
import { SearchResults } from "./components/search/Search";
import { ResponsiblePersonFormPage } from "./components/settings/ResponsiblePerson";
import { BrandingFormPage } from "./components/settings/Branding";
import { ConfirmDeletePage, ReportFallback, TemplatePickerPage } from "./components/shared/UI";
import { StaffDetail, StaffFormPage, StaffList } from "./components/staff/Staff";
import { ResetPasswordPage, SignInScreen, UserFormPage, UsersList } from "./components/users/Users";
import { VisitDetail, VisitFormPage, VisitsList } from "./components/visits/Visits";
import { WindowCheckDetailPage, WindowChecksExportPage, WindowRestrictionChecksPage } from "./components/windowchecks/WindowChecks";
import { useAudit } from "./hooks/useAudit";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useLedger } from "./hooks/useLedger";
import { useResponsiblePerson } from "./hooks/useResponsiblePerson";
import { useBranding } from "./hooks/useBranding";
import { useUsers } from "./hooks/useUsers";
import { storageMode } from "./lib/storage";
import { apiAdapter } from "./lib/storage/apiAdapter";
import { AUDIT_CATEGORIES, LOCATION_PRESETS, REQUIREMENTS, RoleContext, TEMPLATES, TEMPLATE_LIST, FIRE_LOG_ITEMS } from "./lib/constants";
import {
  certificateStatus, checkpointCheckEnsureSnapshot, checkpointCheckPeriodKey, findRoomMentions, fmtDate,
  hasPendingCorrection, insuranceStatus, isCheckpointCheckLocked, isOverdue, staffTrainingStatus, todayStr, uid, visitStatus,
  fireLogCurrentPeriodKey, fireLogEnsureSnapshot, fireLogPeriodLabel, isFireLogLocked,
} from "./lib/helpers";
import "./styles/global.css";

export default function App() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { users, loaded: usersLoaded, upsertUser, archiveUser, restoreUser, reload: reloadUsers } = useUsers();
  const { currentUser, setCurrentUserId, login, bootstrap, logout, changePassword, loaded: sessionLoaded } = useCurrentUser(users);
  const role = currentUser?.role || "Employee";
  const {
    records, assets, rooms, contractors, checkpoints, staff, certificates, visits, loading, error,
    upsertRecord, archiveRecord, restoreRecord, requestRecordCorrection, dismissRecordCorrection, resolveRecordCorrection, sweepFireLogSnapshots,
    upsertAsset, archiveAsset, restoreAsset, replaceAsset,
    upsertRoom, archiveRoom, restoreRoom, bulkImportRoomAssets,
    upsertContractor, archiveContractor, restoreContractor,
    upsertCheckpoint, archiveCheckpoint, restoreCheckpoint,
    upsertStaff, archiveStaff, restoreStaff,
    upsertCertificate, archiveCertificate, restoreCertificate,
    upsertVisit, archiveVisit, restoreVisit,
  } = useLedger(currentUser?.name || null);
  const { audit, saveAudit } = useAudit();
  const { person: responsiblePerson, savePerson: saveResponsiblePerson } = useResponsiblePerson();
  const { branding, saveBranding } = useBranding();
  const [wizardStep, setWizardStep] = useState(0);
  const [registersOpen, setRegistersOpen] = useState(true);
  const [checksOpen, setChecksOpen] = useState(true);
  const [stack, setStack] = useState([{ page: "home" }]);
  const current = stack[stack.length - 1];
  const push = (v) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ page: "home" }]));
  const replaceTop = (v) => setStack((s) => [...s.slice(0, -1), v]);
  const resetTo = (v) => setStack([v]);
  useEffect(() => {
    if (["fire-log-menu", "fire-log-type-menu", "fire-log-periodic-menu"].includes(current.page)) sweepFireLogSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.page]);
  useEffect(() => {
    if (storageMode !== "api") return;
    // A storage call coming back 401 means the session expired or was never valid — bounce
    // back to sign-in instead of letting the request just silently fail mid-form.
    apiAdapter.onUnauthorized = () => logout();
    return () => { apiAdapter.onUnauthorized = null; };
  }, [logout]);

  const [ledgerFilters, setLedgerFilters] = useState({ category: "all", status: "all", query: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryCatFilter, setLibraryCatFilter] = useState("all");

  const goToLedger = (f) => { setLedgerFilters(f); resetTo({ page: "ledger" }); };
  const openTemplatePicker = (templates, prefill) => push({ page: "template-picker", templates, prefill });
  const openRecordForm = (template, record, prefill, viewOnly) => {
    if (record && record.category === "fire_periodic") { push({ page: "fire-log-periodic-entry", itemKey: record.periodicItemKey, record }); return; }
    if (record && ["fire_daily", "fire_weekly", "fire_monthly"].includes(record.category)) { push({ page: "fire-log-entry", category: record.category, record }); return; }
    if (record && record.category === "window_restriction_check") {
      const cp = checkpoints.find((c) => c.id === record.checkpointId);
      push({ page: "window-check-not-ok", checkpoint: cp, periodKey: record.periodKey, record });
      return;
    }
    push({ page: "record-form", template, record, prefill, viewOnly: !!viewOnly });
  };
  const openRecordView = (r) => openRecordForm(TEMPLATES[r.category], r, null, true);
  const openReportFallback = (result) => push({ page: "report-fallback", title: result.title, pdfBytes: result.pdfBytes });

  const handleSaveRecord = (form, logAnother) => {
    const isExisting = records.some((r) => r.id === form.id);
    if (isExisting && role !== "General Manager") return;
    const template = TEMPLATES[form.category];
    const wasPending = isExisting && hasPendingCorrection(records.find((r) => r.id === form.id));
    let next = upsertRecord(form, records);
    if (wasPending) next = resolveRecordCorrection(form.id, next);
    if (form.flagged && !form.flagResolved && !next.some((r) => r.linkedRecordId === form.id)) {
      const linked = { id: uid(), category: "maintenance", title: `Follow-up: ${form.title}`, location: form.location, people: form.people,
        notes: form.flagDescription, dateRaised: todayStr(), priority: "Medium", status: "Open", linkedRecordId: form.id, assetId: form.assetId || null, roomId: form.roomId || null, attachments: [] };
      upsertRecord(linked, next);
    }
    if (logAnother) replaceTop({ page: "record-form", template, record: null, prefill: null, formKey: uid() });
    else pop();
  };
  const handleRequestCorrection = (record) => push({ page: "correction-form", record });
  const handleSubmitCorrection = (id, note) => { requestRecordCorrection(id, note); pop(); };
  const handleDismissCorrection = (id) => { if (role !== "General Manager") return; dismissRecordCorrection(id, null); pop(); };
  const handleDeleteRecord = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "record", id, message: "Archive this record? It's hidden from lists and search but kept for your audit trail — you can restore it anytime from \"Show archived.\"" }); };
  const handleSaveWindowCheckOk = (checkpointId, periodKey, existingRecord) => {
    if (existingRecord && isCheckpointCheckLocked(existingRecord) && role !== "General Manager") return;
    let base = existingRecord || { id: uid(), category: "window_restriction_check", checkpointId, periodKey, title: "Window Restriction Check", location: "", people: "", notes: "", attachments: [], tags: [] };
    if (existingRecord && isCheckpointCheckLocked(existingRecord)) base = checkpointCheckEnsureSnapshot(base);
    upsertRecord({ ...base, status: "ok", note: "" }, records);
  };
  const handleSaveFireLog = (category, existingRecord, checks, explicitPeriodKey) => {
    if (existingRecord && isFireLogLocked(existingRecord) && role !== "General Manager") return;
    const periodKey = existingRecord?.periodKey || explicitPeriodKey || fireLogCurrentPeriodKey(category);
    let base = existingRecord || {
      id: uid(), category, periodKey,
      title: `${TEMPLATES[category].label} — ${fireLogPeriodLabel(category, periodKey)}`,
      location: "", people: "", notes: "", attachments: [], tags: [],
    };
    if (existingRecord && isFireLogLocked(existingRecord)) base = fireLogEnsureSnapshot(base);
    upsertRecord({ ...base, checks }, records);
    pop();
  };
  const handleSaveFireLogPeriodic = (itemKey, existingRecord, checkValue, dateLogged) => {
    if (existingRecord && isFireLogLocked(existingRecord) && role !== "General Manager") return;
    const itemDef = FIRE_LOG_ITEMS.fire_periodic.find((i) => i.key === itemKey);
    let base = existingRecord || {
      id: uid(), category: "fire_periodic", periodicItemKey: itemKey,
      title: itemDef.label, location: "", people: "", notes: "", attachments: [], tags: [],
    };
    if (existingRecord && isFireLogLocked(existingRecord)) base = fireLogEnsureSnapshot(base);
    upsertRecord({ ...base, dateLogged, checks: { ...(base.checks || {}), [itemKey]: checkValue } }, records);
    pop();
  };
  const handleSaveWindowCheck = (checkpointId, periodKey, existingRecord, status, note) => {
    if (existingRecord && isCheckpointCheckLocked(existingRecord) && role !== "General Manager") return;
    let base = existingRecord || { id: uid(), category: "window_restriction_check", checkpointId, periodKey, title: "Window Restriction Check", location: "", people: "", notes: "", attachments: [], tags: [] };
    if (existingRecord && isCheckpointCheckLocked(existingRecord)) base = checkpointCheckEnsureSnapshot(base);
    const updated = { ...base, status, note: status === "not_ok" ? note : "" };
    let next = upsertRecord(updated, records);
    if (status === "not_ok" && !next.some((r) => r.linkedRecordId === updated.id)) {
      const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
      const linked = {
        id: uid(), category: "maintenance", title: `Window restriction issue — ${checkpoint?.name || "checkpoint"}`,
        location: checkpoint?.name || "", people: currentUser?.name || "", notes: note, dateRaised: todayStr(), priority: "Medium", status: "Open",
        linkedRecordId: updated.id, attachments: [],
      };
      upsertRecord(linked, next);
    }
    pop();
  };
  const handleResolve = ({ notes, date, resolvedContractorId, resolvedStaffId }) => {
    const record = current.record;
    const resolver = resolvedContractorId ? contractors.find((c) => c.id === resolvedContractorId)?.name : resolvedStaffId ? staff.find((s) => s.id === resolvedStaffId)?.name : null;
    const resolved = { ...record, status: "Resolved", resolvedNotes: notes, resolvedDate: date, resolvedContractorId: resolvedContractorId || null, resolvedStaffId: resolvedStaffId || null };
    let next = upsertRecord(resolved, records);
    if (record.linkedRecordId) {
      const origin = next.find((r) => r.id === record.linkedRecordId);
      if (origin && origin.category === "window_restriction_check") {
        let updatedOrigin = isCheckpointCheckLocked(origin) ? checkpointCheckEnsureSnapshot(origin) : origin;
        const resolutionNote = `Resolved${date ? ` ${fmtDate(date)}` : ""}${resolver ? ` by ${resolver}` : ""}: ${notes || "no details given"}`;
        updatedOrigin = {
          ...updatedOrigin,
          status: "ok",
          note: origin.note ? `${origin.note}\n${resolutionNote}` : resolutionNote,
          resolvedVia: record.id,
          _historyNote: `Marked OK via maintenance resolution${resolver ? ` (${resolver})` : ""}: ${notes || "no details given"}`,
        };
        upsertRecord(updatedOrigin, next);
      } else if (origin) {
        upsertRecord({ ...origin, flagResolved: true, flagResolvedNotes: notes, flagResolvedDate: date }, next);
      }
    }
    pop();
  };
  const handleConfirmDelete = () => {
    const { type, id } = current;
    if (type === "record") archiveRecord(id);
    else if (type === "asset") archiveAsset(id);
    else if (type === "room") archiveRoom(id);
    else if (type === "contractor") archiveContractor(id);
    else if (type === "staff") archiveStaff(id);
    else if (type === "certificate") archiveCertificate(id);
    else if (type === "visit") archiveVisit(id);
    else if (type === "user") archiveUser(id);
    else if (type === "checkpoint") archiveCheckpoint(id);
    pop();
  };

  const handleSaveAsset = (form, logAnother) => {
    upsertAsset(form, assets);
    if (logAnother) { replaceTop({ page: "asset-form", asset: null, prefill: { assetType: form.assetType, location: form.location }, formKey: uid() }); return; }
    pop();
  };
  const handleReplaceAsset = (oldAssetId, decommission, newAssetForm) => {
    if (role !== "General Manager") return;
    const result = replaceAsset(oldAssetId, decommission, newAssetForm);
    if (result) resetTo({ page: "asset-detail", assetId: result.newAsset.id });
  };
  const handleDeleteAsset = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "asset", id, message: "Archive this asset? Its history is kept, and you can restore it anytime." }); };

  const handleSaveContractor = (form) => { upsertContractor(form, contractors); pop(); };
  const handleDeleteContractor = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "contractor", id, message: "Archive this entry? Their history is kept, and you can restore them anytime." }); };

  const handleSaveStaff = (form) => { upsertStaff(form, staff); pop(); };
  const handleDeleteStaff = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "staff", id, message: "Archive this staff member? Their training history is kept, and you can restore them anytime." }); };

  const handleSaveCertificate = (form) => { upsertCertificate(form, certificates); pop(); };
  const handleDeleteCertificate = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "certificate", id, message: "Archive this certificate? Its history is kept, and you can restore it anytime." }); };

  const handleSaveVisit = (form) => {
    upsertVisit(form, visits);
    if (form.actionsRequired && form.actionsRequired.trim() && form.status === "Open" && !records.some((r) => r.linkedVisitId === form.id)) {
      const linked = {
        id: uid(), category: "maintenance", title: `Follow-up: ${form.visitType}`, location: form.authority || "", people: form.officerName || "",
        notes: form.actionsRequired, dateRaised: todayStr(), priority: "High", status: "Open", linkedVisitId: form.id, attachments: [],
      };
      upsertRecord(linked, records);
    }
    pop();
  };
  const handleDeleteVisit = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "visit", id, message: "Archive this visit record? Its history is kept, and you can restore it anytime." }); };
  const handleSaveResponsiblePerson = (form) => { saveResponsiblePerson(form); pop(); };
  const handleSaveBranding = (form) => { saveBranding(form); pop(); };

  const handleSaveUser = async (form, password) => {
    upsertUser(form, users);
    if (password) await changePassword(form.id, password, null);
    pop();
  };
  const handleResetPassword = (newPassword, currentPassword) => changePassword(current.targetUser.id, newPassword, currentPassword).then(pop);
  const handleDeleteUser = (id) => {
    if (role !== "General Manager") return;
    if (id === currentUser?.id) return;
    push({ page: "confirm-delete", type: "user", id, message: "Archive this user? They'll no longer appear in the sign-in list, but their history is kept and you can restore them anytime." });
  };

  const handleSaveRoom = (form, logAnother) => {
    const isNew = !rooms.some((r) => r.id === form.id);
    upsertRoom(form, rooms);
    if (logAnother) { replaceTop({ page: "room-form", room: null, prefill: { floor: form.floor, roomType: form.roomType }, formKey: uid() }); return; }
    if (isNew) {
      const candidates = findRoomMentions(form, records);
      if (candidates.length > 0) { replaceTop({ page: "room-link-review", room: form, candidates }); return; }
    }
    replaceTop({ page: "room-detail", roomId: form.id });
  };
  const handleLinkRecords = (room, ids) => {
    let acc = records;
    for (const id of ids) {
      const rec = acc.find((r) => r.id === id);
      if (rec) acc = upsertRecord({ ...rec, roomId: room.id }, acc);
    }
    replaceTop({ page: "room-detail", roomId: room.id });
  };
  const handleDeleteRoom = (id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "room", id, message: "Archive this room? Its history is kept, and you can restore it anytime." }); };


  const handleAuditAnswer = (reqId, answer) => {
    const next = { ...audit, responses: { ...audit.responses, [reqId]: answer }, startedAt: audit.startedAt || todayStr() };
    saveAudit(next);
  };
  const handleAuditFinish = () => {
    saveAudit({ ...audit, completedAt: todayStr() });
    resetTo({ page: "audit-report" });
  };
  const overdueCount = records.filter(isOverdue).length;
  const contractorBadge = contractors.filter((c) => ["overdue", "due-soon"].includes(insuranceStatus(c))).length;
  const staffBadge = staff.filter((s) => staffTrainingStatus(s, records) === "overdue").length;
  const certBadge = certificates.filter((c) => ["overdue", "due-soon"].includes(certificateStatus(c))).length;
  const visitBadge = visits.filter((v) => ["overdue", "open"].includes(visitStatus(v))).length;

  let body;
  if (loading || !usersLoaded || !sessionLoaded) {
    body = <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6E6A61", padding: "60px 0" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading ledger…</div>;
  } else if (current.page === "home") {
    body = <Home records={records} assets={assets} rooms={rooms} contractors={contractors} certificates={certificates} responsiblePerson={responsiblePerson} onEditResponsiblePerson={() => push({ page: "responsible-person-form" })} branding={branding} onEditBranding={() => push({ page: "branding-form" })} onEdit={openRecordView}
      onOpenRoom={(id) => push({ page: "room-detail", roomId: id })}
      onOpenAsset={(id) => push({ page: "asset-detail", assetId: id })}
      onOpenContractor={(id) => push({ page: "contractor-detail", contractorId: id })}
      onOpenCertificate={(id) => push({ page: "certificate-detail", certificateId: id })}
      onOpenLibrary={() => resetTo({ page: "library" })}
      goToLedger={goToLedger} />;
  } else if (current.page === "ledger") {
    body = <Ledger records={records} assets={assets} rooms={rooms} contractors={contractors} staff={staff} filters={ledgerFilters} setFilters={setLedgerFilters} onView={openRecordView} onEdit={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onDelete={handleDeleteRecord} onRestore={restoreRecord} onResolve={(r) => push({ page: "resolve-form", record: r })} onRequestCorrection={handleRequestCorrection} onAdd={() => ledgerFilters.category !== "all" ? openRecordForm(TEMPLATES[ledgerFilters.category], null, null) : openTemplatePicker(TEMPLATE_LIST)} onExportFallback={openReportFallback} branding={branding} />;
  } else if (current.page === "assets") {
    body = <AssetsList assets={assets} records={records} onOpen={(id) => push({ page: "asset-detail", assetId: id })} onAdd={() => push({ page: "asset-form", asset: null })} onEdit={(a) => push({ page: "asset-form", asset: a })} onDelete={handleDeleteAsset} onRestore={restoreAsset} onExportFallback={openReportFallback} branding={branding} />;
  } else if (current.page === "asset-detail") {
    const asset = assets.find((a) => a.id === current.assetId);
    body = asset ? <AssetDetail asset={asset} assets={assets} records={records} rooms={rooms} checkpoints={checkpoints} certificates={certificates} contractors={contractors} onBack={pop}
      onEditAsset={(a) => push({ page: "asset-form", asset: a })}
      onReplaceAsset={(a) => push({ page: "replace-asset", asset: a })}
      onLogForAsset={(a) => openTemplatePicker(TEMPLATE_LIST.filter((t) => t.assetEligible && (t.key === "maintenance" || (a.eligibleFor || [a.category]).includes(t.key))), { assetId: a.id, location: a.location })}
      onViewRecord={openRecordView} onEditRecord={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onDeleteRecord={handleDeleteRecord} onRestoreRecord={restoreRecord} onResolve={(r) => push({ page: "resolve-form", record: r })}
      onOpenRoom={(id) => push({ page: "room-detail", roomId: id })}
      onOpenCertificate={(id) => push({ page: "certificate-detail", certificateId: id })}
      onOpenContractor={(id) => push({ page: "contractor-detail", contractorId: id })}
      onOpenAsset={(id) => resetTo({ page: "asset-detail", assetId: id })}
      onOpenCheckpoint={(id) => push({ page: "checkpoint-detail", checkpointId: id })} /> : null;
  } else if (current.page === "replace-asset") {
    const asset = current.asset;
    body = asset && role === "General Manager"
      ? <ReplaceAssetPage asset={asset} assets={assets} onReplace={handleReplaceAsset} onClose={pop} />
      : <div className="empty-state">Only a General Manager can replace an asset.</div>;
  } else if (current.page === "rooms") {
    body = <RoomsList rooms={rooms} records={records} onOpen={(id) => push({ page: "room-detail", roomId: id })} onAdd={() => push({ page: "room-form", room: null })} onEdit={(r) => push({ page: "room-form", room: r })} onDelete={handleDeleteRoom} onRestore={restoreRoom} onExportFallback={openReportFallback} onBulkImport={() => push({ page: "bulk-import-room-assets" })} branding={branding} />;
  } else if (current.page === "bulk-import-room-assets") {
    body = role === "General Manager"
      ? <BulkImportRoomAssetsPage onImport={bulkImportRoomAssets} onClose={pop} />
      : <div className="empty-state">Only a General Manager can run a bulk import.</div>;
  } else if (current.page === "room-detail") {
    const room = rooms.find((r) => r.id === current.roomId);
    body = room ? <RoomDetail room={room} records={records} assets={assets} onBack={pop}
      onEditRoom={(r) => push({ page: "room-form", room: r })}
      onLogForRoom={(r) => openTemplatePicker(TEMPLATE_LIST.filter((t) => t.roomEligible), { roomId: r.id, location: `Room ${r.roomNumber}` })}
      onViewRecord={openRecordView} onEditRecord={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onDeleteRecord={handleDeleteRecord} onRestoreRecord={restoreRecord} onResolve={(r) => push({ page: "resolve-form", record: r })}
      onOpenAsset={(id) => push({ page: "asset-detail", assetId: id })} /> : null;
  } else if (current.page === "contractors") {
    body = <ContractorsList contractors={contractors} records={records} onOpen={(id) => push({ page: "contractor-detail", contractorId: id })} onAdd={() => push({ page: "contractor-form", contractor: null })} onEdit={(c) => push({ page: "contractor-form", contractor: c })} onDelete={handleDeleteContractor} onRestore={restoreContractor} onExportFallback={openReportFallback} branding={branding} />;
  } else if (current.page === "contractor-detail") {
    const contractor = contractors.find((c) => c.id === current.contractorId);
    body = contractor ? <ContractorDetail contractor={contractor} records={records} assets={assets} certificates={certificates} onBack={pop}
      onEdit={(c) => push({ page: "contractor-form", contractor: c })}
      onViewRecord={openRecordView} onEditRecord={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onDeleteRecord={handleDeleteRecord} onResolve={(r) => push({ page: "resolve-form", record: r })}
      onOpenAsset={(id) => push({ page: "asset-detail", assetId: id })}
      onOpenCertificate={(id) => push({ page: "certificate-detail", certificateId: id })} /> : null;
  } else if (current.page === "staff") {
    body = <StaffList staff={staff} records={records} onOpen={(id) => push({ page: "staff-detail", staffId: id })} onAdd={() => push({ page: "staff-form", member: null })} onEdit={(s) => push({ page: "staff-form", member: s })} onDelete={handleDeleteStaff} onRestore={restoreStaff} onExportFallback={openReportFallback} branding={branding} />;
  } else if (current.page === "staff-detail") {
    const member = staff.find((s) => s.id === current.staffId);
    body = member ? <StaffDetail member={member} records={records} assets={assets} onBack={pop}
      onEdit={(s) => push({ page: "staff-form", member: s })}
      onViewRecord={openRecordView} onEditRecord={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onResolve={(r) => push({ page: "resolve-form", record: r })} /> : null;
  } else if (current.page === "certificates") {
    body = role === "General Manager"
      ? <CertificatesList certificates={certificates} assets={assets} contractors={contractors} onOpen={(id) => push({ page: "certificate-detail", certificateId: id })} onAdd={() => push({ page: "certificate-form", cert: null })} onEdit={(c) => push({ page: "certificate-form", cert: c })} onDelete={handleDeleteCertificate} onRestore={restoreCertificate} onExportFallback={openReportFallback} branding={branding} />
      : <div className="empty-state">Certificates contain insurance and legal documents — only a General Manager can view this register.</div>;
  } else if (current.page === "certificate-detail") {
    const cert = certificates.find((c) => c.id === current.certificateId);
    body = role !== "General Manager" ? <div className="empty-state">Only a General Manager can view certificates.</div> : cert ? <CertificateDetail cert={cert} assets={assets} contractors={contractors} onBack={pop}
      onEdit={(c) => push({ page: "certificate-form", cert: c })}
      onOpenAsset={(id) => push({ page: "asset-detail", assetId: id })}
      onOpenContractor={(id) => push({ page: "contractor-detail", contractorId: id })} /> : null;
  } else if (current.page === "visits") {
    body = <VisitsList visits={visits} onOpen={(id) => push({ page: "visit-detail", visitId: id })} onAdd={() => push({ page: "visit-form", visit: null })} onEdit={(v) => push({ page: "visit-form", visit: v })} onDelete={handleDeleteVisit} onRestore={restoreVisit} onExportFallback={openReportFallback} branding={branding} />;
  } else if (current.page === "visit-detail") {
    const v = visits.find((x) => x.id === current.visitId);
    body = v ? <VisitDetail visit={v} onBack={pop} onEdit={(vv) => push({ page: "visit-form", visit: vv })} /> : null;
  } else if (current.page === "template-picker") {
    body = <TemplatePickerPage templates={current.templates} onPick={(t) => replaceTop({ page: "record-form", template: t, record: null, prefill: current.prefill })} onClose={pop} />;
  } else if (current.page === "record-form") {
    body = <RecordFormPage key={current.record?.id ?? current.formKey ?? "record-form"} template={current.template} record={current.record} assets={assets} rooms={rooms} contractors={contractors} staff={staff} prefill={current.prefill} initialViewOnly={current.viewOnly} onSave={handleSaveRecord} onClose={pop} onRequestCorrection={handleRequestCorrection} onDismissCorrection={handleDismissCorrection} />;
  } else if (current.page === "correction-form") {
    body = <CorrectionRequestFormPage record={current.record} onSubmit={handleSubmitCorrection} onClose={pop} />;
  } else if (current.page === "asset-form") {
    body = <AssetFormPage key={current.asset?.id ?? current.formKey ?? "asset-form"} asset={current.asset} assets={assets} rooms={rooms} checkpoints={checkpoints} prefill={current.prefill} onSave={handleSaveAsset} onClose={pop} />;
  } else if (current.page === "room-form") {
    body = <RoomFormPage key={current.room?.id ?? current.formKey ?? "room-form"} room={current.room} prefill={current.prefill} onSave={handleSaveRoom} onClose={pop} />;
  } else if (current.page === "contractor-form") {
    body = <ContractorFormPage contractor={current.contractor} onSave={handleSaveContractor} onClose={pop} />;
  } else if (current.page === "staff-form") {
    body = <StaffFormPage member={current.member} onSave={handleSaveStaff} onClose={pop} />;
  } else if (current.page === "certificate-form") {
    body = <CertificateFormPage cert={current.cert} assets={assets} contractors={contractors} prefill={current.prefill} onSave={handleSaveCertificate} onClose={pop} />;
  } else if (current.page === "visit-form") {
    body = <VisitFormPage visit={current.visit} onSave={handleSaveVisit} onClose={pop} />;
  } else if (current.page === "responsible-person-form") {
    body = <ResponsiblePersonFormPage person={responsiblePerson} onSave={handleSaveResponsiblePerson} onClose={pop} />;
  } else if (current.page === "branding-form") {
    body = <BrandingFormPage branding={branding} onSave={handleSaveBranding} onClose={pop} />;
  } else if (current.page === "room-link-review") {
    body = <RoomLinkReview room={current.room} candidates={current.candidates} onLink={(ids) => handleLinkRecords(current.room, ids)} onSkip={() => replaceTop({ page: "room-detail", roomId: current.room.id })} />;
  } else if (current.page === "resolve-form") {
    body = <ResolveFormPage record={current.record} contractors={contractors} staff={staff} onClose={pop} onSubmit={handleResolve} />;
  } else if (current.page === "checkpoints") {
    body = <CheckpointsList checkpoints={checkpoints} assets={assets} onOpen={(id) => push({ page: "checkpoint-detail", checkpointId: id })} onAdd={() => push({ page: "checkpoint-form", checkpoint: null })} onEdit={(cp) => push({ page: "checkpoint-form", checkpoint: cp })} onDelete={(id) => { if (role !== "General Manager") return; push({ page: "confirm-delete", type: "checkpoint", id, message: "Archive this checkpoint? Its history is kept, and you can restore it anytime." }); }} onRestore={restoreCheckpoint} />;
  } else if (current.page === "checkpoint-detail") {
    const cp = checkpoints.find((c) => c.id === current.checkpointId);
    body = cp ? <CheckpointDetail checkpoint={cp} assets={assets} records={records} onBack={pop} onEdit={(c) => push({ page: "checkpoint-form", checkpoint: c })} onOpenAsset={(id) => push({ page: "asset-detail", assetId: id })} onOpenCheck={(checkpoint, periodKey, rec) => push({ page: "window-check-not-ok", checkpoint, periodKey, record: rec })} /> : null;
  } else if (current.page === "checkpoint-form") {
    body = <CheckpointFormPage key={current.checkpoint?.id ?? current.formKey ?? "checkpoint-form"} checkpoint={current.checkpoint} onSave={(form, logAnother) => {
      upsertCheckpoint(form, checkpoints);
      if (logAnother) { replaceTop({ page: "checkpoint-form", checkpoint: null, formKey: uid() }); return; }
      pop();
    }} onClose={pop} />;
  } else if (current.page === "window-checks") {
    body = <WindowRestrictionChecksPage checkpoints={checkpoints} assets={assets} records={records} canEdit={role === "General Manager"}
      onSaveOk={handleSaveWindowCheckOk}
      onOpenNotOk={(cp, periodKey, rec) => push({ page: "window-check-not-ok", checkpoint: cp, periodKey, record: rec, initialStatus: "not_ok" })}
      onOpenDetail={(cp, periodKey, rec) => push({ page: "window-check-not-ok", checkpoint: cp, periodKey, record: rec })}
      onViewPast={(r) => openRecordForm(TEMPLATES[r.category], r, null)}
      onExport={() => push({ page: "window-checks-export" })}
      onClose={pop} />;
  } else if (current.page === "window-check-not-ok") {
    const liveRecord = current.record ? records.find((r) => r.id === current.record.id) || current.record : null;
    body = <WindowCheckDetailPage checkpoint={current.checkpoint} periodKey={current.periodKey} record={liveRecord} initialStatus={current.initialStatus} canEdit={role === "General Manager"}
      onSave={handleSaveWindowCheck} onClose={pop} />;
  } else if (current.page === "window-checks-export") {
    body = role === "General Manager"
      ? <WindowChecksExportPage checkpoints={checkpoints} assets={assets} records={records} onExportFallback={openReportFallback} onClose={pop} branding={branding} />
      : <div className="empty-state">Only a General Manager can export Window Restriction checks.</div>;
  } else if (current.page === "fire-log-menu") {
    body = <FireLogMenuPage records={records} onPick={(category) => {
      if (category === "fire_periodic") { push({ page: "fire-log-periodic-menu" }); return; }
      push({ page: "fire-log-type-menu", category });
    }} onExport={() => push({ page: "fire-log-export" })} onOpenSuspected={() => push({ page: "fire-log-suspected" })} onClose={pop} />;
  } else if (current.page === "fire-log-suspected") {
    body = role === "General Manager"
      ? <FireLogSuspectedListPage records={records} onView={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onClose={pop} />
      : <div className="empty-state">Only a General Manager can view this.</div>;
  } else if (current.page === "fire-log-export") {
    body = role === "General Manager"
      ? <FireLogExportPage records={records} onOpenDay={(dateStr) => {
          const periodKey = dateStr;
          const existing = records.find((r) => r.category === "fire_daily" && r.periodKey === periodKey && !r.archived);
          push({ page: "fire-log-entry", category: "fire_daily", record: existing || null, periodKeyOverride: periodKey });
        }} onExportFallback={openReportFallback} onClose={pop} branding={branding} />
      : <div className="empty-state">Only a General Manager can export the Fire Log.</div>;
  } else if (current.page === "fire-log-type-menu") {
    body = <FireLogTypeMenuPage category={current.category} records={records}
      onOpenCurrent={() => {
        const periodKey = fireLogCurrentPeriodKey(current.category);
        const existing = records.find((r) => r.category === current.category && r.periodKey === periodKey && !r.archived);
        push({ page: "fire-log-entry", category: current.category, record: existing || null });
      }}
      onOpenForDate={(dateStr) => {
        const periodKey = fireLogCurrentPeriodKey(current.category, dateStr);
        const existing = records.find((r) => r.category === current.category && r.periodKey === periodKey && !r.archived);
        push({ page: "fire-log-entry", category: current.category, record: existing || null, periodKeyOverride: periodKey });
      }}
      onView={(r) => push({ page: "fire-log-entry", category: current.category, record: r })}
      onClose={pop} />;
  } else if (current.page === "fire-log-entry") {
    const liveRecord = current.record ? records.find((r) => r.id === current.record.id) || current.record : null;
    body = <FireLogEntryPage category={current.category} record={liveRecord} periodKeyOverride={current.periodKeyOverride} canEdit={role === "General Manager"}
      onSave={(checks, periodKey) => handleSaveFireLog(current.category, liveRecord, checks, periodKey)}
      onRequestCorrection={handleRequestCorrection} onDismissCorrection={handleDismissCorrection} onClose={pop} />;
  } else if (current.page === "fire-log-periodic-menu") {
    body = <FireLogPeriodicMenuPage records={records}
      onLog={(itemKey) => push({ page: "fire-log-periodic-entry", itemKey, record: null })}
      onView={(r) => push({ page: "fire-log-periodic-entry", itemKey: r.periodicItemKey, record: r })}
      onClose={pop} />;
  } else if (current.page === "fire-log-periodic-entry") {
    const liveRecord = current.record ? records.find((r) => r.id === current.record.id) || current.record : null;
    body = <FireLogPeriodicEntryPage itemKey={current.itemKey} record={liveRecord} canEdit={role === "General Manager"}
      onSave={(itemKey, checkValue, dateLogged) => handleSaveFireLogPeriodic(itemKey, liveRecord, checkValue, dateLogged)}
      onRequestCorrection={handleRequestCorrection} onDismissCorrection={handleDismissCorrection} onClose={pop} />;
  } else if (current.page === "confirm-delete") {
    body = <ConfirmDeletePage message={current.message} onCancel={pop} onConfirm={handleConfirmDelete} />;
  } else if (current.page === "report-fallback") {
    body = <ReportFallback title={current.title} pdfBytes={current.pdfBytes} onBack={pop} />;
  } else if (current.page === "search-results") {
    body = <SearchResults query={searchQuery} records={records} assets={assets} rooms={rooms} contractors={contractors} staff={staff} certificates={certificates} visits={visits}
      onView={openRecordView} onEditRecord={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onDeleteRecord={handleDeleteRecord} onResolve={(r) => push({ page: "resolve-form", record: r })}
      onOpenAsset={(id) => push({ page: "asset-detail", assetId: id })}
      onOpenRoom={(id) => push({ page: "room-detail", roomId: id })}
      onOpenContractor={(id) => push({ page: "contractor-detail", contractorId: id })}
      onOpenStaff={(id) => push({ page: "staff-detail", staffId: id })}
      onOpenCertificate={(id) => push({ page: "certificate-detail", certificateId: id })}
      onOpenVisit={(id) => push({ page: "visit-detail", visitId: id })}
      onOpenRequirement={(id) => push({ page: "requirement-detail", reqId: id })} />;
  } else if (current.page === "library") {
    body = <LibraryList records={records} certificates={certificates} onOpen={(id) => push({ page: "requirement-detail", reqId: id })} catFilter={libraryCatFilter} setCatFilter={setLibraryCatFilter} />;
  } else if (current.page === "users") {
    body = role === "General Manager"
      ? <UsersList users={users} currentUser={currentUser} onAdd={() => push({ page: "user-form", user: null })} onEdit={(u) => push({ page: "user-form", user: u })} onDelete={handleDeleteUser} onRestore={restoreUser}
          onResetPassword={(u) => push({ page: "reset-password", targetUser: u, requireCurrentPassword: false })} />
      : <div className="empty-state">Only a General Manager can view this page.</div>;
  } else if (current.page === "user-form") {
    body = <UserFormPage user={current.user} users={users} onSave={handleSaveUser} onClose={pop} />;
  } else if (current.page === "reset-password") {
    body = <ResetPasswordPage targetUser={current.targetUser} requireCurrentPassword={current.requireCurrentPassword} onSubmit={handleResetPassword} onClose={pop} />;
  } else if (current.page === "audit-intro") {
    body = <AuditIntro audit={audit}
      onStart={() => { saveAudit({ responses: {}, startedAt: todayStr(), completedAt: null }); setWizardStep(0); resetTo({ page: "audit-wizard" }); }}
      onResume={() => { setWizardStep(0); resetTo({ page: "audit-wizard" }); }}
      onViewReport={() => resetTo({ page: "audit-report" })} />;
  } else if (current.page === "audit-wizard") {
    body = <AuditWizardStep stepIndex={wizardStep} responses={audit.responses}
      onAnswer={handleAuditAnswer}
      onNext={() => setWizardStep((s) => Math.min(s + 1, AUDIT_CATEGORIES.length - 1))}
      onBack={() => setWizardStep((s) => Math.max(s - 1, 0))}
      onFinish={handleAuditFinish} />;
  } else if (current.page === "audit-report") {
    body = <AuditReport audit={audit} records={records}
      onEditWizard={() => { setWizardStep(0); resetTo({ page: "audit-wizard" }); }}
      onOpenRequirement={(id) => push({ page: "requirement-detail", reqId: id })}
      onExportFallback={openReportFallback}
      branding={branding}
      />;
  } else if (current.page === "requirement-detail") {
    const req = REQUIREMENTS.find((r) => r.id === current.reqId);
    body = req ? <RequirementDetail req={req} records={records} certificates={certificates} onBack={pop}
      onLogNow={(r) => openRecordForm(TEMPLATES[r.category], null, { title: r.matchValues[0] })}
      onViewRecord={openRecordView} onEditRecord={(r) => openRecordForm(TEMPLATES[r.category], r, null)} onDeleteRecord={handleDeleteRecord} onResolve={(r) => push({ page: "resolve-form", record: r })}
      onOpenCertificate={(id) => push({ page: "certificate-detail", certificateId: id })} /> : null;
  }

  return (
    <RoleContext.Provider value={{ role, currentUser, canEdit: role === "General Manager", canDelete: role === "General Manager", canManageUsers: role === "General Manager", canViewSensitive: role === "General Manager" }}>
    <div className="app">
      <datalist id="loc-presets">{LOCATION_PRESETS.map((l) => <option key={l} value={l} />)}</datalist>

      {(!usersLoaded || !sessionLoaded) ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", gap: 10, color: "#6E6A61", padding: "80px 0" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading…</div>
      ) : !currentUser ? (
        <SignInScreen users={users} onSignIn={setCurrentUserId} onCreateUser={(u) => { upsertUser(u, users); setCurrentUserId(u.id); }}
          onLogin={async (email, password) => { await login(email, password); await reloadUsers(); }}
          onBootstrap={async (form) => { await bootstrap(form); await reloadUsers(); }} />
      ) : (
      <>
      <aside className="sidebar">
        <img src="/tkdh-logo.png" alt="TKDH" className="brand-logo" />
        <div className="brand-sub">Compliance Ledger</div>
        <button className="new-record-btn" onClick={() => openTemplatePicker(TEMPLATE_LIST)}><Plus size={16} /> <span>New record</span></button>
        <button className={"nav-item" + (current.page === "home" ? " active" : "")} onClick={() => resetTo({ page: "home" })}><HomeIcon size={16} /> Home</button>
        <button className={"nav-item" + (current.page === "ledger" && ledgerFilters.category === "all" && ledgerFilters.status === "all" ? " active" : "")} onClick={() => goToLedger({ category: "all", status: "all", query: "" })}><ListFilter size={16} /> All records</button>

        <div className="nav-divider" />
        {(() => {
          const checkPages = ["fire-log-menu", "fire-log-entry", "fire-log-type-menu", "fire-log-periodic-menu", "fire-log-periodic-entry", "fire-log-export", "fire-log-suspected", "window-checks", "window-check-not-ok", "window-checks-export"];
          const isOnCheckPage = checkPages.includes(current.page);
          const expanded = checksOpen || isOnCheckPage;
          return (
            <>
              <button className="nav-item" onClick={() => setChecksOpen((o) => !o)}>
                <ChevronDown size={14} style={{ transform: expanded ? "none" : "rotate(-90deg)", transition: "transform .12s" }} /> Checks
              </button>
              {expanded && (
                <div className="nav-subgroup">
                  <button className={"nav-item" + (checkPages.slice(0, 7).includes(current.page) ? " active" : "")} onClick={() => resetTo({ page: "fire-log-menu" })}><Flame size={16} /> Fire Log Checks</button>
                  <button className={"nav-item" + (["window-checks", "window-check-not-ok", "window-checks-export"].includes(current.page) ? " active" : "")} onClick={() => resetTo({ page: "window-checks" })}><Blinds size={16} /> Window Restriction</button>
                </div>
              )}
            </>
          );
        })()}

        <div className="nav-divider" />
        {(() => {
          const registerPages = ["assets", "asset-detail", "rooms", "room-detail", "contractors", "contractor-detail", "checkpoints", "checkpoint-detail", "staff", "staff-detail", "certificates", "certificate-detail", "visits", "visit-detail"];
          const isOnRegisterPage = registerPages.includes(current.page);
          const expanded = registersOpen || isOnRegisterPage;
          const registerBadgeTotal = contractorBadge + staffBadge + certBadge + visitBadge;
          return (
            <>
              <button className="nav-item" onClick={() => setRegistersOpen((o) => !o)}>
                <ChevronDown size={14} style={{ transform: expanded ? "none" : "rotate(-90deg)", transition: "transform .12s" }} /> Registers{registerBadgeTotal > 0 && <span className="nav-badge">{registerBadgeTotal}</span>}
              </button>
              {expanded && (
                <div className="nav-subgroup">
                  <button className={"nav-item" + (current.page === "assets" || current.page === "asset-detail" ? " active" : "")} onClick={() => resetTo({ page: "assets" })}><Package size={16} /> Assets</button>
                  <button className={"nav-item" + (current.page === "rooms" || current.page === "room-detail" ? " active" : "")} onClick={() => resetTo({ page: "rooms" })}><BedDouble size={16} /> Rooms</button>
                  <button className={"nav-item" + (current.page === "checkpoints" || current.page === "checkpoint-detail" ? " active" : "")} onClick={() => resetTo({ page: "checkpoints" })}><MapPin size={16} /> Checkpoints</button>
                  <button className={"nav-item" + (current.page === "contractors" || current.page === "contractor-detail" ? " active" : "")} onClick={() => resetTo({ page: "contractors" })}><HardHat size={16} /> Contractors &amp; Suppliers{contractorBadge > 0 && <span className="nav-badge">{contractorBadge}</span>}</button>
                  <button className={"nav-item" + (current.page === "staff" || current.page === "staff-detail" ? " active" : "")} onClick={() => resetTo({ page: "staff" })}><Users size={16} /> Staff{staffBadge > 0 && <span className="nav-badge">{staffBadge}</span>}</button>
                  {role === "General Manager" && <button className={"nav-item" + (current.page === "certificates" || current.page === "certificate-detail" ? " active" : "")} onClick={() => resetTo({ page: "certificates" })}><Award size={16} /> Certificates{certBadge > 0 && <span className="nav-badge">{certBadge}</span>}</button>}
                  <button className={"nav-item" + (current.page === "visits" || current.page === "visit-detail" ? " active" : "")} onClick={() => resetTo({ page: "visits" })}><Landmark size={16} /> Regulatory Visits{visitBadge > 0 && <span className="nav-badge">{visitBadge}</span>}</button>
                </div>
              )}
            </>
          );
        })()}

        <div className="nav-divider" />
        <button className={"nav-item" + (current.page === "library" || current.page === "requirement-detail" ? " active" : "")} onClick={() => resetTo({ page: "library" })}><BookOpen size={16} /> Compliance Library</button>
        <button className={"nav-item" + (["audit-intro", "audit-wizard", "audit-report"].includes(current.page) ? " active" : "")} onClick={() => resetTo({ page: "audit-intro" })}><ListChecks size={16} /> First Day Audit</button>
        {role === "General Manager" && (
          <button className={"nav-item" + (current.page === "users" ? " active" : "")} onClick={() => resetTo({ page: "users" })}><ShieldCheck size={16} /> Users &amp; Permissions</button>
        )}
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="topbar">
          <div className="user-menu">
            <button className="user-menu-trigger" onClick={() => setUserMenuOpen((o) => !o)}>
              <div className="user-menu-trigger-text">
                <span className="user-menu-name">{currentUser.name}</span>
                <span className="user-menu-role">{role}</span>
              </div>
              <ChevronDown size={14} color="#65767C" />
            </button>
            {userMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setUserMenuOpen(false)} />
                <div className="user-menu-dropdown">
                  {storageMode === "api" && <button onClick={() => { setUserMenuOpen(false); push({ page: "reset-password", targetUser: currentUser, requireCurrentPassword: true }); }}>Change password</button>}
                  <button onClick={() => { setUserMenuOpen(false); storageMode === "api" ? logout() : setCurrentUserId(null); }}>{storageMode === "api" ? "Sign out" : "Switch user"}</button>
                </div>
              </>
            )}
          </div>
          <div className="search-box search-box--wide">
            <Search size={14} color="#6E6A61" />
            <input placeholder="Search rooms, assets, contractors, certificates, pest reports, dates, tags…" value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value) resetTo({ page: "search-results" }); }} />
            {searchQuery && <button className="icon-btn" style={{ padding: 3 }} onClick={() => { setSearchQuery(""); resetTo({ page: "home" }); }}><X size={14} /></button>}
          </div>
        </div>
        <main className="main">
          {error && <div className="toast-inline">{error}</div>}
          {body}
        </main>
      </div>
      </>
      )}

    </div>
    </RoleContext.Provider>
  );
}
