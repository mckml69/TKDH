import React, { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Users,
  UserPlus,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { Ledger } from "../records/RecordList";
import { ErrorBanner, FormPage } from "../shared/UI";
import { ROLES } from "../../lib/constants";
import { uid, validateUser } from "../../lib/helpers";
import { storageMode } from "../../lib/storage";
import { API_BASE } from "../../lib/storage/apiAdapter";

const isApiMode = storageMode === "api";

export function UserFormPage({ user, users, onSave, onClose }) {
  const [form, setForm] = useState(user || { id: uid(), name: "", email: "", role: "Employee", tags: [] });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !user;
  const needsPassword = isApiMode && isNew;

  const handleSubmit = async () => {
    const errs = validateUser(form, users);
    if (needsPassword) {
      if (password.length < 8) errs.push("Password must be at least 8 characters.");
      else if (password !== confirmPassword) errs.push("Passwords don't match.");
    }
    if (errs.length) { setErrors(errs); return; }
    setBusy(true);
    try {
      await onSave(form, needsPassword ? password : null);
    } catch (e) {
      setErrors([e.message || "Couldn't save that user."]);
      setBusy(false);
    }
  };
  return (
    <>
      <FormPage title={user ? "Edit user" : "New user"} onClose={onClose} footer={<button type="button" className="btn btn-primary" disabled={busy} onClick={handleSubmit}>{user ? "Save changes" : "Add user"}</button>}>
        <ErrorBanner errors={errors} />
        <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Jane Smith" /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@yourhotel.com" /></label>
        <label>Role
          <select value={form.role} onChange={(e) => set("role", e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <p className="muted" style={{ margin: 0 }}>{form.role === "General Manager" ? "Full access: edit, delete, manage users, view sensitive information." : "Can create records, complete checks, and attach evidence. Cannot edit or delete once saved, or view sensitive information."}</p>
        {needsPassword && (
          <>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
            <label>Confirm password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
          </>
        )}
      </FormPage>
    </>
  );
}

/** Sets a user's password — GM resetting someone else's needs no current password;
    anyone changing their own must confirm the current one first. */
export function ResetPasswordPage({ targetUser, requireCurrentPassword, onSubmit, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const handleSubmit = async () => {
    const errs = [];
    if (requireCurrentPassword && !currentPassword) errs.push("Enter your current password.");
    if (newPassword.length < 8) errs.push("New password must be at least 8 characters.");
    else if (newPassword !== confirmPassword) errs.push("New passwords don't match.");
    if (errs.length) { setErrors(errs); return; }
    setBusy(true);
    try {
      await onSubmit(newPassword, currentPassword);
    } catch (e) {
      setErrors([e.message || "Couldn't update the password."]);
      setBusy(false);
    }
  };
  return (
    <FormPage title={requireCurrentPassword ? "Change my password" : `Reset password — ${targetUser?.name}`} onClose={onClose} footer={<button type="button" className="btn btn-primary" disabled={busy} onClick={handleSubmit}>Save</button>}>
      <ErrorBanner errors={errors} />
      {requireCurrentPassword && <label>Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>}
      <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" /></label>
      <label>Confirm new password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
    </FormPage>
  );
}

export function UsersList({ users, currentUser, onAdd, onEdit, onDelete, onRestore, onResetPassword }) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = users.filter((u) => u.archived).length;
  const filtered = users.filter((u) => (showArchived ? u.archived : !u.archived));
  return (
    <div className="module-view">
      <div className="module-header">
        <div className="module-title"><ShieldCheck size={22} color="#16263D" /><h2>Users &amp; permissions</h2></div>
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New user</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>General Managers have full access, including editing, deletion, and this page. Employees can create records, complete checks, and attach evidence, but can't edit or delete once saved — they can request a correction instead.</p>
      <div className="filter-rail"><div className="chip-row">
        {(archivedCount > 0 || showArchived) && <button className={"chip" + (showArchived ? " chip--active" : "")} onClick={() => setShowArchived((s) => !s)}><Archive size={12} style={{ verticalAlign: -2, marginRight: 3 }} />{showArchived ? "Hide" : "Show"} archived ({archivedCount})</button>}
      </div></div>
      {filtered.length === 0 ? (
        <div className="empty-state">{showArchived ? "No archived users." : "No other users yet."}</div>
      ) : (
        <div className="ledger-table">
          <div className="ledger-row ledger-row--asset ledger-row--head"><span>Name</span><span>Email</span><span>Role</span><span></span><span></span><span></span></div>
          {filtered.map((u) => (
            <div className="ledger-row ledger-row--asset" key={u.id}>
              <span className="mono-strong">{u.name}{u.id === currentUser?.id && <span className="tag-pill">You</span>}{u.archived && <span className="flag-tag" style={{ color: "#8A6D1F", background: "#FCF6EE" }}>Archived</span>}</span>
              <span className="muted">{u.email}</span>
              <span><span className="cat-tag" style={{ background: u.role === "General Manager" ? "#EAF3EC" : "#F1EEE6", color: u.role === "General Manager" ? "#2F6B4C" : "#6E6A61" }}>{u.role}</span></span>
              <span></span>
              <span></span>
              <span className="row-actions">
                {isApiMode && !u.archived && <button className="icon-btn" title="Reset password" onClick={() => onResetPassword(u)}><KeyRound size={15} /></button>}
                {!u.archived && <button className="icon-btn" onClick={() => onEdit(u)}><Pencil size={15} /></button>}
                {u.id !== currentUser?.id && (u.archived
                  ? <button className="icon-btn" onClick={() => onRestore(u.id)}><ArchiveRestore size={15} /></button>
                  : <button className="icon-btn" onClick={() => onDelete(u.id)}><Archive size={15} /></button>)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiSignIn({ onLogin, onBootstrap }) {
  const [needsBootstrap, setNeedsBootstrap] = useState(null); // null = still checking
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/bootstrap-status`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setNeedsBootstrap(!!d.needsBootstrap); })
      .catch(() => { if (!cancelled) setNeedsBootstrap(false); });
    return () => { cancelled = true; };
  }, []);

  const handleBootstrap = async () => {
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await onBootstrap({ name: name.trim(), email: email.trim(), password });
    } catch (e) {
      setError(e.message || "Couldn't set up that account.");
      setBusy(false);
    }
  };
  const handleLogin = async () => {
    setError("");
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      setError("Incorrect email or password.");
      setBusy(false);
    }
  };

  if (needsBootstrap === null) return <div className="signin-screen"><div className="signin-card"><ShieldCheck size={26} color="#16263D" /><h1>Compliance Ledger</h1></div></div>;

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <ShieldCheck size={26} color="#16263D" />
        <h1>Compliance Ledger</h1>
        {needsBootstrap ? (
          <>
            <p>Nobody's set up yet. Create the first account — it becomes the General Manager account, with full access.</p>
            <ErrorBanner errors={error ? [error] : []} />
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Taylor" /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@yourhotel.com" /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
            <label>Confirm password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
            <button className="btn btn-primary" disabled={busy} onClick={handleBootstrap}>Create GM account</button>
          </>
        ) : (
          <>
            <p>Sign in to continue.</p>
            <ErrorBanner errors={error ? [error] : []} />
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@yourhotel.com" /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className="btn btn-primary" disabled={busy} onClick={handleLogin}>Sign in</button>
            <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 0" }}>Forgot your password? Ask your General Manager to reset it from Users &amp; Permissions.</p>
          </>
        )}
        <p className="signin-note">Every action is attributed to whoever's signed in — always sign out on a shared device when you're done.</p>
      </div>
    </div>
  );
}

export function SignInScreen({ users, onSignIn, onCreateUser, onLogin, onBootstrap }) {
  if (isApiMode) return <ApiSignIn onLogin={onLogin} onBootstrap={onBootstrap} />;

  const isFirstUser = users.filter((u) => !u.archived).length === 0;
  const [showAdd, setShowAdd] = useState(isFirstUser);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const handleAdd = () => {
    if (!name.trim()) { setError("Enter your name."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email."); return; }
    const dupe = users.some((u) => !u.archived && u.email.trim().toLowerCase() === email.trim().toLowerCase());
    if (dupe) { setError("That email is already registered — find your name in the list instead."); return; }
    const role = isFirstUser ? "General Manager" : "Employee";
    onCreateUser({ id: uid(), name: name.trim(), email: email.trim(), role, tags: [] });
  };
  return (
    <div className="signin-screen">
      <div className="signin-card">
        <ShieldCheck size={26} color="#16263D" />
        <h1>Compliance Ledger</h1>
        {isFirstUser ? (
          <>
            <p>Nobody's set up yet. Create the first account — it becomes the General Manager account, with full access.</p>
            <ErrorBanner errors={error ? [error] : []} />
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Taylor" /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@yourhotel.com" /></label>
            <button className="btn btn-primary" onClick={handleAdd}>Create GM account</button>
          </>
        ) : showAdd ? (
          <>
            <ErrorBanner errors={error ? [error] : []} />
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Smith" /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@yourhotel.com" /></label>
            <button className="btn btn-primary" onClick={handleAdd}>Add me as Employee</button>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setError(""); }}>Back to the list</button>
          </>
        ) : (
          <>
            <p>Who's working today?</p>
            <div className="signin-user-list">
              {users.filter((u) => !u.archived).map((u) => (
                <button key={u.id} className="signin-user-card" onClick={() => onSignIn(u.id)}>
                  <span className="signin-user-name">{u.name}</span>
                  <span className="signin-user-role">{u.role}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => setShowAdd(true)}><UserPlus size={15} /> I'm not on this list</button>
          </>
        )}
        <p className="signin-note">This identifies who's using the app so every entry is properly attributed to the right person — it isn't a password-protected login. Anyone with access to this device can select any name from the list.</p>
      </div>
    </div>
  );
}
