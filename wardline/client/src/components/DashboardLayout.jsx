import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import SessionTimeoutWarning from "./SessionTimeoutWarning";
import VisitorSignInModal from "./VisitorSignInModal";
import { VisitorSignInModalProvider } from "../context/VisitorSignInModalContext";
import { ActingAccessPointProvider } from "../context/ActingAccessPointContext";

const TITLES = {
  "/app": "Overview",
  "/app/records": "Visitor Records",
  "/app/staff": "Staff Accounts",
  "/app/reports": "Reports",
  "/app/audit": "Audit Trail",
  "/app/access-points": "Access Points",
  "/app/administrators": "System Administrators",
  "/app/departments": "Departments",
  "/app/settings": "Global Settings"
};

export default function DashboardLayout() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] || "AcceX";

  return (
    <ActingAccessPointProvider>
      <VisitorSignInModalProvider>
        <div className="app-shell">
          <div className="sidebar-spacer" />
          <Sidebar />
          <div className="main-col">
            <TopBar title={title} />
            <div className="content">
              <Outlet />
            </div>
          </div>
          <SessionTimeoutWarning />
          <VisitorSignInModal />
        </div>
      </VisitorSignInModalProvider>
    </ActingAccessPointProvider>
  );
}
