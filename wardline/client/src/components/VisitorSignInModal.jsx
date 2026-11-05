import { useEffect, useState } from "react";
import Modal from "./Modal";
import NameFields from "./NameFields";
import SignaturePad from "./SignaturePad";
import TermsModal from "./TermsModal";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useVisitorSignInModal } from "../context/VisitorSignInModalContext";
import { useActingAccessPoint } from "../context/ActingAccessPointContext";
import { tryStaffLookup } from "../utils/staffLookup";

const EMPTY_FORM = { firstName: "", lastName: "", purpose: "", durationCategoryId: "", staffNumber: "", department: "", company: "", phone: "" };

// A sentinel value for the dropdown — deliberately something no real
// department could ever be named, so it can't collide with a real entry.
const OTHER_DEPARTMENT = "__OTHER__";

export default function VisitorSignInModal() {
  const { open, closeModal, triggerRefresh } = useVisitorSignInModal();
  const { user } = useAuth();
  const isSysAdmin = user.role === "SystemAdministrator";
  // System Administrator has no Access Point of their own — this modal
  // uses whichever one is currently selected in the Overview switcher.
  // Administrator and Access Officer never touch this; their own account
  // already carries a fixed Access Point.
  const { accessPoint: actingAccessPoint } = useActingAccessPoint();

  const [visitorType, setVisitorType] = useState("Staff");
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [accessPointName, setAccessPointName] = useState("");
  const [accessPointDepartment, setAccessPointDepartment] = useState("");
  const [entryRules, setEntryRules] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  // When "Other" is picked in the department dropdown, the typed-in value
  // lives here. It's recorded on the visit record like any other
  // department, but deliberately never added to the master department
  // list — one-off visitor departments shouldn't permanently grow the
  // organization's own department structure.
  const [otherDepartment, setOtherDepartment] = useState("");
  const [signature, setSignature] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);

  const canEditCategories = user.role === "Administrator" || isSysAdmin;

  function loadCategories() {
    api.get("/settings/duration-categories").then((d) => {
      setCategories(d.durationCategories);
      setForm((f) => (f.durationCategoryId ? f : { ...f, durationCategoryId: d.durationCategories[0]?.id || "" }));
    });
  }

  useEffect(() => {
    if (!open) return;
    loadCategories();
    api.get("/departments").then((d) => setDepartments(d.departments));

    if (isSysAdmin) {
      // GET /access-points returns every Access Point for System
      // Administrator, not just one — so instead of guessing which one
      // they mean, this uses the exact one they picked in the switcher.
      if (actingAccessPoint) {
        setAccessPointName(actingAccessPoint.name);
        setEntryRules(actingAccessPoint.entryRules);
        setAccessPointDepartment(actingAccessPoint.department || "");
      }
    } else {
      api.get("/access-points").then((d) => {
        const ap = d.accessPoints[0];
        if (ap) {
          setAccessPointName(ap.name);
          setEntryRules(ap.entryRules);
          setAccessPointDepartment(ap.department || "");
        }
      });
    }
  }, [open, isSysAdmin, actingAccessPoint]);

  // Staff visitors can't be from this Access Point's own department — kept
  // out of the picklist entirely, and the selected value is corrected if
  // it ever lands on the excluded one (e.g. right after it loads).
  const availableDepartments = departments.filter(
    (d) => d.name.toLowerCase() !== accessPointDepartment.toLowerCase()
  );

  useEffect(() => {
    if (!open || availableDepartments.length === 0) return;
    if (form.department === OTHER_DEPARTMENT) return; // "Other" is always a valid choice
    const stillValid = availableDepartments.some((d) => d.name === form.department);
    if (!stillValid) {
      setForm((f) => ({ ...f, department: availableDepartments[0].name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accessPointDepartment, departments]);

  // What actually gets sent to the server: either the picked department,
  // or whatever was typed when "Other" was selected.
  const isOtherSelected = form.department === OTHER_DEPARTMENT;
  const effectiveDepartment = isOtherSelected ? otherDepartment.trim() : form.department;

  if (!open) return null;

  if (isSysAdmin && !actingAccessPoint) {
    return (
      <Modal title="New Visitor Sign-In" onClose={closeModal}>
        <div className="banner banner-error">
          Select an Access Point from the switcher at the top of Overview before signing a visitor in.
        </div>
      </Modal>
    );
  }

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  // Staff-number autofill: only meaningful for Staff-type visitors, who
  // are Nahco employees and therefore the only ones who could be in the
  // organization's Active Directory. Fields stay editable either way —
  // this only ever fills them in as a starting point.
  async function onStaffNumberBlur(value) {
    const match = await tryStaffLookup(value);
    if (match) {
      setForm((f) => ({ ...f, firstName: match.firstName || f.firstName, lastName: match.lastName || f.lastName }));
    }
  }

  function resetAll() {
    setForm(EMPTY_FORM);
    setOtherDepartment("");
    setSignature(null);
    setAgreed(false);
    setResult(null);
    setError("");
    setVisitorType("Staff");
  }

  function handleClose() {
    resetAll();
    closeModal();
  }

  function onCheckboxClick(e) {
    if (!agreed) {
      e.preventDefault();
      setShowTerms(true);
    } else {
      setAgreed(false);
    }
  }

  const requiredOk =
    form.firstName && form.lastName && form.purpose && form.durationCategoryId && signature && agreed &&
    (visitorType === "Staff"
      ? form.staffNumber && effectiveDepartment && availableDepartments.length > 0
      : form.company && form.phone);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!requiredOk) {
      setError("Please complete all required fields, capture a signature, and accept the entry rules.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        visitorType,
        firstName: form.firstName,
        lastName: form.lastName,
        purpose: form.purpose,
        durationCategoryId: form.durationCategoryId,
        signature,
        agreedToTerms: agreed,
        // Administrator and Access Officer need no accessPointId — the
        // server already knows theirs. System Administrator has none of
        // their own, so this sends whichever Access Point is currently
        // selected in the switcher.
        ...(isSysAdmin && actingAccessPoint ? { accessPointId: actingAccessPoint.id } : {}),
        ...(visitorType === "Staff"
          ? { staffNumber: form.staffNumber, department: effectiveDepartment }
          : { company: form.company, phone: form.phone })
      };
      const data = await api.post("/visitors/sign-in", payload);
      setResult(data.visitor);
      triggerRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Modal title={result ? "Visitor signed in" : `New Visitor Sign-In — ${accessPointName}`} onClose={handleClose} width={560}>
        {result ? (
          <ResultView visitor={result} onSignInAnother={resetAll} onClose={handleClose} />
        ) : (
          <form onSubmit={submit}>
            <div className="flex-between">
              <div className="banner banner-info" style={{ flex: 1, marginRight: canEditCategories ? 8 : 0 }}>
                Supervised by <strong>{user.fullName}</strong> ({user.staffNumber}).
              </div>
              {canEditCategories && (
                <div className="kebab-wrap">
                  <button type="button" className="kebab-btn" onClick={() => setKebabOpen((o) => !o)}>⋮</button>
                  {kebabOpen && (
                    <div className="kebab-menu" onMouseLeave={() => setKebabOpen(false)}>
                      <div
                        className="item"
                        onClick={() => { setKebabOpen(false); setShowCategoryEditor(true); }}
                      >
                        Settings
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {error && <div className="banner banner-error">{error}</div>}

            <div className="type-tabbar">
              <button type="button" className={visitorType === "Staff" ? "active" : ""} onClick={() => setVisitorType("Staff")}>
                <span className="ic">Staff</span>
              </button>
              <button type="button" className={visitorType === "External" ? "active" : ""} onClick={() => setVisitorType("External")}>
                <span className="ic">External Visitor</span>
              </button>
            </div>

            {visitorType === "Staff" ? (
              <>
                <div className="field">
                  <label>Staff number</label>
                  <input
                    className="input"
                    required
                    value={form.staffNumber}
                    onChange={(e) => set("staffNumber", e.target.value)}
                    onBlur={(e) => onStaffNumberBlur(e.target.value)}
                  />
                </div>
                <NameFields
                  firstName={form.firstName}
                  lastName={form.lastName}
                  onFirstNameChange={(v) => set("firstName", v)}
                  onLastNameChange={(v) => set("lastName", v)}
                />
                {availableDepartments.length === 0 && accessPointDepartment ? (
                  <div className="banner banner-error">
                    No other departments exist yet besides {accessPointDepartment} — a System
                    Administrator needs to add one before a Staff visitor can be signed in here.
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label>Department</label>
                      <select className="input" required value={form.department} onChange={(e) => set("department", e.target.value)}>
                        {availableDepartments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                        <option value={OTHER_DEPARTMENT}>Other...</option>
                      </select>
                    </div>
                    {isOtherSelected && (
                      <div className="field">
                        <label>Enter department</label>
                        <input
                          className="input"
                          required
                          autoFocus
                          value={otherDepartment}
                          onChange={(e) => setOtherDepartment(e.target.value)}
                          placeholder="Type the visitor's department"
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <NameFields
                  firstName={form.firstName}
                  lastName={form.lastName}
                  onFirstNameChange={(v) => set("firstName", v)}
                  onLastNameChange={(v) => set("lastName", v)}
                  firstNameLabel="Visitor first name"
                  lastNameLabel="Visitor last name"
                />
                <div className="field">
                  <label>Company</label>
                  <input className="input" required value={form.company} onChange={(e) => set("company", e.target.value)} />
                </div>
                <div className="field">
                  <label>Phone number</label>
                  <input className="input" type="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
              </>
            )}

            <div className="field">
              <label>Purpose of visit</label>
              <input className="input" required value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
            </div>

            <div className="field">
              <label>Expected visit duration</label>
              <select className="input" required value={form.durationCategoryId} onChange={(e) => set("durationCategoryId", e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Visitor signature</label>
              <SignaturePad onChange={setSignature} />
            </div>

            <label className="terms-checkbox-row">
              <input type="checkbox" checked={agreed} onChange={() => {}} onClick={onCheckboxClick} />
              <span>
                I agree to the{" "}
                <a onClick={(e) => { e.preventDefault(); setShowTerms(true); }} href="#rules">entry rules</a>
              </span>
            </label>

            <button className="btn btn-primary btn-block" disabled={loading || !requiredOk}>
              {loading ? <span className="spinner" /> : "Complete sign-in"}
            </button>
          </form>
        )}
      </Modal>

      {showTerms && (
        <TermsModal
          rulesText={entryRules}
          onAccept={() => { setAgreed(true); setShowTerms(false); }}
          onDecline={() => { setAgreed(false); setShowTerms(false); }}
        />
      )}

      {showCategoryEditor && (
        <DurationCategoryEditor
          categories={categories}
          onClose={() => setShowCategoryEditor(false)}
          onSaved={(next) => { setCategories(next); setShowCategoryEditor(false); }}
        />
      )}
    </>
  );
}

function DurationCategoryEditor({ categories, onClose, onSaved }) {
  const [rows, setRows] = useState(categories.map((c) => ({ ...c })));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(i, key, val) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  }
  function remove(i) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function add() {
    setRows((r) => [...r, { label: "New category", minutes: 60 }]);
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const data = await api.put("/settings/duration-categories", { durationCategories: rows });
      onSaved(data.durationCategories);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit expected duration categories"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      {rows.map((c, i) => (
        <div key={i} className="flex gap-8 mb-16" style={{ alignItems: "center" }}>
          <input className="input" value={c.label} onChange={(e) => update(i, "label", e.target.value)} placeholder="Label" />
          <input type="number" className="input" style={{ maxWidth: 110 }} value={c.minutes} onChange={(e) => update(i, "minutes", Number(e.target.value))} placeholder="Minutes" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={add}>+ Add category</button>
    </Modal>
  );
}

function ResultView({ visitor, onSignInAnother, onClose }) {
  return (
    <div>
      <div className="banner banner-success">Visitor signed in successfully.</div>
      <h3 style={{ marginBottom: 16 }}>{visitor.fullName}</h3>
      <div className="flex-between mb-16" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        <span className="muted text-sm">Visitor type</span>
        <strong>{visitor.visitorType}</strong>
      </div>
      <div className="flex-between mb-16" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        <span className="muted text-sm">Time In</span>
        <strong>{new Date(visitor.timeIn).toLocaleString()}</strong>
      </div>
      <div className="flex-between mb-16">
        <span className="muted text-sm">Expected Departure</span>
        <strong>{new Date(visitor.expectedDeparture).toLocaleString()}</strong>
      </div>
      <div className="flex gap-12 mt-24">
        <button className="btn btn-outline btn-block" onClick={onSignInAnother}>Sign in another visitor</button>
        <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
