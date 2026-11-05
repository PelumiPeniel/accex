import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import NameFields from "../components/NameFields";
import PasswordFields, { passwordsValid } from "../components/PasswordFields";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { tryStaffLookup } from "../utils/staffLookup";

export default function StaffAccounts() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [banner, setBanner] = useState("");

  async function load() {
    setLoading(true);
    const u = await api.get("/users");
    setUsers(u.users);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(""), 3500); }

  async function toggleStatus(u) {
    await api.patch("/users/" + u.id + "/status", { status: u.status === "Active" ? "Inactive" : "Active" });
    flash(u.fullName + " status updated.");
    load();
  }

  return (
    <div>
      {banner && <div className="banner banner-success">{banner}</div>}
      <div className="flex-between mb-16">
        <div className="section-title" style={{ marginBottom: 0 }}>Access Officers</div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Create Officer</button>
      </div>

      <div className="card">
        <div className="card-pad">
          {loading ? (
            <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Staff No.</th><th>Username</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.fullName}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{u.staffNumber}</td>
                      <td>{u.username}</td>
                      <td><span className={"badge " + (u.status === "Active" ? "badge-active" : "badge-cancelled")}>{u.status}</span></td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>Reset PW</button>
                          <button
                            className={"btn btn-sm " + (u.status === "Active" ? "btn-outline" : "btn-success")}
                            onClick={() => toggleStatus(u)}
                            disabled={u.id === me.id}
                          >
                            {u.status === "Active" ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <CreateOfficerModal onClose={() => setCreating(false)} onDone={(msg) => { setCreating(false); flash(msg); load(); }} />
      )}
      {editing && (
        <EditOfficerModal user={editing} onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); flash(msg); load(); }} />
      )}
      {resetting && (
        <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} onDone={(msg) => { setResetting(null); flash(msg); }} />
      )}
    </div>
  );
}

function CreateOfficerModal({ onClose, onDone }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", staffNumber: "", username: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = passwordsValid(form.password, confirmPassword);

  async function onStaffNumberBlur(value) {
    const match = await tryStaffLookup(value);
    if (match) {
      setForm((f) => ({ ...f, firstName: match.firstName || f.firstName, lastName: match.lastName || f.lastName }));
    }
  }

  async function submit() {
    setError("");
    if (!canSubmit) {
      setError("Passwords must match before you can create this account.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/users", form);
      onDone(`${form.firstName} ${form.lastName} was created.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Create Access Officer"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !canSubmit}>
            {loading ? <span className="spinner" /> : "Create"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="field">
        <label>Staff number</label>
        <input className="input" value={form.staffNumber} onChange={(e) => set("staffNumber", e.target.value)} onBlur={(e) => onStaffNumberBlur(e.target.value)} />
      </div>
      <NameFields
        firstName={form.firstName}
        lastName={form.lastName}
        onFirstNameChange={(v) => set("firstName", v)}
        onLastNameChange={(v) => set("lastName", v)}
      />
      <div className="field"><label>Username</label><input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} /></div>
      <PasswordFields
        password={form.password}
        onPasswordChange={(v) => set("password", v)}
        confirmPassword={confirmPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />
    </Modal>
  );
}

function EditOfficerModal({ user, onClose, onDone }) {
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, staffNumber: user.staffNumber });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function onStaffNumberBlur(value) {
    const match = await tryStaffLookup(value);
    if (match) {
      setForm((f) => ({ ...f, firstName: match.firstName || f.firstName, lastName: match.lastName || f.lastName }));
    }
  }

  async function submit() {
    setError("");
    setLoading(true);
    try {
      await api.put("/users/" + user.id, form);
      onDone(`${form.firstName} ${form.lastName} was updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={"Edit - " + user.fullName}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner" /> : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="field">
        <label>Staff number</label>
        <input className="input" value={form.staffNumber} onChange={(e) => set("staffNumber", e.target.value)} onBlur={(e) => onStaffNumberBlur(e.target.value)} />
      </div>
      <NameFields
        firstName={form.firstName}
        lastName={form.lastName}
        onFirstNameChange={(v) => set("firstName", v)}
        onLastNameChange={(v) => set("lastName", v)}
      />
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = passwordsValid(newPassword, confirmPassword);

  async function submit() {
    setError("");
    if (!canSubmit) {
      setError("Passwords must match before you can reset this account's password.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/users/" + user.id + "/reset-password", { newPassword });
      onDone("Password reset for " + user.fullName + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={"Reset password - " + user.fullName}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !canSubmit}>
            {loading ? <span className="spinner" /> : "Reset"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <PasswordFields
        passwordLabel="New password"
        password={newPassword}
        onPasswordChange={setNewPassword}
        confirmPassword={confirmPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />
    </Modal>
  );
}
