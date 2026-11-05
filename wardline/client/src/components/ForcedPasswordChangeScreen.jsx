import { useState } from "react";
import Logo from "./Logo";
import PasswordFields, { passwordsValid } from "./PasswordFields";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

// Shown instead of the dashboard whenever the logged-in account has
// mustChangePassword set — which only ever happens right after an
// administrator resets someone's password. Nothing else in the app is
// reachable until this is resolved; ProtectedRoute enforces that.
export default function ForcedPasswordChangeScreen() {
  const { user, setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = passwordsValid(password, confirmPassword);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!canSubmit) {
      setError("Passwords must match, and meet every requirement below, before you can continue.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { newPassword: password });
      // No need to re-fetch the whole session — the server confirmed the
      // change succeeded, so just clear the flag locally and the app
      // proceeds straight to the dashboard.
      setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
      <div className="card card-pad" style={{ maxWidth: 460, width: "100%" }}>
        <div className="flex gap-8" style={{ alignItems: "center", marginBottom: 18 }}>
          <Logo size={28} />
          <strong>AcceX</strong>
        </div>
        <h3>Set a new password</h3>
        <p className="text-sm muted" style={{ marginBottom: 18 }}>
          {user?.fullName ? `Hi ${user.fullName}, y` : "Y"}our password was just reset by an administrator.
          Before you can continue, set a password of your own — it can't be the temporary one you just logged
          in with, or your previous password.
        </p>
        {error && <div className="banner banner-error">{error}</div>}
        <form onSubmit={submit}>
          <PasswordFields
            password={password}
            onPasswordChange={setPassword}
            confirmPassword={confirmPassword}
            onConfirmPasswordChange={setConfirmPassword}
          />
          <button className="btn btn-primary btn-block mt-16" disabled={loading || !canSubmit}>
            {loading ? <span className="spinner" /> : "Set password and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
