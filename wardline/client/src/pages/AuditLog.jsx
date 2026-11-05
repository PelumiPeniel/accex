import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const COLUMNS = ["Timestamp", "User", "Staff No.", "Role", "Access Point", "Action", "Details"];

function rowValues(r) {
  return [
    new Date(r.timestamp).toLocaleString(),
    r.user || "",
    r.staffNumber || "",
    r.role || "",
    r.accessPointId || "",
    r.action || "",
    r.details || ""
  ];
}

function toCsv(rows) {
  const lines = rows.map((r) => rowValues(r).map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","));
  return [COLUMNS.join(","), ...lines].join("\n");
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function toPdf(rows) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF;
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.setTextColor(15, 30, 61);
  doc.text("Audit Trail", 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Generated " + new Date().toLocaleString(), 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [COLUMNS],
    body: rows.map(rowValues),
    headStyles: { fillColor: [15, 30, 61] },
    styles: { fontSize: 7.5 }
  });

  doc.save("accex-audit-" + Date.now() + ".pdf");
}

export default function AuditLog() {
  const { user } = useAuth();
  // Exporting the audit trail — a permanent record of every account,
  // sign-in, and configuration change across the organization — is kept
  // to System Administrator only. Viewing it is unchanged for anyone who
  // holds the Reporting & Audit group; this restricts taking a copy of it
  // off the system, not looking at it.
  const canExport = user.role === "SystemAdministrator";

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState("");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const data = await api.get("/audit?" + params.toString());
    setRows(data.auditLog);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(""), 3000); }

  return (
    <div>
      {banner && <div className="banner banner-success">{banner}</div>}

      <div className="card card-pad mb-24">
        <div className="flex-between gap-8" style={{ flexWrap: "wrap" }}>
          <div className="flex gap-8" style={{ flex: 1, minWidth: 260 }}>
            <input className="input" placeholder="Search by user, action, or detail" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
            <button className="btn btn-primary" onClick={load}>Search</button>
          </div>
          {canExport && (
            <div className="flex gap-8">
              <button className="btn btn-outline btn-sm" onClick={() => { download("accex-audit-" + Date.now() + ".csv", toCsv(rows), "text/csv"); flash("CSV exported."); }}>Export CSV</button>
              <button className="btn btn-navy btn-sm" onClick={async () => { await toPdf(rows); flash("PDF exported."); }}>Export PDF</button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          {loading ? (
            <div className="empty-state"><div className="spinner dark" style={{ margin: "0 auto" }} /></div>
          ) : rows.length === 0 ? (
            <div className="empty-state">No audit entries match.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(r.timestamp).toLocaleString()}</td>
                      <td>{r.user}{r.staffNumber ? " (" + r.staffNumber + ")" : ""}</td>
                      <td>{r.role || "-"}</td>
                      <td><strong>{r.action}</strong></td>
                      <td className="muted">{r.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
