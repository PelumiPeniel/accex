// Client-side mirror of server/src/utils/permissions.js — permission
// groups (delegation, per-account customization) have been removed
// entirely. Each role has a fixed set of capabilities, computed the same
// way on both sides, so the UI never shows something the server would
// then reject.
export function hasGroup(user, groupKey) {
  if (!user) return false;
  if (user.role === "SystemAdministrator") return true;

  if (groupKey === "OfficerDuties") {
    return user.role === "AccessOfficer" || user.role === "Administrator";
  }
  if (groupKey === "StaffManagement" || groupKey === "ReportingAudit") {
    return user.role === "Administrator";
  }
  return false;
}
