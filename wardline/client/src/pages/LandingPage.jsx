import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { useAuth } from "../context/AuthContext";

// No device-claiming flow anymore — Access Point context comes entirely
// from whichever account logs in, so this page has nothing left to check
// or wait on before showing the login form.
export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  return (
    <div className="auth-page">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />

      <div className="auth-shell">
        <div className="auth-intro anim-fade-up">
          <Logo size={38} />
          <div className="eyebrow" style={{ marginTop: 26 }}>Access Management</div>
          <h1>Every visit here, recorded, supervised, and accounted for.</h1>
        </div>

        <div className="glass-card anim-fade-up">
          <div className="brand-row">
            <Logo size={28} />
            <span>AcceX</span>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/app");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h3>Welcome back</h3>
      <p className="sub-text">Sign in to your account to continue.</p>
      {error && <div className="banner-glass">{error}</div>}
      <div className="glass-field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          className="glass-input"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="glass-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="glass-input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button className="btn-glass" disabled={loading}>
        {loading ? <span className="spinner" /> : "Log in"}
      </button>
    </form>
  );
}
