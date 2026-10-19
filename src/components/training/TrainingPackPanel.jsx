import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { trainingApi } from "../../lib/training/api";

/** File -> base64 text, in chunks (a single String.fromCharCode(...bytes) call overflows on large images). */
async function toBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** What to upload from whatever was chosen, as { file, name } where name is how the server expects it: "pack.json", a
    floor-plan PNG by its bare name, or a briefing photo (.jpg/.jpeg/.webp) as "images/<name>". Anything else in a folder is ignored. */
export function pickPackFiles(fileList) {
  const out = [];
  for (const f of fileList) {
    if (f.name === "pack.json") out.push({ file: f, name: "pack.json" });
    else if (/\.(jpe?g|webp)$/i.test(f.name)) out.push({ file: f, name: "images/" + f.name });
    else if (/\.png$/i.test(f.name)) out.push({ file: f, name: f.name });
  }
  return out;
}

/**
 * General Manager only: shows which training pack is installed and installs or replaces it from the pack folder
 * on this computer. The server validates everything before writing anything, so a bad file is refused with a
 * reason and the live pack is left as it was.
 */
export function TrainingPackPanel({ onChanged }) {
  const [info, setInfo] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const folderRef = useRef(null);
  const filesRef = useRef(null);

  const load = useCallback(async () => {
    try { setInfo(await trainingApi.packInfo()); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const choose = (e) => { setChosen(pickPackFiles(e.target.files)); setMessage(null); setError(null); };

  const upload = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const files = [];
      for (const c of chosen) files.push({ name: c.name, contentBase64: await toBase64(c.file) });
      const res = await trainingApi.installPack(files);
      setMessage(`Installed ${res.installed.length} file${res.installed.length === 1 ? "" : "s"}.${res.enabled ? " Training is now available." : ""}`);
      setChosen([]);
      if (folderRef.current) folderRef.current.value = "";
      if (filesRef.current) filesRef.current.value = "";
      await load();
      onChanged?.();
    } catch (e) { setError(e.message || "The upload failed."); }
    finally { setBusy(false); }
  };

  const hasPack = chosen.some((c) => c.name === "pack.json");
  const photoCount = chosen.filter((c) => c.name.startsWith("images/")).length;
  const planCount = chosen.filter((c) => c.name !== "pack.json" && !c.name.startsWith("images/")).length;
  return (
    <div>
      <p className="muted" style={{ marginBottom: 12 }}>
        The training pack holds the briefings, questions, answers and contact details. It is kept on the server, never in the public code.
        Install it here the first time, and again whenever you change the questions or briefings (a changed module needs a new version number in the pack).
      </p>
      {info && (
        info.pack ? (
          <div className="ledger-table" style={{ marginBottom: 16 }}>
            {info.pack.modules.map((m) => (
              <div className="ledger-row" key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span><strong>{m.title}</strong><br /><span className="muted">{m.questions} questions</span></span>
                <span className="muted">version {m.version}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="tr-note">{info.configured ? "No training pack is installed yet." : "This server isn't set up for training: the TRAINING_PACK_DIR setting is missing."}</div>
        )
      )}
      {info?.configured && (
        <>
          <p style={{ marginBottom: 8 }}><strong>Choose the pack folder</strong> (the one containing <code>pack.json</code> and a <code>plans</code> folder), or pick the files individually (the pack folder also holds an <code>images</code> folder of briefing photos):</p>
          <div className="tr-actions" style={{ margin: "0 0 10px" }}>
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              <Upload size={15} /> Choose folder…
              <input ref={folderRef} type="file" style={{ display: "none" }} webkitdirectory="" directory="" multiple onChange={choose} />
            </label>
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              <Upload size={15} /> Choose files…
              <input ref={filesRef} type="file" style={{ display: "none" }} multiple accept=".json,.png" onChange={choose} />
            </label>
          </div>
          {chosen.length > 0 && (
            <p className="muted" style={{ marginBottom: 8 }}>
              {hasPack ? "pack.json" : "No pack.json chosen"} · {planCount} floor plan image{planCount === 1 ? "" : "s"} · {photoCount} briefing photo{photoCount === 1 ? "" : "s"}
            </p>
          )}
          <button className="btn btn-primary" onClick={upload} disabled={busy || chosen.length === 0}>{busy ? "Installing…" : "Install on the server"}</button>
        </>
      )}
      {message && <div className="print-hint" style={{ marginTop: 12 }}>{message}</div>}
      {error && <div className="tr-error" role="alert">{error}</div>}
    </div>
  );
}
