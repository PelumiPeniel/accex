import { useCallback, useEffect, useState } from "react";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useVisitorSignInModal } from "../context/VisitorSignInModalContext";
import { useActingAccessPoint } from "../context/ActingAccessPointContext";

export default function Overview() {
  const { user } = useAuth();
  const isSysAdmin = user.role === "SystemAdministrator";
  const { accessPoint, accessPointId, setAccessPointId, allPoints, loading: apLoading } = useActingAccessPoint();
  const { openModal, refreshToken } = useVisitorSignInModal();
  const [summary, setSummary] = useState(null);
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extendTarget, setExtendTarget] = useState(null);
  const [signOutTarget, setSignOutTarget] = useState(null);
  const [banner, setBanner] = useState("");

  // Administrator and Access Officer need no accessPointId here at all —
  // the server already knows their Access Point from their own account.
  // System Administrator has none of their own, so for them specifically
  // this passes whichever Access Point is currently selected in the
  // switcher above the table.
  const load = useCallback(async () => {
    if (isSysAdmin && !accessPointId) { setLoading(false); return; }
    const suffix = isSysAdmin ? "?accessPointId=" + accessPointId : "";
    const [s, v] = await Promise.all([
      api.get("/visitors/summary" + suffix),
      api.get("/visitors/active" + suffix)
    ]);
    setSummary(s);
    setVisitors(v.visitors);
    setLoading(false);
  }, [isSysAdmin, accessPointId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (refreshToken > 0) load();
  }, [refreshToken, load]);

  return (
    <div>
      {banner && <div className="banner banner-success anim-fade">{banner}</div>}

      {isSysAdmin && (
        <div className="card card-pad mb-16 anim-fade-up" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="text-sm muted" style={{ whiteSpace: "nowrap" }}>Acting at</span>
          {apLoading ? (
            <span className="text-sm muted">Loading Access Points…</span>
          ) : allPoints.length === 0 ? (
            <span className="text-sm muted">No active Access Points exist yet.</span>
          ) : (
            <select
              className="input"
              style={{ maxWidth: 320 }}
              value={accessPointId}
              onChange={(e) => setAccessPointId(e.target.value)}
            >
              {allPoints.map((ap) => <option key={ap.id} value={ap.id}>{ap.name}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="stat-grid stagger">
        <StatCard label="Active Visitors" value={summary?.activeVisitors ?? "-"} accent="blue" />
        <StatCard label="Overdue Visitors" value={summary?.overdueVisitors ?? "-"} danger={summary?.overdueVisitors > 0} accent="red" />
        <StatCard label="Today's Sign-ins" value={summary?.todaysSignIns ?? "-"} accent="green" />
        <StatCard label="Today's Completed" value={summary?.todaysCompleted ?? "-"} accent="navy" />
      </div>

      <div className="card card-cut hoverable anim-fade-up">
        <div className="flex-between card-pad" style={{ paddingBottom: 0 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Active Visitors</div>
          <button className="btn btn-primary btn-sm" onClick={openModal}>+ New Visitor Sign-In</button>
        </div>
        <div className="card-pad">
          {loading ? (
            <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
          ) : visitors.length === 0 ? (
            <div className="empty-state">
              {isSysAdmin && !accessPointId ? "Select an Access Point above to see who's on-site." : "No one currently on-site."}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Visitor</th><th>Type</th><th>Company / Dept.</th><th>Time In</th>
                    <th>Current Duration</th><th>Expected</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((v) => (
                    <tr key={v.id} className={v.status === "Overdue" ? "row-overdue" : ""}>
                      <td>{v.fullName}</td>
                      <td>
                        <span className={"badge " + (v.visitorType === "Staff" ? "badge-officer" : "badge-completed")}>
                          {v.visitorType}
                        </span>
                      </td>
                      <td>{v.orgLabel}</td>
                      <td>{new Date(v.timeIn).toLocaleTimeString()}</td>
                      <td>{v.currentDurationLabel}</td>
                      <td>{v.expectedDurationLabel}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-outline btn-sm" onClick={() => setExtendTarget(v)}>Extend</button>
                          <button className="btn btn-navy btn-sm" onClick={() => setSignOutTarget(v)}>Sign Out</button>
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

      {extendTarget && (
        <ExtendModal
          visitor={extendTarget}
          onClose={() => setExtendTarget(null)}
          onDone={(msg) => { setExtendTarget(null); setBanner(msg); load(); setTimeout(() => setBanner(""), 4000); }}
        />
      )}
      {signOutTarget && (
        <SignOutModal
          visitor={signOutTarget}
          onClose={() => setSignOutTarget(null)}
          onDone={(msg) => { setSignOutTarget(null); setBanner(msg); load(); setTimeout(() => setBanner(""), 4000); }}
        />
      )}
    </div>
  );
}

function ExtendModal({ visitor, onClose, onDone }) {
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      await api.post("/visitors/" + visitor.id + "/extend", { extraMinutes: Number(minutes), reason });
      onDone("Extension granted for " + visitor.fullName + ".");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={"Grant extension - " + visitor.fullName}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner" /> : "Grant extension"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="field">
        <label>Additional minutes</label>
        <select className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
          <option value={120}>2 hours</option>
        </select>
      </div>
      <div className="field">
        <label>Reason (optional)</label>
        <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

function SignOutModal({ visitor, onClose, onDone }) {
  const [signature, setSignature] = useState(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (!signature) {
      setError("The visitor must provide a signature to complete sign-out.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/visitors/" + visitor.id + "/sign-out", { signature, notes });
      onDone(visitor.fullName + " has been signed out.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={"Sign out - " + visitor.fullName}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner" /> : "Confirm sign-out"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="card card-pad mb-16">
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <span className="text-sm muted">Time in</span>
          <strong>{new Date(visitor.timeIn).toLocaleTimeString()}</strong>
        </div>
        <div className="flex-between">
          <span className="text-sm muted">Current duration</span>
          <strong>{visitor.currentDurationLabel}</strong>
        </div>
      </div>
      <div className="field">
        <label>Notes (optional)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="field">
        <label>Visitor signature</label>
        <SignaturePad onChange={setSignature} />
      </div>
    </Modal>
  );
}
