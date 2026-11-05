import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ForcedPasswordChangeScreen from "./ForcedPasswordChangeScreen";

export default function ProtectedRoute({ children, roles }) {
  const { user, booting } = useAuth();

  if (booting) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="spinner dark" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  // Blocks every single dashboard route — not just some — until a
  // required password change is resolved. Checked before the role check
  // on purpose, so it applies uniformly regardless of which role or which
  // page was being requested.
  if (user.mustChangePassword) return <ForcedPasswordChangeScreen />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}
