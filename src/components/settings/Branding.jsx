import React, { useState } from "react";
import { Pencil, Image as ImageIcon, X, FileBadge2 } from "lucide-react";
import { FormPage } from "../shared/UI";
import { compressImageDataUrl, readFileAsDataURL } from "../../lib/helpers";

export function BrandingFormPage({ branding, onSave, onClose }) {
  const [form, setForm] = useState({
    companyName: branding.companyName || "",
    address: branding.address || "",
    registrationNumber: branding.registrationNumber || "",
    footerText: branding.footerText || "",
    logoDataUrl: branding.logoDataUrl || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogoFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Logo must be an image file."); return; }
    setErr(null);
    setBusy(true);
    try {
      const raw = await readFileAsDataURL(file);
      const compressed = await compressImageDataUrl(raw, 480, 0.88);
      set("logoDataUrl", compressed);
    } catch {
      setErr("Couldn't read that image — try a different file.");
    }
    setBusy(false);
  };

  return (
    <FormPage title="Report Branding" onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={() => onSave(form)}>Save</button>}>
      <p className="muted" style={{ margin: 0 }}>
        Shown on every exported report — Fire Log, Window Restriction, and every register's PDF/HTML export. Leave anything blank to omit it.
      </p>

      <label>Logo
        {form.logoDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            <img src={form.logoDataUrl} alt="Logo preview" style={{ maxHeight: 64, maxWidth: 220, border: "1px solid var(--line)", borderRadius: 6, background: "#fff", padding: 4 }} />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5, padding: "4px 8px" }} onClick={() => set("logoDataUrl", "")}><X size={13} /> Remove</button>
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              <ImageIcon size={14} /> {busy ? "Uploading…" : "Upload logo image"}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => handleLogoFile(e.target.files)} />
            </label>
          </div>
        )}
      </label>
      {err && <p style={{ color: "#B8862B", fontSize: 12.5, margin: 0 }}>{err}</p>}

      <label>Business name<input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. The King's Head Hotel" /></label>
      <label>Address<textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="e.g. 12 High Street, Oxford, OX1 4AA" /></label>
      <label>Registration / license number<input value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="e.g. Company no. 01234567, Fire safety licence FS-000" /></label>
      <label>Footer text <span className="muted">(shown at the bottom of every export)</span>
        <input value={form.footerText} onChange={(e) => set("footerText", e.target.value)} placeholder="e.g. Issued by The King's Head Hotel — confidential" />
      </label>
    </FormPage>
  );
}

export function BrandingCard({ branding, onEdit }) {
  const hasAny = branding.companyName || branding.logoDataUrl || branding.registrationNumber;
  return (
    <div className="feed-section">
      <div className="feed-section-head">
        <h3><FileBadge2 size={16} color="#16263D" /> Report Branding</h3>
        <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: "4px 8px" }} onClick={onEdit}><Pencil size={13} /> {hasAny ? "Edit" : "Set"}</button>
      </div>
      {!hasAny ? (
        <p className="empty-state" style={{ padding: 14 }}>No logo or business details set yet — add them so exported reports carry your letterhead.</p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "2px 0" }}>
          {branding.logoDataUrl && <img src={branding.logoDataUrl} alt="Logo" style={{ maxHeight: 44, maxWidth: 140 }} />}
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>{branding.companyName || "—"}</p>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{branding.registrationNumber || "No registration number set"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
