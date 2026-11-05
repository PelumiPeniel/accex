import { useState } from "react";

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) }
];

// A single, shared password + confirm-password pair — used everywhere a
// new password is being set (account creation, password reset), so both
// the "must match" rule and the complexity requirements live in exactly
// one place, not copy-pasted slightly differently into six different
// forms. This client-side check is for immediate feedback only — the
// server enforces the real, authoritative version of this same rule
// (including the organization's configured minimum length) independently,
// since client-side validation alone can always be bypassed.
export default function PasswordFields({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  passwordLabel = "Password",
  confirmLabel = "Confirm password"
}) {
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const showMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  return (
    <>
      <div className="field">
        <label>{passwordLabel}</label>
        <div className="password-input-wrap">
          <span className="input-icon">🔒</span>
          <input
            type={show ? "text" : "password"}
            className="input input-with-icon"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onFocus={() => setTouched(true)}
          />
          <button type="button" className="password-toggle" onClick={() => setShow((s) => !s)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {(touched || password.length > 0) && (
          <ul className="password-requirements">
            {REQUIREMENTS.map((req) => {
              const met = req.test(password);
              return (
                <li key={req.label} className={met ? "met" : ""}>
                  <span className="req-icon">{met ? "✓" : "○"}</span>{req.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="field">
        <label>{confirmLabel}</label>
        <div className="password-input-wrap">
          <span className="input-icon">🔒</span>
          <input
            type={show ? "text" : "password"}
            className={"input input-with-icon" + (showMismatch ? " input-error" : "")}
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
          />
        </div>
        {showMismatch && <span className="error-text">Passwords don't match.</span>}
      </div>
    </>
  );
}

export function passwordComplexityOk(password) {
  return REQUIREMENTS.every((req) => req.test(password || ""));
}

// Shared validity check — used to gate every submit button that includes
// this component, so "is this password actually good enough" is asked
// the same way everywhere too.
export function passwordsValid(password, confirmPassword) {
  return passwordComplexityOk(password) && password === confirmPassword;
}
