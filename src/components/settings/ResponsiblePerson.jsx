import React, { useState } from "react";
import {
  Pencil,
  Phone,
  UserCheck,
} from "lucide-react";
import { FormPage } from "../shared/UI";

export function ResponsiblePersonFormPage({ person, onSave, onClose }) {
  const [form, setForm] = useState({ name: person.name || "", role: person.role || "", phone: person.phone || "", email: person.email || "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <FormPage title="Named Responsible Person" onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={() => onSave(form)}>Save</button>}>
        <p className="muted" style={{ margin: 0 }}>The Fire Safety Order (and similar regulations) require a named person accountable for compliance duties. Set who that is here — it's shown on your dashboard so it's never in doubt.</p>
        <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Alex Morgan" /></label>
        <label>Role / title<input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. General Manager — Responsible Person" /></label>
        <div className="row-2">
          <label>Phone<input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
        </div>
      </FormPage>
    </>
  );
}

export function ResponsiblePersonCard({ person, onEdit }) {
  return (
    <div className="feed-section">
      <div className="feed-section-head">
        <h3><UserCheck size={16} color="#16263D" /> Named Responsible Person</h3>
        <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: "4px 8px" }} onClick={onEdit}><Pencil size={13} /> {person.name ? "Edit" : "Set"}</button>
      </div>
      {!person.name ? (
        <p className="empty-state" style={{ padding: 14 }}>No responsible person set yet — the Fire Safety Order requires one named person accountable for compliance.</p>
      ) : (
        <div className="asset-info-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 0 }}>
          <div><span className="field-label">Name</span><p>{person.name}</p></div>
          <div><span className="field-label">Role</span><p>{person.role || "—"}</p></div>
          <div><span className="field-label">Phone</span><p>{person.phone || "—"}</p></div>
          <div><span className="field-label">Email</span><p>{person.email || "—"}</p></div>
        </div>
      )}
    </div>
  );
}
