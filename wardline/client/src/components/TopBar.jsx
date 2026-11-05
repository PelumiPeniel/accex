import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

function formatClock(totalSeconds) {
  if (totalSeconds == null) return "--:--";
  const s = Math.max(0, totalSeconds);
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function initials(name = "") {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const ROLE_LABEL = {
  SystemAdministrator: "System Administrator",
  Administrator: "Administrator",
  AccessOfficer: "Access Officer"
};

export default function TopBar({ title }) {
  const { user, secondsLeft, isWarning, justRenewed, toggleSessionTimerVisible, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="topbar">
      <h2>{title}</h2>
      <div className="flex gap-16" style={{ alignItems: "center" }}>
        {user?.sessionTimerVisible && (
          <div className={`session-pill${isWarning ? " warn" : ""}${justRenewed ? " pulse" : ""}`}>
            ● Session expires in {formatClock(secondsLeft)}
          </div>
        )}
        <div className="user-chip" onClick={() => setMenuOpen((o) => !o)}>
          <div className="avatar">{initials(user?.fullName)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.fullName}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
              {ROLE_LABEL[user?.role] || user?.role}
              {user?.staffNumber ? ` · ${user.staffNumber}` : ""}
            </div>
          </div>

          {menuOpen && (
            <div className="account-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="item">
                <span>Dark mode</span>
                <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                  <span className="track" />
                </label>
              </div>
              <div className="item">
                <span>Show session timer</span>
                <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={!!user?.sessionTimerVisible}
                    onChange={toggleSessionTimerVisible}
                  />
                  <span className="track" />
                </label>
              </div>
              <div
                className="item"
                style={{ cursor: "pointer", color: "var(--red-500)", fontWeight: 600 }}
                onClick={logout}
              >
                Log out
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
