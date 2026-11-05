import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import NameFields from "../components/NameFields";
import PasswordFields, { passwordsValid } from "../components/PasswordFields";
import { api } from "../api";
import { tryStaffLookup } from "../utils/staffLookup";

export default function AccessPoints() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [managingStaff, setManagingStaff] = useState(null);
  const [banner, setBanner] = useState("");

  async function load() {
    setLoading(true);
    const d = await api.get("/access-points");
    setPoints(d.accessPoints);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(""), 3000); }

  async function toggle(ap) {
    await api.patch("/access-points/" + ap.id + "/status", { active: !ap.active });
    flash(ap.name + " status updated.");
    load();
  }

  return (
    <div>
      {banner && <div className="banner banner-success">{banner}</div>}
      <div className="flex-between mb-16">
        <div className="section-title" style={{ marginBottom: 0 }}>Access Points</div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Create Access Point</button>
      </div>

      <div className="card">
        <div className="card-pad">
          {loading ? (
            <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Department</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {points.map((ap) => (
                    <tr key={ap.id}>
                      <td>{ap.name}</td>
                      <td>{ap.department}</td>
                      <td><span className={"badge " + (ap.active ? "badge-active" : "badge-cancelled")}>{ap.active ? "Active" : "Inactive"}</span></td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-navy btn-sm" onClick={() => setManagingStaff(ap)}>Manage Staff</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(ap)}>Edit</button>
                          <button className={"btn btn-sm " + (ap.active ? "btn-outline" : "btn-success")} onClick={() => toggle(ap)}>
                            {ap.active ? "Deactivate" : "Reactivate"}
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
        <AccessPointModal
          title="Create Access Point"
          onClose={() => setCreating(false)}
          onDone={(msg) => { setCreating(false); flash(msg); load(); }}
          submitFn={(body) => api.post("/access-points", body)}
        />
      )}
      {editing && (
        <AccessPointModal
          title={"Edit - " + editing.name}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); flash(msg); load(); }}
          submitFn={(body) => api.put("/access-points/" + editing.id, body)}
        />
      )}
      {managingStaff && (
        <AccessPointStaffModal
          accessPoint={managingStaff}
          allPoints={points}
          onClose={() => setManagingStaff(null)}
          flashParent={flash}
        />
      )}
    </div>
  );
}

function AccessPointModal({ title, initial, onClose, onDone, submitFn }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [department, setDepartment] = useState(initial ? initial.department : "");
  const [entryRules, setEntryRules] = useState(initial ? initial.entryRules : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      await submitFn({ name, department, entryRules });
      onDone((initial ? "Updated " : "Created ") + name + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={560}
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
      <div className="form-row">
        <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse" /></div>
        <div className="field"><label>Department</label><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Facility" /></div>
      </div>
      <div className="field">
        <label>Entry rules (shown to visitors before sign-in)</label>
        <textarea className="input" rows={10} value={entryRules} onChange={(e) => setEntryRules(e.target.value)} />
      </div>
    </Modal>
  );
}

// The actual hub this whole restructure was about: select an Access
// Point, see everyone assigned to it — Administrators and Access
// Officers together, not split across pages System Administrator can't
// all reach — and create, reset, regroup, or deactivate any of them
// right here, scoped to this one location the whole time.
function AccessPointStaffModal({ accessPoint, allPoints, onClose, flashParent }) {
  const [administrators, setAdministrators] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [banner, setBanner] = useState("");

  async function load() {
    setLoading(true);
    const d = await api.get("/access-points/" + accessPoint.id + "/staff");
    setAdministrators(d.administrators);
    setOfficers(d.officers);
    setLoading(false);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(""), 3000); }

  async function toggleStatus(u) {
    await api.patch("/users/" + u.id + "/status", { status: u.status === "Active" ? "Inactive" : "Active" });
    flash(u.fullName + " status updated.");
    load();
  }

  function StaffTable({ title, rows, roleLabel, allowReassign }) {
    return (
      <div className="mb-24">
        <div className="section-title" style={{ fontSize: 13 }}>{title}</div>
        {rows.length === 0 ? (
          <div className="empty-state" style={{ padding: "20px 0" }}>No {roleLabel} at this Access Point yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Staff No.</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{u.staffNumber}</td>
                    <td><span className={"badge " + (u.status === "Active" ? "badge-active" : "badge-cancelled")}>{u.status}</span></td>
                    <td>
                      <div className="flex gap-8">
                        {allowReassign && <button className="btn btn-ghost btn-sm" onClick={() => setReassigning(u)}>Reassign</button>}
                        <button className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>Reset PW</button>
                        <button className={"btn btn-sm " + (u.status === "Active" ? "btn-outline" : "btn-success")} onClick={() => toggleStatus(u)}>
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
    );
  }

  return (
    <>
      <Modal title={"Staff — " + accessPoint.name} onClose={onClose} width={720}>
        {banner && <div className="banner banner-success">{banner}</div>}
        <div className="flex-between mb-16">
          <span className="text-sm muted">Everyone assigned to this Access Point.</span>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Create User</button>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
        ) : (
          <>
            <StaffTable title="Administrators" rows={administrators} roleLabel="Administrators" allowReassign />
            <StaffTable title="Access Officers" rows={officers} roleLabel="Access Officers" allowReassign />
          </>
        )}
      </Modal>

      {creating && (
        <CreateStaffModal
          accessPoint={accessPoint}
          onClose={() => setCreating(false)}
          onDone={(msg) => { setCreating(false); flash(msg); load(); }}
        />
      )}
      {reassigning && (
        <ReassignModal
          user={reassigning}
          points={allPoints.filter((p) => p.active)}
          onClose={() => setReassigning(null)}
          onDone={(msg) => { setReassigning(null); flashParent(msg); onClose(); }}
        />
      )}
      {resetting && (
        <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} onDone={(msg) => { setResetting(null); flash(msg); }} />
      )}
    </>
  );
}

function CreateStaffModal({ accessPoint, onClose, onDone }) {
  const [role, setRole] = useState("AccessOfficer");
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
      await api.post("/users", { ...form, role, accessPointId: accessPoint.id });
      onDone(`${form.firstName} ${form.lastName} was created as ` + (role === "Administrator" ? "an Administrator" : "an Access Officer") + " at " + accessPoint.name + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={"Create User — " + accessPoint.name}
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
        <label>Role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="AccessOfficer">Access Officer</option>
          <option value="Administrator">Administrator</option>
        </select>
      </div>
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

function ReassignModal({ user, points, onClose, onDone }) {
  const [accessPointId, setAccessPointId] = useState(points[0] ? points[0].id : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      await api.patch("/users/" + user.id + "/access-point", { accessPointId });
      onDone(user.fullName + " reassigned.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={"Reassign - " + user.fullName}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner" /> : "Reassign"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="field">
        <label>New Access Point</label>
        <select className="input" value={accessPointId} onChange={(e) => setAccessPointId(e.target.value)}>
          {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
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
