import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";
import { useVisitorSignInModal } from "../context/VisitorSignInModalContext";
import { hasGroup } from "../utils/permissions";

const ICONS = {
  overview: "◆", signin: "➜", records: "▤", users: "◍", accesspoints: "▣",
  settings: "⚙", reports: "▦", audit: "≣", departments: "◍"
};

const ROLE_CHIP = {
  SystemAdministrator: { label: "System Administrator", cls: "role-chip-sysadmin" },
  Administrator: { label: "Administrator", cls: "role-chip-admin" },
  AccessOfficer: { label: "Access Officer", cls: "role-chip-officer" }
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { openModal } = useVisitorSignInModal();
  const [expanded, setExpanded] = useState(false);
  const closeTimer = useRef(null);

  function onEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setExpanded(true);
  }
  function onLeave() {
    closeTimer.current = setTimeout(() => setExpanded(false), 180);
  }

  const link = (to, key, label) => (
    <NavLink to={to} end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      <span className="ic">{ICONS[key]}</span>
      <span className="label">{label}</span>
    </NavLink>
  );

  // System Administrator now sees the Monitoring section too, alongside
  // their own System Administration tabs — they just pick which Access
  // Point they're acting for from a switcher at the top of Overview,
  // since they have no fixed one of their own the way an Administrator
  // or Access Officer does.
  const isSysAdmin = user?.role === "SystemAdministrator";
  const officer = hasGroup(user, "OfficerDuties");
  const staffMgmt = hasGroup(user, "StaffManagement");
  const reportingAudit = hasGroup(user, "ReportingAudit");
  const canMonitor = officer;
  const chip = ROLE_CHIP[user?.role];

  return (
    <aside className={"sidebar" + (expanded ? " expanded" : "")} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="sidebar-brand">
        <Logo size={32} />
        <div className="brand-text">
          <div className="name">AcceX</div>
          <div className="sub">Access Management</div>
        </div>
      </div>

      {chip && <span className={"role-chip " + chip.cls}>{chip.label}</span>}

      {canMonitor && (
        <>
          <div className="sidebar-section">Monitoring</div>
          {link("/app", "overview", "Overview")}
          <div className="nav-link" onClick={openModal} style={{ cursor: "pointer" }}>
            <span className="ic">{ICONS.signin}</span>
            <span className="label">New Visitor Sign-In</span>
          </div>
          {link("/app/records", "records", "Visitor Records")}
        </>
      )}

      {!isSysAdmin && (staffMgmt || reportingAudit) && <div className="sidebar-section">Administration</div>}
      {!isSysAdmin && staffMgmt && link("/app/staff", "users", "Staff Accounts")}
      {!isSysAdmin && reportingAudit && link("/app/reports", "reports", "Reports")}

      {isSysAdmin && (
        <>
          <div className="sidebar-section">System Administration</div>
          {link("/app/access-points", "accesspoints", "Access Points")}
          {link("/app/administrators", "users", "System Administrators")}
          {link("/app/departments", "departments", "Departments")}
          {link("/app/settings", "settings", "Global Settings")}
          <div className="sidebar-section">Oversight</div>
          {link("/app/reports", "reports", "Reports")}
          {link("/app/audit", "audit", "Audit Trail")}
        </>
      )}

      <div className="sidebar-footer">
        <div className="nav-link" onClick={logout} style={{ cursor: "pointer" }}>
          <span className="ic">⏻</span>
          <span className="label">Log out</span>
        </div>
      </div>
    </aside>
  );
}
