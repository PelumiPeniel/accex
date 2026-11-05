// permissions.js
// ---------------------------------------------------------------------------
// Permission groups (delegation, granting/revoking capabilities per
// account) have been removed entirely. Each role now has a fixed set of
// capabilities that can never be extended, reduced, or customized —
// there's no longer any way to give an account more than its role
// already includes, which was the whole point of removing this.
//
// hasGroup(user, key) is kept as the one place this mapping lives, so the
// dozens of requireGroup(...) checks across the routes didn't need to
// change at all — they still ask "does this user have this capability,"
// the answer just comes from the role alone now, not from stored data.
// ---------------------------------------------------------------------------

function hasGroup(user, groupKey) {
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

module.exports = { hasGroup };
