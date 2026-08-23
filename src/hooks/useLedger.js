import { useState, useEffect, useCallback } from "react";
import { computeArchive, computeRestore, computeUpsert } from "../lib/auditTrail";
import {
  ASSET_HISTORY_FIELDS, CERTIFICATE_HISTORY_FIELDS, CONTRACTOR_HISTORY_FIELDS, RECORD_HISTORY_FIELDS,
  ROOM_HISTORY_FIELDS, STAFF_HISTORY_FIELDS, VISIT_HISTORY_FIELDS, CHECKPOINT_HISTORY_FIELDS, METER_HISTORY_FIELDS,
  ASSET_TYPES, ROOM_TYPES, ROOM_ASSET_KIT,
} from "../lib/constants";
import { fireLogRepairWeeklyKeys, isFireLogLocked, fireLogEnsureSnapshot, copyLifecycleFields, generateAssetCode, uid } from "../lib/helpers";

export function useLedger(actorName) {
  const [records, setRecords] = useState([]);
  const [assets, setAssets] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [meters, setMeters] = useState([]);
  const [staff, setStaff] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const [key, setter] of [["ledger-records", setRecords], ["ledger-assets", setAssets], ["ledger-rooms", setRooms], ["ledger-contractors", setContractors], ["ledger-checkpoints", setCheckpoints], ["ledger-meters", setMeters], ["ledger-staff", setStaff], ["ledger-certificates", setCertificates], ["ledger-visits", setVisits]]) {
        try {
          const res = await window.storage.get(key, true);
          if (!cancelled) setter(res ? JSON.parse(res.value) : []);
        } catch { if (!cancelled) setter([]); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const makePersist = (key, setter) => useCallback(async (next) => {
    setter(next);
    const json = JSON.stringify(next);
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await window.storage.set(key, json, true); return; }
      catch { if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
    }
    setError("Couldn't save — check your connection and try again.");
    setTimeout(() => setError(null), 3500);
  }, []);
  const persistRecords = makePersist("ledger-records", setRecords);
  const persistAssets = makePersist("ledger-assets", setAssets);
  const persistRooms = makePersist("ledger-rooms", setRooms);
  const persistContractors = makePersist("ledger-contractors", setContractors);
  const persistCheckpoints = makePersist("ledger-checkpoints", setCheckpoints);
  const persistMeters = makePersist("ledger-meters", setMeters);
  const persistStaff = makePersist("ledger-staff", setStaff);
  const persistCertificates = makePersist("ledger-certificates", setCertificates);
  const persistVisits = makePersist("ledger-visits", setVisits);

  const upsertRecord = useCallback((record, currentRecords) => {
    const base = currentRecords || records;
    const next = computeUpsert(base, record, RECORD_HISTORY_FIELDS, actorName);
    persistRecords(next);
    return next;
  }, [records, persistRecords, actorName]);
  const archiveRecord = useCallback((id) => persistRecords(computeArchive(records, id, actorName)), [records, persistRecords, actorName]);
  const restoreRecord = useCallback((id) => persistRecords(computeRestore(records, id, actorName)), [records, persistRecords, actorName]);
  const requestRecordCorrection = useCallback((id, note) => {
    const now = new Date().toISOString();
    persistRecords(records.map((r) => r.id === id ? { ...r, history: [...(r.history || []), { at: now, action: "correction-requested", by: actorName, note }] } : r));
  }, [records, persistRecords, actorName]);
  /** Runs whenever the Fire Log is opened — captures a frozen export snapshot for any period that has
      just locked and doesn't have one yet. Deliberately not routed through computeUpsert: this is internal
      bookkeeping (closer to what "recording the state" means), not a human edit, and should never appear
      as an "edited" entry in the record's own history. */
  const sweepFireLogSnapshots = useCallback(() => {
    const FIRE_CATS = ["fire_daily", "fire_weekly", "fire_monthly", "fire_periodic"];
    const { next: repaired, fixed } = fireLogRepairWeeklyKeys(records, actorName);
    const needsSnapshot = repaired.filter((r) => FIRE_CATS.includes(r.category) && !r.archived && isFireLogLocked(r) && !r.lockedSnapshot);
    if (needsSnapshot.length === 0 && fixed.length === 0) return;
    const ids = new Set(needsSnapshot.map((r) => r.id));
    persistRecords(repaired.map((r) => (ids.has(r.id) ? fireLogEnsureSnapshot(r) : r)));
  }, [records, persistRecords, actorName]);
  const dismissRecordCorrection = useCallback((id, note) => {
    const now = new Date().toISOString();
    persistRecords(records.map((r) => r.id === id ? { ...r, history: [...(r.history || []), { at: now, action: "correction-dismissed", by: actorName, note }] } : r));
  }, [records, persistRecords, actorName]);
  const resolveRecordCorrection = useCallback((id, currentRecords) => {
    const base = currentRecords || records;
    const now = new Date().toISOString();
    const next = base.map((r) => r.id === id ? { ...r, history: [...(r.history || []), { at: now, action: "correction-resolved", by: actorName }] } : r);
    persistRecords(next);
    return next;
  }, [records, persistRecords, actorName]);

  const upsertAsset = useCallback((asset, currentAssets) => {
    const base = currentAssets || assets;
    const next = computeUpsert(base, asset, ASSET_HISTORY_FIELDS, actorName);
    persistAssets(next);
    return next;
  }, [assets, persistAssets, actorName]);
  const archiveAsset = useCallback((id) => persistAssets(computeArchive(assets, id, actorName)), [assets, persistAssets, actorName]);
  const restoreAsset = useCallback((id) => persistAssets(computeRestore(assets, id, actorName)), [assets, persistAssets, actorName]);
  /** Decommissions an asset and creates its replacement in one linked operation — not two disconnected manual steps.
      Both sides carry a cross-reference (replacesAssetId / supersededByAssetId) and a matching history entry. */
  const replaceAsset = useCallback((oldAssetId, decommission, newAssetForm) => {
    const oldAsset = assets.find((a) => a.id === oldAssetId);
    if (!oldAsset) return null;
    const newAssetId = uid();
    const now = new Date().toISOString();
    const archivedOld = {
      ...oldAsset,
      archived: true,
      archivedAt: now,
      decommissionReason: decommission.reason,
      decommissionDate: decommission.date,
      supersededByAssetId: newAssetId,
      history: [...(oldAsset.history || []), { at: now, action: "replaced", by: actorName, note: `Decommissioned (${decommission.reason}) — replaced by ${newAssetForm.assetCode}` }],
    };
    const newAsset = {
      ...copyLifecycleFields(oldAsset),
      ...newAssetForm,
      id: newAssetId,
      replacesAssetId: oldAssetId,
      archived: false,
      archivedAt: null,
      attachments: [],
      history: [{ at: now, action: "created", by: actorName, note: `Replaces ${oldAsset.assetCode} (decommissioned: ${decommission.reason})` }],
      createdAt: todayStr(),
      updatedAt: todayStr(),
    };
    const next = assets.map((a) => (a.id === oldAssetId ? archivedOld : a)).concat([newAsset]);
    persistAssets(next);
    return { oldAsset: archivedOld, newAsset };
  }, [assets, persistAssets, actorName]);

  const upsertRoom = useCallback((room, currentRooms) => {
    const base = currentRooms || rooms;
    const next = computeUpsert(base, room, ROOM_HISTORY_FIELDS, actorName);
    persistRooms(next);
    return next;
  }, [rooms, persistRooms, actorName]);
  const archiveRoom = useCallback((id) => persistRooms(computeArchive(rooms, id, actorName)), [rooms, persistRooms, actorName]);
  const restoreRoom = useCallback((id) => persistRooms(computeRestore(rooms, id, actorName)), [rooms, persistRooms, actorName]);

  /** Creates any missing rooms in the given number range, plus the standard in-room asset kit for each —
      skips anything that already exists (safe to re-run), and persists each list exactly once regardless
      of how many hundreds of records are involved. */
  const bulkImportRoomAssets = useCallback((roomNumbers) => {
    let nextRooms = [...rooms];
    let nextAssets = [...assets];
    const createdRooms = [];
    const createdAssets = [];
    const skippedAssets = [];
    const reconciledAssets = [];

    for (const roomNumber of roomNumbers) {
      let room = nextRooms.find((r) => !r.archived && r.roomNumber === roomNumber);
      if (!room) {
        room = { id: uid(), roomNumber, floor: "", roomType: ROOM_TYPES[0], notes: "", attachments: [], tags: [] };
        nextRooms = computeUpsert(nextRooms, room, ROOM_HISTORY_FIELDS, actorName);
        room = nextRooms.find((r) => r.roomNumber === roomNumber);
        createdRooms.push(roomNumber);
      }
      for (const kit of ROOM_ASSET_KIT) {
        const type = ASSET_TYPES.find((t) => t.key === kit.typeKey);
        const sides = kit.sides || [null];
        for (const side of sides) {
          const assetCode = `${type.prefix}${roomNumber}${side ? `-${side}` : ""}`;
          const existing = nextAssets.find((a) => !a.archived && a.assetCode === assetCode);
          if (existing) {
            skippedAssets.push(assetCode);
            const eligibleStale = JSON.stringify((existing.eligibleFor || [existing.category]).slice().sort()) !== JSON.stringify(type.eligibleFor.slice().sort());
            if (existing.category !== type.category || existing.assetType !== type.key || eligibleStale) {
              nextAssets = computeUpsert(nextAssets, { ...existing, category: type.category, assetType: type.key, eligibleFor: type.eligibleFor }, ASSET_HISTORY_FIELDS, actorName);
              reconciledAssets.push(assetCode);
            }
            continue;
          }
          const asset = {
            id: uid(), assetType: type.key, category: type.category, eligibleFor: type.eligibleFor, assetCode,
            name: side ? `${type.label} (${side === "L" ? "Left" : "Right"})` : "",
            location: `Room ${roomNumber}`, roomId: room.id, manufacturer: "", model: "",
            serialNumber: "", installDate: "", status: "In Service", notes: "", attachments: [], tags: [],
          };
          nextAssets = computeUpsert(nextAssets, asset, ASSET_HISTORY_FIELDS, actorName);
          createdAssets.push(assetCode);
        }
      }
    }
    if (createdRooms.length) persistRooms(nextRooms);
    if (createdAssets.length || reconciledAssets.length) persistAssets(nextAssets);
    return { createdRooms, createdAssets, skippedAssets, reconciledAssets };
  }, [rooms, assets, persistRooms, persistAssets, actorName]);

  /** Same "skip if it already exists, safe to re-run" idempotence as bulkImportRoomAssets, but for
      Legionella fixtures (tap/shower_head) linked to Checkpoints instead of Kettle linked to Rooms
      — checkpoints already exist (unlike rooms, which this can create on the fly), so this takes
      a list of existing checkpoint ids plus which fixture type(s) to add to each. */
  const bulkImportCheckpointFixtures = useCallback((checkpointIds, fixtureKeys) => {
    let nextAssets = [...assets];
    const created = [];
    const skipped = [];
    for (const checkpointId of checkpointIds) {
      const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
      if (!checkpoint) continue;
      for (const typeKey of fixtureKeys) {
        const type = ASSET_TYPES.find((t) => t.key === typeKey);
        const existing = nextAssets.find((a) => !a.archived && a.checkpointId === checkpointId && a.assetType === typeKey);
        if (existing) { skipped.push(`${type.label} — ${checkpoint.name}`); continue; }
        const assetCode = generateAssetCode(typeKey, nextAssets);
        const asset = {
          id: uid(), assetType: typeKey, category: type.category, eligibleFor: type.eligibleFor, assetCode,
          name: "", location: checkpoint.name, checkpointId, roomId: null, manufacturer: "", model: "",
          serialNumber: "", installDate: "", status: "In Service", notes: "", attachments: [], tags: [],
        };
        nextAssets = computeUpsert(nextAssets, asset, ASSET_HISTORY_FIELDS, actorName);
        created.push(`${type.label} — ${checkpoint.name} (${assetCode})`);
      }
    }
    if (created.length) persistAssets(nextAssets);
    return { created, skipped };
  }, [assets, checkpoints, persistAssets, actorName]);

  const upsertContractor = useCallback((contractor, currentContractors) => {
    const base = currentContractors || contractors;
    const next = computeUpsert(base, contractor, CONTRACTOR_HISTORY_FIELDS, actorName);
    persistContractors(next);
    return next;
  }, [contractors, persistContractors, actorName]);
  const archiveContractor = useCallback((id) => persistContractors(computeArchive(contractors, id, actorName)), [contractors, persistContractors, actorName]);
  const restoreContractor = useCallback((id) => persistContractors(computeRestore(contractors, id, actorName)), [contractors, persistContractors, actorName]);

  const upsertCheckpoint = useCallback((checkpoint, currentCheckpoints) => {
    const base = currentCheckpoints || checkpoints;
    const next = computeUpsert(base, checkpoint, CHECKPOINT_HISTORY_FIELDS, actorName);
    persistCheckpoints(next);
    return next;
  }, [checkpoints, persistCheckpoints, actorName]);
  const archiveCheckpoint = useCallback((id) => persistCheckpoints(computeArchive(checkpoints, id, actorName)), [checkpoints, persistCheckpoints, actorName]);
  const restoreCheckpoint = useCallback((id) => persistCheckpoints(computeRestore(checkpoints, id, actorName)), [checkpoints, persistCheckpoints, actorName]);

  /** Clears the transactional/operational data — compliance records, checkpoint checks (folded
      into records), assets, meter readings, and regulatory visits — back to empty for a fresh
      go-live. Deliberately leaves Rooms, Contractors, Staff, Certificates, Users, Branding, the
      Responsible Person, and the First Day Audit untouched: those took real setup effort and
      aren't "test junk" the way logged checks are. Gated to General Manager at the call site. */
  const resetForGoLive = useCallback(() => {
    persistRecords([]);
    persistAssets([]);
    persistCheckpoints([]);
    persistMeters([]);
    persistVisits([]);
  }, [persistRecords, persistAssets, persistCheckpoints, persistMeters, persistVisits]);

  const upsertMeter = useCallback((meter, currentMeters) => {
    const base = currentMeters || meters;
    const next = computeUpsert(base, meter, METER_HISTORY_FIELDS, actorName);
    persistMeters(next);
    return next;
  }, [meters, persistMeters, actorName]);
  const archiveMeter = useCallback((id) => persistMeters(computeArchive(meters, id, actorName)), [meters, persistMeters, actorName]);
  const restoreMeter = useCallback((id) => persistMeters(computeRestore(meters, id, actorName)), [meters, persistMeters, actorName]);
  /** Meter readings live directly on the meter (readings: [...]) rather than in the generic
      Records/Ledger system — there's no due date, no schedule, nothing to compute a status
      against, just a plain log. Adds a new reading, or edits one in place when reading.id
      matches an existing entry. */
  const saveMeterReading = useCallback((meterId, reading) => {
    const now = new Date().toISOString();
    const next = meters.map((m) => {
      if (m.id !== meterId) return m;
      const readings = m.readings || [];
      const existingIdx = reading.id ? readings.findIndex((r) => r.id === reading.id) : -1;
      const isEdit = existingIdx >= 0;
      const nextReadings = isEdit
        ? readings.map((r, i) => (i === existingIdx ? { ...r, ...reading, updatedAt: now, updatedBy: actorName } : r))
        : [...readings, { ...reading, id: uid(), loggedAt: now, loggedBy: actorName }];
      const note = `${isEdit ? "Reading edited" : "Reading logged"}: ${reading.value} on ${reading.date}`;
      return { ...m, readings: nextReadings, updatedAt: now.slice(0, 10), history: [...(m.history || []), { at: now, action: isEdit ? "reading-edited" : "reading-logged", by: actorName, note }] };
    });
    persistMeters(next);
  }, [meters, persistMeters, actorName]);
  const deleteMeterReading = useCallback((meterId, readingId) => {
    const now = new Date().toISOString();
    const next = meters.map((m) => {
      if (m.id !== meterId) return m;
      const reading = (m.readings || []).find((r) => r.id === readingId);
      return {
        ...m,
        readings: (m.readings || []).filter((r) => r.id !== readingId),
        updatedAt: now.slice(0, 10),
        history: [...(m.history || []), { at: now, action: "reading-deleted", by: actorName, note: reading ? `Reading deleted: ${reading.value} on ${reading.date}` : "Reading deleted" }],
      };
    });
    persistMeters(next);
  }, [meters, persistMeters, actorName]);

  const upsertStaff = useCallback((member, currentStaff) => {
    const base = currentStaff || staff;
    const next = computeUpsert(base, member, STAFF_HISTORY_FIELDS, actorName);
    persistStaff(next);
    return next;
  }, [staff, persistStaff, actorName]);
  const archiveStaff = useCallback((id) => persistStaff(computeArchive(staff, id, actorName)), [staff, persistStaff, actorName]);
  const restoreStaff = useCallback((id) => persistStaff(computeRestore(staff, id, actorName)), [staff, persistStaff, actorName]);

  const upsertCertificate = useCallback((cert, currentCertificates) => {
    const base = currentCertificates || certificates;
    const next = computeUpsert(base, cert, CERTIFICATE_HISTORY_FIELDS, actorName);
    persistCertificates(next);
    return next;
  }, [certificates, persistCertificates, actorName]);
  const archiveCertificate = useCallback((id) => persistCertificates(computeArchive(certificates, id, actorName)), [certificates, persistCertificates, actorName]);
  const restoreCertificate = useCallback((id) => persistCertificates(computeRestore(certificates, id, actorName)), [certificates, persistCertificates, actorName]);

  const upsertVisit = useCallback((visit, currentVisits) => {
    const base = currentVisits || visits;
    const next = computeUpsert(base, visit, VISIT_HISTORY_FIELDS, actorName);
    persistVisits(next);
    return next;
  }, [visits, persistVisits, actorName]);
  const archiveVisit = useCallback((id) => persistVisits(computeArchive(visits, id, actorName)), [visits, persistVisits, actorName]);
  const restoreVisit = useCallback((id) => persistVisits(computeRestore(visits, id, actorName)), [visits, persistVisits, actorName]);

  return {
    records, assets, rooms, contractors, checkpoints, meters, staff, certificates, visits, loading, error,
    upsertRecord, archiveRecord, restoreRecord, requestRecordCorrection, dismissRecordCorrection, resolveRecordCorrection, sweepFireLogSnapshots,
    upsertAsset, archiveAsset, restoreAsset, replaceAsset,
    upsertRoom, archiveRoom, restoreRoom, bulkImportRoomAssets,
    upsertContractor, archiveContractor, restoreContractor,
    upsertCheckpoint, archiveCheckpoint, restoreCheckpoint, bulkImportCheckpointFixtures,
    upsertMeter, archiveMeter, restoreMeter, saveMeterReading, deleteMeterReading, resetForGoLive,
    upsertStaff, archiveStaff, restoreStaff,
    upsertCertificate, archiveCertificate, restoreCertificate,
    upsertVisit, archiveVisit, restoreVisit,
  };
}
