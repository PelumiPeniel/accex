import { useEffect, useState } from "react";
import { api } from "../api";

export default function GlobalSettings() {
  const [settings, setSettings] = useState(null);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/settings").then((d) => setSettings(d.settings)); }, []);

  function set(key, val) { setSettings((s) => ({ ...s, [key]: val })); }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const data = await api.put("/settings", settings);
      setSettings(data.settings);
      setBanner("Settings saved.");
      setTimeout(() => setBanner(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>;

  return (
    <div className="content-narrow">
      {banner && <div className="banner banner-success">{banner}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      <div className="card card-pad mb-24">
        <div className="section-title">Organization</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Organization name</label>
          <input className="input" value={settings.organizationName} onChange={(e) => set("organizationName", e.target.value)} />
          <span className="hint">Auto-fills the company field for Staff visitors on reports.</span>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <div className="section-title">Active Directory</div>
        <label className="flex gap-8" style={{ alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!settings.activeDirectoryEnabled}
            onChange={(e) => set("activeDirectoryEnabled", e.target.checked)}
          />
          <span>Auto-fill First name / Last name from a staff number</span>
        </label>
        <span className="hint">
          When on, typing a staff number into any staff-number field (visitor sign-in,
          Access Officer, Administrator, and System Administrator accounts) looks it up
          in the organization's Active Directory and fills in the name automatically.
          The name fields always stay editable, and if the directory can't be reached or
          has no match, nothing is filled in — it never blocks account or visitor creation.
          Requires the server's AD connection to be configured separately by IT.
        </span>
      </div>

      <div className="card card-pad mb-24">
        <div className="section-title">Session security</div>
        <div className="form-row">
          <div className="field">
            <label>Session timeout (minutes)</label>
            <input type="number" min={1} className="input" value={settings.sessionTimeoutMinutes} onChange={(e) => set("sessionTimeoutMinutes", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Warning before timeout (seconds)</label>
            <input type="number" min={10} className="input" value={settings.sessionWarningSeconds} onChange={(e) => set("sessionWarningSeconds", Number(e.target.value))} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Max failed logins before lockout</label>
            <input type="number" min={1} className="input" value={settings.maxFailedLogins} onChange={(e) => set("maxFailedLogins", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Login lockout duration (minutes)</label>
            <input type="number" min={1} className="input" value={settings.loginLockoutMinutes} onChange={(e) => set("loginLockoutMinutes", Number(e.target.value))} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Minimum password length</label>
          <input type="number" min={6} className="input" value={settings.passwordMinLength} onChange={(e) => set("passwordMinLength", Number(e.target.value))} />
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <span className="spinner" /> : "Save settings"}
      </button>
    </div>
  );
}
