import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Award, GraduationCap, Share2, Users } from "lucide-react";
import { SaveStatusBanner, Stamp, MouseLoader } from "../shared/UI";
import { ModuleView, Quiz, ResultView } from "./TrainingModule";
import { TrainingPackPanel } from "./TrainingPackPanel";
import { trainingApi } from "../../lib/training/api";
import { isoDay, moduleStatus, recordStatus, refreshLabel, slug } from "../../lib/training/status";
import { buildCertificatePdf } from "../../lib/pdf/certificatePdf";
import { buildRegisterPdf } from "../../lib/pdf/registerPdf";
import { exportPdfReport } from "../../lib/pdf/exportPdf";
import { fmtDate, todayStr } from "../../lib/helpers";

/** Builds a certificate PDF from the server's record of it and saves/shares it exactly like a report. */
function useCertificateSaver(branding, onExportFallback) {
  const [status, setStatus] = useState(null);
  const [busyNo, setBusyNo] = useState(null);
  const [error, setError] = useState(null);
  const save = useCallback(async (certificateNo) => {
    setBusyNo(certificateNo); setError(null); setStatus(null);
    try {
      const cert = await trainingApi.certificate(certificateNo);
      const bytes = await buildCertificatePdf({ cert, branding, savedOn: todayStr() });
      const filename = `training-certificate-${slug(cert.name)}-${slug(cert.moduleId)}-${cert.certificateNo}.pdf`;
      const result = await exportPdfReport(filename, "Training Certificate", bytes);
      if (result.status === "fallback") onExportFallback(result);
      else setStatus(result.status);
    } catch (e) {
      setError(e.message || "Couldn't prepare the certificate.");
    } finally { setBusyNo(null); }
  }, [branding, onExportFallback]);
  return { save, status, busyNo, error };
}

function ModuleBoard({ pack, me, onOpen }) {
  if (!me.linked && !me.canTakeAny) {
    return <div className="tr-note">Your login hasn't been paired with a staff record yet, so no training has been assigned to you. Ask the General Manager to pair it.</div>;
  }
  if (pack.modules.length === 0) {
    return <div className="empty-state">Nothing has been assigned to you yet. The General Manager chooses which modules each person completes.</div>;
  }
  return (
    <div className="tr-board">
      {pack.modules.map((m) => {
        const result = me.results[m.id];
        const status = moduleStatus(result);
        return (
          <button key={m.id} className="tr-card" onClick={() => onOpen(m.id)}>
            <div>
              <h3>{m.title}</h3>
              <div className="tr-meta">
                About {m.minutes || 10} min · repeat {refreshLabel(m.refreshMonths)}
                {result?.passed && result.validUntil && <> · valid until {fmtDate(isoDay(result.validUntil))}</>}
                {result && !result.passed && <> · last score {result.score}/{result.total}</>}
              </div>
            </div>
            <Stamp status={status} dense />
          </button>
        );
      })}
    </div>
  );
}

function CertificatesView({ isGM, branding, onExportFallback }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [person, setPerson] = useState("all");
  const saver = useCertificateSaver(branding, onExportFallback);
  useEffect(() => {
    let cancelled = false;
    trainingApi.certificates().then((r) => { if (!cancelled) setList(r.certificates); }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const people = useMemo(() => {
    const m = new Map();
    (list || []).forEach((c) => m.set(c.userId, c.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);
  if (error) return <div className="tr-error" role="alert">{error}</div>;
  if (!list) return <MouseLoader label="Loading certificates…" />;
  const shown = list.filter((c) => person === "all" || c.userId === person);
  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>{isGM ? "As General Manager you can see every certificate issued." : "These are your certificates. Only you and the General Manager can see them."}</p>
      {isGM && people.length > 1 && (
        <div className="filter-rail"><div className="chip-row">
          <select className="search-inline" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Show certificates for">
            <option value="all">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div></div>
      )}
      <SaveStatusBanner status={saver.status} />
      {saver.error && <div className="tr-error" role="alert">{saver.error}</div>}
      {shown.length === 0 ? (
        <div className="empty-state">No certificates yet. A certificate is issued each time a module is passed.</div>
      ) : (
        <div className="ledger-table">
          {shown.map((c) => (
            <div className="ledger-row" key={c.certificateNo} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <span>
                <strong>{c.moduleTitle}</strong>{isGM && <> · {c.name}</>}
                <br /><span className="muted">{c.certificateNo} · {c.score}/{c.total} · completed {fmtDate(isoDay(c.completedAt))} · valid until {c.validUntil ? fmtDate(isoDay(c.validUntil)) : "no expiry"}</span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Stamp status={moduleStatus({ passed: true, validUntil: c.validUntil })} dense />
                <button className="btn btn-ghost" onClick={() => saver.save(c.certificateNo)} disabled={saver.busyNo === c.certificateNo}><Share2 size={15} /> {saver.busyNo === c.certificateNo ? "Preparing…" : "Save"}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** General Manager only: pair each Staff register entry with its login, choose which modules each person
    completes, and see where everyone has got to. */
function TeamView({ pack, branding, onExportFallback }) {
  const [people, setPeople] = useState(null);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([trainingApi.people(), trainingApi.records()]);
      setPeople(p); setRecords(r.records); setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setBusy(true); setError(null);
    try { const next = await fn(); setPeople(next); const r = await trainingApi.records(); setRecords(r.records); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const modules = pack.modules;
  const recFor = useMemo(() => {
    const m = new Map();
    records.forEach((r) => { if (r.staffId) m.set(`${r.staffId}|${r.moduleId}`, r); });
    return (staffId, moduleId) => m.get(`${staffId}|${moduleId}`);
  }, [records]);

  if (error && !people) return <div className="tr-error" role="alert">{error}</div>;
  if (!people) return <MouseLoader label="Loading the team…" />;

  const pairedTo = new Map(people.staff.filter((s) => s.userId).map((s) => [s.userId, s.name]));
  const staff = people.staff.filter((s) => showArchived || !s.archived);
  const archivedCount = people.staff.filter((s) => s.archived).length;

  const saveReport = async () => {
    const rows = [];
    for (const s of staff) {
      for (const m of modules) {
        if (!s.moduleIds.includes(m.id)) continue;
        const rec = recFor(s.id, m.id);
        rows.push({
          name: s.name, module: m.title, status: recordStatus(rec),
          completed: rec?.lastPass ? fmtDate(isoDay(rec.lastPass.completedAt)) : "",
          until: rec?.lastPass?.validUntil ? fmtDate(isoDay(rec.lastPass.validUntil)) : "",
          cert: rec?.lastPass?.certNo || "",
        });
      }
    }
    const title = "Training Report";
    const columns = [
      { key: "name", label: "Name", width: 0.2 },
      { key: "module", label: "Module", width: 0.24 },
      { key: "status", label: "Status", width: 0.17, chip: true },
      { key: "completed", label: "Completed", width: 0.13 },
      { key: "until", label: "Valid until", width: 0.13 },
      { key: "cert", label: "Certificate", width: 0.13 },
    ];
    const subtitle = `Saved ${fmtDate(todayStr())} · ${rows.length} assigned module${rows.length === 1 ? "" : "s"}`;
    const bytes = await buildRegisterPdf({ title, subtitle, branding, sections: [{ type: "table", columns, rows }] });
    const result = await exportPdfReport(`training-report-${todayStr()}.pdf`, title, bytes);
    if (result.status === "fallback") onExportFallback(result); else setSaveStatus(result.status);
  };

  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>
        Pair each staff member with their login, then tick the modules they need to complete. A person only sees the modules ticked for them.
        Pairing and ticking never change anyone's results.
      </p>
      {error && <div className="tr-error" role="alert">{error}</div>}
      <div className="tr-actions" style={{ margin: "0 0 12px" }}>
        <button className="btn btn-ghost" onClick={saveReport}><Share2 size={15} /> Save report</button>
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}>{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div>
      <SaveStatusBanner status={saveStatus} />
      {staff.length === 0 ? (
        <div className="empty-state">The Staff register is empty. Add the people who need training under Registers → Staff first.</div>
      ) : (
        <div className="tr-matrix-wrap">
          <table className="tr-matrix">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Login</th>
                {modules.map((m) => <th key={m.id}>{m.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.archived && <span className="muted"> (archived)</span>}<br /><span className="muted">{s.role || "—"}</span></td>
                  <td>
                    <select value={s.userId || ""} disabled={busy} aria-label={`Login for ${s.name}`}
                      onChange={(e) => act(() => trainingApi.setLink(s.id, e.target.value || null))}>
                      <option value="">Not paired</option>
                      {people.users.map((u) => {
                        const taken = pairedTo.get(u.id);
                        return <option key={u.id} value={u.id} disabled={!!taken && u.id !== s.userId}>{u.name}{u.email ? ` (${u.email})` : ""}{taken && u.id !== s.userId ? ` – paired with ${taken}` : ""}</option>;
                      })}
                    </select>
                    {!s.userId && s.moduleIds.length > 0 && <div className="tr-unpaired">Can't start modules until paired</div>}
                  </td>
                  {modules.map((m) => {
                    const assigned = s.moduleIds.includes(m.id);
                    const rec = recFor(s.id, m.id);
                    return (
                      <td key={m.id}>
                        <div className="tr-cell">
                          <label>
                            <input type="checkbox" checked={assigned} disabled={busy} aria-label={`${m.title} for ${s.name}`}
                              onChange={(e) => act(() => trainingApi.setAssignments([s.id], [m.id], e.target.checked))} />
                            Assigned
                          </label>
                          {(assigned || rec) && <Stamp status={recordStatus(rec)} dense />}
                          {rec?.lastPass?.validUntil && <span className="muted">until {fmtDate(isoDay(rec.lastPass.validUntil))}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** The whole Training section: a small state machine of its own (modules → briefing → assessment → result,
    plus Certificates and, for a General Manager, Team). */
export function TrainingPage({ isGM, enabled, branding, onExportFallback, onPackChanged }) {
  const [pack, setPack] = useState(null);
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("modules"); // modules | certificates | team
  const [view, setView] = useState({ name: "board" }); // board | module | quiz | result
  const saver = useCertificateSaver(branding, onExportFallback);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const [p, m] = await Promise.all([trainingApi.pack(), trainingApi.me()]);
      setPack(p); setMe(m); setLoadError(null);
    } catch (e) { setLoadError(e.message || "Couldn't load training."); }
  }, [enabled]);
  useEffect(() => { load(); }, [load]);

  // A brand-new setup: the server is meant to have training but no pack has been installed yet.
  if (!enabled) {
    return isGM
      ? <div className="module-view"><div className="module-header"><div className="module-title"><GraduationCap size={22} color="#197386" /><h2>Training</h2></div></div><TrainingPackPanel onChanged={onPackChanged} /></div>
      : <div className="empty-state">Training isn't set up on this site.</div>;
  }
  if (loadError) return <div className="module-view"><div className="tr-error" role="alert">{loadError}</div></div>;
  if (!pack || !me) return <MouseLoader label="Loading training…" />;

  const moduleById = (id) => pack.modules.find((m) => m.id === id);
  const toBoard = () => { setView({ name: "board" }); load(); };

  if (tab === "modules" && view.name === "module" && moduleById(view.id)) {
    return <ModuleView module={moduleById(view.id)} plans={pack.plans} onBack={toBoard} onStart={() => setView({ name: "quiz", id: view.id })} />;
  }
  if (tab === "modules" && view.name === "quiz" && moduleById(view.id)) {
    return <Quiz module={moduleById(view.id)} onCancel={() => setView({ name: "module", id: view.id })} onDone={(result) => { setView({ name: "result", id: view.id, result }); load(); }} />;
  }
  if (tab === "modules" && view.name === "result" && moduleById(view.id)) {
    return <ResultView module={moduleById(view.id)} result={view.result} onBack={toBoard} onRetake={() => setView({ name: "module", id: view.id })}
      onSaveCertificate={saver.save} saveStatus={saver.status} saveBusy={!!saver.busyNo} saveError={saver.error} />;
  }

  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><GraduationCap size={22} color="#197386" /><h2>Training</h2></div>
      </div>
      <div className="tr-tabs">
        <button className={"chip" + (tab === "modules" ? " chip--active" : "")} onClick={() => { setTab("modules"); setView({ name: "board" }); }}>{isGM ? "All modules" : "My modules"}</button>
        <button className={"chip" + (tab === "certificates" ? " chip--active" : "")} onClick={() => setTab("certificates")}><Award size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{isGM ? "All certificates" : "My certificates"}</button>
        {isGM && <button className={"chip" + (tab === "team" ? " chip--active" : "")} onClick={() => setTab("team")}><Users size={12} style={{ verticalAlign: -2, marginRight: 3 }} />Team &amp; assignments</button>}
        {isGM && <button className={"chip" + (tab === "pack" ? " chip--active" : "")} onClick={() => setTab("pack")}>Training pack</button>}
      </div>
      {tab === "modules" && <ModuleBoard pack={pack} me={me} onOpen={(id) => setView({ name: "module", id })} />}
      {tab === "certificates" && <CertificatesView isGM={isGM} branding={branding} onExportFallback={onExportFallback} />}
      {tab === "pack" && isGM && <TrainingPackPanel onChanged={() => { onPackChanged?.(); load(); }} />}
      {tab === "team" && isGM && <TeamView pack={pack} branding={branding} onExportFallback={onExportFallback} />}
    </div>
  );
}
