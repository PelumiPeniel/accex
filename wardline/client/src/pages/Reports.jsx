import { useState } from "react";
import { api } from "../api";
import logoUrl from "../assets/logo.png";

const COLUMNS = ["Visitor", "Type", "Staff No. / Phone", "Department / Company", "Purpose", "Date", "Time In", "Time Out", "Duration", "Sign-out Mode", "Supervising Officer", "Status"];

function rowValues(v) {
  return [
    v.fullName, v.visitorType,
    v.visitorType === "Staff" ? v.staffNumber : v.phone,
    v.visitorType === "Staff" ? `${v.company}/${v.department}` : v.company,
    v.purpose || "",
    new Date(v.timeIn).toLocaleDateString(),
    new Date(v.timeIn).toLocaleTimeString(),
    v.timeOut ? new Date(v.timeOut).toLocaleTimeString() : "",
    v.currentDurationLabel || "",
    v.signOutModeLabel || "",
    v.supervisingOfficer, v.status
  ];
}

function toCsv(rows) {
  // CSV is plain text and cannot hold image data, so signatures are
  // deliberately left out here (this is a real format limitation, not an
  // oversight) — use the Excel or PDF export for reports that need the
  // actual signature images included.
  const lines = rows.map((v) => rowValues(v).map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(","));
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

function toExcelHtml(rows) {
  const cols = [...COLUMNS, "Sign-in Signature", "Sign-out Signature"];
  const sigCellW = 90;
  const sigImgW = 70, sigImgH = 26;
  // The bleed problem was the row height staying at Excel's short text
  // default, not the source image's resolution — fixed below by setting
  // an explicit row height. So the original full-quality signature can be
  // embedded directly; the width/height attributes on <img> control its
  // on-screen size without needing to degrade the actual image data.
  const rowHeight = sigImgH + 14;

  const th = cols
    .map((h, i) => {
      const isSigCol = i === cols.length - 2 || i === cols.length - 1;
      return isSigCol ? `<th width="${sigCellW}">${h}</th>` : `<th>${h}</th>`;
    })
    .join("");
  const trs = rows.map((v) => {
    const cells = rowValues(v).map((c) => "<td>" + (c == null ? "" : c) + "</td>").join("");
    const cell = (sig) =>
      `<td width="${sigCellW}" style="width:${sigCellW}px">` +
      (sig ? `<img src="${sig}" width="${sigImgW}" height="${sigImgH}" />` : "") +
      "</td>";
    return `<tr height="${rowHeight}" style="height:${rowHeight}px">` + cells + cell(v.signInSignature) + cell(v.signOutSignature) + "</tr>";
  }).join("");
  return (
    '<html><head><meta charset="UTF-8"></head><body>' +
    '<table border="1" style="table-layout:fixed; border-collapse:collapse;">' +
    "<thead><tr>" + th + "</tr></thead><tbody>" + trs + "</tbody></table></body></html>"
  );
}

function imageToDataUrl(url) {
  return fetch(url)
    .then((res) => res.blob())
    .then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

async function toPdf(rows, filters) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.jsPDF;
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape" });

  try {
    const logoData = await imageToDataUrl(logoUrl);
    doc.addImage(logoData, "PNG", 10, 8, 20, 11);
  } catch (e) {
    // logo optional
  }

  doc.setFontSize(13);
  doc.setTextColor(15, 30, 61);
  doc.text("Visitor Report", 36, 15);
  doc.setFontSize(8.5);
  doc.setTextColor(100);
  doc.text("Generated " + new Date().toLocaleString() + (filters ? " - Filters: " + filters : ""), 36, 20);

  // Signatures render inline, inside the same row's cell as the rest of
  // that visitor's data — not a separate section — resized to fit the
  // cell rather than kept at their original captured size.
  const cols = [...COLUMNS, "Sign-in Sig.", "Sign-out Sig."];
  const signInColIndex = COLUMNS.length;
  const signOutColIndex = COLUMNS.length + 1;
  const body = rows.map((v) => [...rowValues(v), "", ""]);

  autoTable(doc, {
    startY: 26,
    head: [cols],
    body,
    headStyles: { fillColor: [15, 30, 61], fontSize: 7 },
    styles: { fontSize: 6.8, cellPadding: 1.5, valign: "middle" },
    margin: { left: 8, right: 8 },
    columnStyles: {
      [signInColIndex]: { cellWidth: 26, minCellHeight: 12 },
      [signOutColIndex]: { cellWidth: 26, minCellHeight: 12 }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index !== signInColIndex && data.column.index !== signOutColIndex) return;
      const visitor = rows[data.row.index];
      if (!visitor) return;
      const sig = data.column.index === signInColIndex ? visitor.signInSignature : visitor.signOutSignature;
      if (!sig) return;
      const pad = 1;
      const w = data.cell.width - pad * 2;
      const h = data.cell.height - pad * 2;
      try {
        doc.addImage(sig, "PNG", data.cell.x + pad, data.cell.y + pad, w, h);
      } catch (e) {
        // skip malformed image data rather than break the whole export
      }
    }
  });

  doc.save("accex-report-" + Date.now() + ".pdf");
}

export default function Reports() {
  const [status, setStatus] = useState("");
  const [visitorType, setVisitorType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");

  function filterSummary() {
    const bits = [];
    if (status) bits.push("status=" + status);
    if (visitorType) bits.push("type=" + visitorType);
    if (from) bits.push("from=" + from);
    if (to) bits.push("to=" + to);
    if (q) bits.push('q="' + q + '"');
    return bits.join(", ");
  }

  async function generate() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (visitorType) params.set("visitorType", visitorType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    const data = await api.get("/visitors?" + params.toString());
    setRows(data.visitors);
    setLoading(false);
  }

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(""), 3000); }

  return (
    <div>
      {banner && <div className="banner banner-success anim-fade">{banner}</div>}

      <div className="card card-pad mb-24 anim-fade-up">
        <div className="section-title">Report filters</div>
        <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Visitor type</label>
            <select className="input" value={visitorType} onChange={(e) => setVisitorType(e.target.value)}>
              <option value="">Both</option><option value="Staff">Staff only</option><option value="External">External only</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option><option>Active</option><option>Overdue</option><option>Completed</option><option>Cancelled</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="field mt-16" style={{ marginBottom: 0 }}>
          <label>Keyword</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary mt-16" onClick={generate} disabled={loading}>
          {loading ? <span className="spinner" /> : "Generate report"}
        </button>
      </div>

      {rows && (
        <div className="card anim-fade-up">
          <div className="flex-between card-pad" style={{ paddingBottom: 0 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>{rows.length} record(s)</div>
            <div className="flex gap-8">
              <button className="btn btn-outline btn-sm" onClick={() => { download("accex-report-" + Date.now() + ".csv", toCsv(rows), "text/csv"); flash("CSV exported (signatures can't be embedded in CSV — use Excel or PDF for those)."); }}>Export CSV</button>
              <button className="btn btn-outline btn-sm" onClick={() => { download("accex-report-" + Date.now() + ".xls", toExcelHtml(rows), "application/vnd.ms-excel"); flash("Excel file exported, with signatures in each row."); }}>Export Excel</button>
              <button className="btn btn-navy btn-sm" onClick={async () => { await toPdf(rows, filterSummary()); flash("PDF exported, with signatures inline in each row."); }}>Export PDF</button>
            </div>
          </div>
          <div className="card-pad">
            {rows.length === 0 ? (
              <div className="empty-state">No records match these filters.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Visitor</th><th>Type</th><th>Staff No. / Phone</th><th>Dept. / Company</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Sign-out Mode</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.map((v) => (
                      <tr key={v.id}>
                        <td>{v.fullName}</td>
                        <td><span className={"badge " + (v.visitorType === "Staff" ? "badge-officer" : "badge-completed")}>{v.visitorType}</span></td>
                        <td>{v.visitorType === "Staff" ? v.staffNumber : v.phone}</td>
                        <td>{v.orgLabel}</td>
                        <td>{new Date(v.timeIn).toLocaleDateString()}</td>
                        <td>{new Date(v.timeIn).toLocaleTimeString()}</td>
                        <td>{v.timeOut ? new Date(v.timeOut).toLocaleTimeString() : "-"}</td>
                        <td>{v.signOutModeLabel || "-"}</td>
                        <td>{v.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
