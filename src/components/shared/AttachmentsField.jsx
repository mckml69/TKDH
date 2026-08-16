import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Loader2,
  Paperclip,
  Download,
  Camera,
  Mic,
  Square,
  FileUp,
} from "lucide-react";
import { MAX_FILE_BYTES } from "../../lib/constants";
import { compressImageDataUrl, fmtDate, formatBytes, readFileAsDataURL, todayStr, uid } from "../../lib/helpers";

export function AttachmentsField({ recordId, attachments, setAttachments, readOnly }) {
  const [cache, setCache] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // Fetch thumbnails for existing photo attachments so evidence is visible at a glance, not just filenames.
  useEffect(() => {
    const missing = attachments.filter((a) => a.kind === "photo" && !cache[a.fileId]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const a of missing) {
        try {
          const res = await window.storage.get(`attach-${recordId}-${a.fileId}`, true);
          if (!cancelled && res) setCache((prev) => ({ ...prev, [a.fileId]: res.value }));
        } catch {}
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  const storeAttachment = async (dataUrl, name, size, kind, transcript) => {
    const fileId = uid();
    await window.storage.set(`attach-${recordId}-${fileId}`, dataUrl, true);
    const meta = { fileId, name, size, uploadedAt: todayStr(), kind, transcript: transcript || undefined };
    setAttachments((prev) => [...prev, meta]);
    setCache((prev) => ({ ...prev, [fileId]: dataUrl }));
  };

  const handleFiles = async (fileList, kind) => {
    setErr(null);
    for (const file of Array.from(fileList)) {
      const isImage = file.type.startsWith("image/");
      setBusy(file.name);
      try {
        let dataUrl = await readFileAsDataURL(file);
        let size = file.size;
        if (isImage) {
          dataUrl = await compressImageDataUrl(dataUrl);
          size = Math.round((dataUrl.length * 3) / 4); // approx bytes from base64 length
        }
        if (size > MAX_FILE_BYTES) { setErr(`${file.name} is still over the 3.5MB limit after compression.`); continue; }
        await storeAttachment(dataUrl, file.name, size, kind || (isImage ? "photo" : "file"));
      } catch { setErr(`Couldn't add ${file.name}.`); }
    }
    setBusy(null);
  };

  const startVoiceNote = async () => {
    setErr(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr("Voice notes aren't supported in this browser — try Take Photo or Choose File instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      setLiveTranscript("");
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          const recognition = new SR();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (e) => {
            let text = "";
            for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
            setLiveTranscript(text.trim());
          };
          recognition.onerror = () => {}; // transcription is best-effort; the audio recording is what matters
          recognition.start();
          recognitionRef.current = recognition;
        } catch { recognitionRef.current = null; }
      }
    } catch {
      setErr("Couldn't access the microphone — check your browser's permission for this site, or try Take Photo / Choose File instead.");
    }
  };

  const stopVoiceNote = () => {
    clearInterval(timerRef.current);
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    const recorder = mediaRecorderRef.current;
    if (!recorder) { setRecording(false); return; }
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) return;
      setBusy("voice note");
      try {
        const dataUrl = await readFileAsDataURL(blob);
        const name = `Voice note ${fmtDate(todayStr())} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.webm`;
        await storeAttachment(dataUrl, name, blob.size, "voice", liveTranscript.trim());
      } catch { setErr("Couldn't save the voice note."); }
      setBusy(null);
    };
    recorder.stop();
  };

  const handleRemove = async (fileId) => {
    try { await window.storage.delete(`attach-${recordId}-${fileId}`, true); } catch {}
    setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));
  };
  const handleDownload = async (att) => {
    let dataUrl = cache[att.fileId];
    if (!dataUrl) {
      try { dataUrl = (await window.storage.get(`attach-${recordId}-${att.fileId}`, true)).value; }
      catch { setErr("Couldn't load that file."); return; }
    }
    const a = document.createElement("a");
    a.href = dataUrl; a.download = att.name; a.click();
  };

  return (
    <div className="attach-field">
      <span className="field-label">Evidence <span className="muted">(photos, voice notes, files — up to 3.5MB each)</span></span>
      {attachments.length > 0 && (
        <div className="attach-grid">
          {attachments.map((a) => (
            <div className="attach-tile" key={a.fileId}>
              {a.kind === "photo" ? (
                cache[a.fileId]
                  ? <img className="attach-thumb" src={cache[a.fileId]} alt={a.name} onClick={() => handleDownload(a)} />
                  : <div className="attach-thumb attach-thumb--loading"><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /></div>
              ) : a.kind === "voice" ? (
                <div className="attach-thumb attach-thumb--voice" onClick={() => handleDownload(a)}><Mic size={18} /></div>
              ) : (
                <div className="attach-thumb attach-thumb--file" onClick={() => handleDownload(a)}><Paperclip size={16} /></div>
              )}
              <div className="attach-tile-info">
                <span className="attach-name">{a.name}</span>
                {a.transcript && <span className="attach-transcript">"{a.transcript}"</span>}
                <span className="muted" style={{ fontSize: 11 }}>{formatBytes(a.size)}</span>
              </div>
              <div className="attach-tile-actions">
                <button type="button" className="icon-btn" onClick={() => handleDownload(a)}><Download size={14} /></button>
                {!readOnly && <button type="button" className="icon-btn icon-btn--danger" onClick={() => handleRemove(a.fileId)}><X size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!readOnly && !recording && (
        <div className="capture-buttons">
          <label className="capture-btn">
            <Camera size={20} /><span>Take Photo</span>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files, "photo"); e.target.value = ""; }} />
          </label>
          <button type="button" className="capture-btn" onClick={startVoiceNote}>
            <Mic size={20} /><span>Voice Note</span>
          </button>
          <label className="capture-btn">
            <FileUp size={20} /><span>Choose File</span>
            <input type="file" multiple hidden onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files, "file"); e.target.value = ""; }} />
          </label>
        </div>
      )}
      {recording && (
        <div className="recording-bar">
          <span className="recording-dot" /> Recording — {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
          {liveTranscript && <span className="recording-transcript">"{liveTranscript}"</span>}
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={stopVoiceNote}><Square size={14} /> Stop</button>
        </div>
      )}
      {busy && <span className="muted" style={{ fontSize: 12.5 }}><Loader2 size={12} style={{ animation: "spin 1s linear infinite", verticalAlign: -2 }} /> Adding {busy}…</span>}
      {err && <span className="upload-err">{err}</span>}
    </div>
  );
}
