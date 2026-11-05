import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useActingAccessPoint } from "../context/ActingAccessPointContext";
import { hasGroup } from "../utils/permissions";

export default function RecordsSearch() {
  const { user } = useAuth();
  const isSysAdmin = user.role === "SystemAdministrator";
  const { accessPointId } = useActingAccessPoint();
  const fullHistory = hasGroup(user, "ReportingAudit");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [visitorType, setVisitorType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  // Administrator and Access Officer need no accessPointId — the server
  // already scopes the search to their own Access Point. System
  // Administrator has none of their own, so this uses whichever Access
  // Point is currently selected in the Overview switcher.
  async function search() {
    if (isSysAdmin && !accessPointId) { setLoading(false); setRows([]); return; }
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (visitorType) params.set("visitorType", visitorType);
    if (fullHistory && from) params.set("from", from);
    if (fullHistory && to) params.set("to", to);
    if (isSysAdmin && accessPointId) params.set("accessPointId", accessPointId);
    const data = await api.get("/visitors?" + params.toString());
    setRows(data.visitors);
    setLoading(false);
  }

  useEffect(() => { search(); }, [accessPointId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="card card-pad mb-24 anim-fade-up">
        <div className="section-title">{fullHistory ? "Search all records" : "Today's records"}</div>
        <div className="form-row" style={{ gridTemplateColumns: fullHistory ? "1.5fr 1fr 1fr 1fr 1fr auto" : "1.5fr 1fr 1fr auto" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input className="input" placeholder="Name, company, purpose, staff no" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option>
              <option>Active</option><option>Overdue</option><option>Completed</option><option>Cancelled</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Visitor type</label>
            <select className="input" value={visitorType} onChange={(e) => setVisitorType(e.target.value)}>
              <option value="">Any</option><option>Staff</option><option>External</option>
            </select>
          </div>
          {fullHistory && (
            <>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>From</label>
                <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-primary" onClick={search}>Search</button>
          </div>
        </div>
      </div>

      <div className="card anim-fade-up">
        <div className="card-pad">
          {loading ? (
            <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              {isSysAdmin && !accessPointId ? "Select an Access Point from Overview to search its records." : "No records match your search."}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Visitor</th><th>Type</th><th>Company / Dept.</th><th>Date</th>
                    <th>Time In</th><th>Time Out</th><th>Sign-out Mode</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} className={v.status === "Overdue" ? "row-overdue" : ""}>
                      <td>{v.fullName}</td>
                      <td><span className={"badge " + (v.visitorType === "Staff" ? "badge-officer" : "badge-completed")}>{v.visitorType}</span></td>
                      <td>{v.orgLabel}</td>
                      <td>{new Date(v.timeIn).toLocaleDateString()}</td>
                      <td>{new Date(v.timeIn).toLocaleTimeString()}</td>
                      <td>{v.timeOut ? new Date(v.timeOut).toLocaleTimeString() : "-"}</td>
                      <td>{v.signOutModeLabel || "-"}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => setDetail(v)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detail && <RecordDetailModal visitor={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted text-sm">{label}</span>
      <strong style={{ textAlign: "right" }}>{value ?? "-"}</strong>
    </div>
  );
}

function RecordDetailModal({ visitor, onClose }) {
  return (
    <Modal title={visitor.fullName} onClose={onClose} width={560}>
      <Row label="Visitor type" value={visitor.visitorType} />
      {visitor.visitorType === "Staff" ? (
        <>
          <Row label="Staff number" value={visitor.staffNumber} />
          <Row label="Department" value={visitor.department} />
        </>
      ) : (
        <>
          <Row label="Company" value={visitor.company} />
          <Row label="Phone number" value={visitor.phone} />
        </>
      )}
      <Row label="Purpose" value={visitor.purpose} />
      <Row label="Status" value={<StatusBadge status={visitor.status} />} />
      <Row label="Time In" value={new Date(visitor.timeIn).toLocaleString()} />
      <Row label="Expected Duration" value={visitor.expectedDurationLabel} />
      <Row label="Expected Departure" value={new Date(visitor.expectedDeparture).toLocaleString()} />
      <Row label="Time Out" value={visitor.timeOut ? new Date(visitor.timeOut).toLocaleString() : null} />
      <Row label="Total Duration" value={visitor.currentDurationLabel} />
      <Row label="Supervising Officer" value={visitor.supervisingOfficer + " - " + visitor.supervisingStaffNumber} />
      <Row label="Sign-out mode" value={visitor.signOutModeLabel} />
      {visitor.signOutNotes && <Row label="Sign-out notes" value={visitor.signOutNotes} />}

      {visitor.extensions && visitor.extensions.length > 0 && (
        <div className="mt-16">
          <div className="section-title" style={{ fontSize: 13 }}>Extension History</div>
          {visitor.extensions.map((ext) => (
            <div key={ext.id} className="banner banner-info" style={{ marginBottom: 8 }}>
              +{ext.extensionMinutes} min by {ext.grantedBy} on {new Date(ext.at).toLocaleString()}
              {ext.reason ? " - " + ext.reason : ""}
            </div>
          ))}
        </div>
      )}

      {(visitor.signInSignature || visitor.signOutSignature) && (
        <div className="mt-16 flex gap-16">
          {visitor.signInSignature && (
            <div style={{ flex: 1 }}>
              <div className="text-sm muted mb-8">Sign-in signature</div>
              <img src={visitor.signInSignature} alt="Sign-in signature" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8 }} />
            </div>
          )}
          {visitor.signOutSignature && (
            <div style={{ flex: 1 }}>
              <div className="text-sm muted mb-8">Sign-out signature</div>
              <img src={visitor.signOutSignature} alt="Sign-out signature" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8 }} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
