// NameFields.jsx
// ---------------------------------------------------------------------------
// The one place "First name" / "Last name" are defined, used by every form
// in the app that collects a person's name — visitor sign-in, Access
// Officer/Administrator/System Administrator creation and editing. Kept as
// a single shared component so the fields look and behave identically
// everywhere, rather than six slightly-different copies drifting apart
// over time.
// ---------------------------------------------------------------------------
export default function NameFields({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  required = true,
  firstNameLabel = "First name",
  lastNameLabel = "Last name"
}) {
  return (
    <div className="form-row">
      <div className="field">
        <label>{firstNameLabel}</label>
        <input
          className="input"
          required={required}
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
        />
      </div>
      <div className="field">
        <label>{lastNameLabel}</label>
        <input
          className="input"
          required={required}
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
        />
      </div>
    </div>
  );
}
