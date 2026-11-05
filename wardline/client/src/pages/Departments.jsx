import { useEffect, useState } from "react";
import { api } from "../api";

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");

  async function load() {
    setLoading(true);
    const d = await api.get("/departments/all");
    setDepartments(d.departments);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(""), 3000); }

  async function add() {
    setError("");
    if (!name.trim()) return;
    try {
      await api.post("/departments", { name });
      setName("");
      flash("Department added.");
      load();
    } catch (err) { setError(err.message); }
  }

  async function saveRename(dept) {
    setError("");
    try {
      await api.put("/departments/" + dept.id, { name: editName });
      setEditingId(null);
      flash("Department renamed.");
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggle(dept) {
    setError("");
    try {
      await api.patch("/departments/" + dept.id + "/status", { active: !dept.active });
      flash(dept.active ? "Department deactivated." : "Department reactivated.");
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(dept) {
    setError("");
    if (!window.confirm('Permanently remove "' + dept.name + '"? This cannot be undone.')) return;
    try {
      await api.delete("/departments/" + dept.id);
      flash("Department removed.");
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="content-narrow">
      {banner && <div className="banner banner-success">{banner}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      <div className="card card-pad mb-24 anim-fade-up">
        <div className="section-title">Add department</div>
        <div className="flex gap-8">
          <input className="input" placeholder="e.g. Security" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" onClick={add}>Add</button>
        </div>
      </div>

      <div className="card card-pad anim-fade-up">
        <div className="section-title">Departments</div>
        {loading ? (
          <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
        ) : departments.length === 0 ? (
          <div className="empty-state">No departments yet.</div>
        ) : (
          departments.map((d) => (
            <div key={d.id} className="flex-between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              {editingId === d.id ? (
                <div className="flex gap-8" style={{ flex: 1 }}>
                  <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <button className="btn btn-primary btn-sm" onClick={() => saveRename(d)}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex gap-12" style={{ alignItems: "center" }}>
                    <strong>{d.name}</strong>
                    <span className={"badge " + (d.active ? "badge-active" : "badge-cancelled")}>
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex gap-8">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(d.id); setEditName(d.name); }}>Rename</button>
                    <button className={"btn btn-sm " + (d.active ? "btn-outline" : "btn-success")} onClick={() => toggle(d)}>
                      {d.active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(d)}>Remove</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
