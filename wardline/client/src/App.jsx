import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";

import LandingPage from "./pages/LandingPage";
import Overview from "./pages/Overview";
import RecordsSearch from "./pages/RecordsSearch";
import StaffAccounts from "./pages/StaffAccounts";
import AccessPoints from "./pages/AccessPoints";
import Administrators from "./pages/Administrators";
import Departments from "./pages/Departments";
import GlobalSettings from "./pages/GlobalSettings";
import Reports from "./pages/Reports";
import AuditLog from "./pages/AuditLog";

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Overview />} />
            <Route path="records" element={<RecordsSearch />} />
            <Route path="staff" element={<StaffAccounts />} />
            <Route path="reports" element={<Reports />} />
            <Route
              path="audit"
              element={
                <ProtectedRoute roles={["SystemAdministrator"]}>
                  <AuditLog />
                </ProtectedRoute>
              }
            />

            <Route
              path="access-points"
              element={
                <ProtectedRoute roles={["SystemAdministrator"]}>
                  <AccessPoints />
                </ProtectedRoute>
              }
            />
            <Route
              path="administrators"
              element={
                <ProtectedRoute roles={["SystemAdministrator"]}>
                  <Administrators />
                </ProtectedRoute>
              }
            />
            <Route
              path="departments"
              element={
                <ProtectedRoute roles={["SystemAdministrator"]}>
                  <Departments />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute roles={["SystemAdministrator"]}>
                  <GlobalSettings />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<LandingPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
