const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole, requireGroup } = require("../middleware/auth");
const { newId } = require("../utils/ids");
const { logAction } = require("../utils/audit");
const { asyncHandler } = require("../utils/asyncHandler");
const { passwordComplexityErrors } = require("../utils/passwordPolicy");
const { lookupStaffByNumber } = require("../utils/activeDirectory");

const router = express.Router();
router.use(requireAuth);

// Active Directory autofill. Used by every form that collects a staff
// number — visitor sign-in for Staff-type visitors, and every account
// creation/edit form — to fill in First name / Last name automatically.
// Always returns 200 with { found: false } rather than an error status
// when there's nothing to autofill (feature disabled, AD unreachable, no
// match), since a failed lookup should never block the form it's on.
router.get("/lookup-staff/:staffNumber", asyncHandler(async (req, res) => {
  const settings = await db.getSettings();
  if (!settings.activeDirectoryEnabled) return res.json({ found: false });

  try {
    const match = await lookupStaffByNumber(req.params.staffNumber);
    if (!match) return res.json({ found: false });
    res.json({ found: true, ...match });
  } catch (err) {
    res.json({ found: false });
  }
}));

function sanitize(user) {
  const { passwordHash, failedAttempts, lockedUntil, previousPasswordHash, ...safe } = user;
  return safe;
}

// Shared ownership check for the three actions below (edit, deactivate,
// reset password). Explicit now rather than relying on the accidental
// side effect that used to make this "work": an Administrator's
// accessPointId never equals a System Administrator's (which is always
// null), so the old check happened to block them too — correct outcome,
// but for the wrong, easy-to-break reason. This says the real rule
// directly: only a System Administrator may manage another System
// Administrator account; an Administrator is otherwise limited to staff
// at their own Access Point.
function assertCanManageTarget(req, res, user) {
  if (user.role === "SystemAdministrator" && req.user.role !== "SystemAdministrator") {
    res.status(403).json({ error: "Only a System Administrator can manage a System Administrator account." });
    return false;
  }
  if (req.user.role === "Administrator" && user.accessPointId !== req.user.accessPointId) {
    res.status(403).json({ error: "You can only manage staff at your own Access Point." });
    return false;
  }
  return true;
}

router.get("/", asyncHandler(async (req, res) => {
  let users;
  if (req.user.role === "SystemAdministrator") {
    users = await db.listUsersByRole("Administrator");
  } else if (req.user.role === "Administrator") {
    users = await db.listUsersByRoleAndAccessPoint("AccessOfficer", req.user.accessPointId);
  } else {
    return res.status(403).json({ error: "You do not have permission to view staff accounts." });
  }
  const withDept = await Promise.all(users.map(async (u) => {
    const ap = u.accessPointId ? await db.getAccessPointById(u.accessPointId) : null;
    return { ...sanitize(u), department: ap ? ap.department : null };
  }));
  res.json({ users: withDept });
}));

// System Administrator accounts are managed as their own separate,
// peer-level tier — kept out of the regular "/" list above, which is
// about Administrator/Officer accounts. Registered before "/:id" so
// Express matches this exact path first, not as an :id parameter.
router.get("/system-administrators", requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const users = await db.listUsersByRole("SystemAdministrator");
  res.json({ users: users.map(sanitize) });
}));

router.post("/system-administrators", requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const { firstName, lastName, staffNumber, username, password } = req.body || {};
  const missing = ["firstName", "lastName", "staffNumber", "username", "password"].filter((f) => !req.body?.[f]);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });

  if (await db.staffNumberExists(staffNumber)) return res.status(409).json({ error: "Staff Number is already in use." });
  if (await db.usernameExists(username)) return res.status(409).json({ error: "Username is already taken." });

  const settings = await db.getSettings();
  const passwordIssues = passwordComplexityErrors(password, settings.passwordMinLength);
  if (passwordIssues.length) {
    return res.status(400).json({ error: `Password must include: ${passwordIssues.join(", ")}.` });
  }

  const user = await db.createUser({
    id: newId("usr"),
    firstName,
    lastName,
    staffNumber,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "SystemAdministrator",
    accessPointId: null,
    status: "Active",
    sessionTimerVisible: true
  });

  await logAction({
    actor: req.user,
    action: "User created",
    details: `${user.fullName} (${staffNumber}) as SystemAdministrator`,
    relatedRecordId: user.id
  });
  res.status(201).json({ user: sanitize(user) });
}));

router.post("/", requireGroup("StaffManagement"), asyncHandler(async (req, res) => {
  const { firstName, lastName, staffNumber, username, password, accessPointId, role: requestedRole } = req.body || {};
  const missing = ["firstName", "lastName", "staffNumber", "username", "password"].filter((f) => !req.body?.[f]);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });

  let role, targetAccessPointId;
  if (req.user.role === "SystemAdministrator") {
    // A System Administrator can create either an Administrator or an
    // Access Officer directly — both need an Access Point picked
    // explicitly, since System Administrator has none of their own to
    // default to. Defaults to Administrator if not specified, matching
    // the original behavior before Access Officer creation was added here.
    role = requestedRole === "AccessOfficer" ? "AccessOfficer" : "Administrator";
    targetAccessPointId = accessPointId;
    if (!targetAccessPointId) return res.status(400).json({ error: `Select an Access Point for this ${role}.` });
  } else if (req.user.role === "Administrator") {
    role = "AccessOfficer";
    targetAccessPointId = req.user.accessPointId;
  } else {
    return res.status(403).json({ error: "You do not have permission to create staff accounts." });
  }

  const ap = await db.getAccessPointById(targetAccessPointId);
  if (!ap || !ap.active) return res.status(400).json({ error: "Select a valid, active Access Point." });
  if (await db.staffNumberExists(staffNumber)) return res.status(409).json({ error: "Staff Number is already in use." });
  if (await db.usernameExists(username)) return res.status(409).json({ error: "Username is already taken." });

  const settings = await db.getSettings();
  const passwordIssues = passwordComplexityErrors(password, settings.passwordMinLength);
  if (passwordIssues.length) {
    return res.status(400).json({ error: `Password must include: ${passwordIssues.join(", ")}.` });
  }

  const user = await db.createUser({
    id: newId("usr"),
    firstName,
    lastName,
    staffNumber,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    accessPointId: targetAccessPointId,
    status: "Active",
    sessionTimerVisible: true
  });

  await logAction({
    actor: req.user,
    action: "User created",
    details: `${user.fullName} (${staffNumber}) as ${role} at ${ap.name}`,
    relatedRecordId: user.id,
    accessPointId: targetAccessPointId
  });
  res.status(201).json({ user: { ...sanitize(user), department: ap.department } });
}));

router.put("/:id", requireGroup("StaffManagement"), asyncHandler(async (req, res) => {
  const user = await db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (!assertCanManageTarget(req, res, user)) return;

  const { firstName, lastName, staffNumber } = req.body || {};
  const changes = [];
  const fields = {};

  if (staffNumber && staffNumber !== user.staffNumber) {
    if (await db.staffNumberExists(staffNumber, user.id)) {
      return res.status(409).json({ error: "Staff Number is already in use." });
    }
    changes.push(`Staff Number ${user.staffNumber} → ${staffNumber}`);
    fields.staffNumber = staffNumber;
  }
  if ((firstName && firstName !== user.firstName) || (lastName && lastName !== user.lastName)) {
    changes.push("Name updated");
    if (firstName) fields.firstName = firstName;
    if (lastName) fields.lastName = lastName;
  }

  const updated = Object.keys(fields).length ? await db.updateUserFields(user.id, fields) : user;
  if (changes.length) {
    await logAction({
      actor: req.user,
      action: "User modified",
      details: `${user.fullName}: ${changes.join("; ")}`,
      relatedRecordId: user.id,
      accessPointId: user.accessPointId
    });
  }
  const ap = updated.accessPointId ? await db.getAccessPointById(updated.accessPointId) : null;
  res.json({ user: { ...sanitize(updated), department: ap ? ap.department : null } });
}));

router.patch("/:id/status", requireGroup("StaffManagement"), asyncHandler(async (req, res) => {
  const user = await db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (!assertCanManageTarget(req, res, user)) return;
  if (user.id === req.user.id) return res.status(400).json({ error: "You cannot deactivate your own account." });

  const { status } = req.body || {};
  if (!["Active", "Inactive"].includes(status)) return res.status(400).json({ error: "Invalid status." });

  // Deactivating the last remaining active System Administrator would
  // permanently lock everyone out of the top tier, with no account left
  // that could ever undo it — so this one case is blocked outright,
  // regardless of who's asking.
  if (user.role === "SystemAdministrator" && status === "Inactive") {
    const allSysAdmins = await db.listUsersByRole("SystemAdministrator");
    const otherActiveCount = allSysAdmins.filter((u) => u.id !== user.id && u.status === "Active").length;
    if (otherActiveCount === 0) {
      return res.status(400).json({ error: "Can't deactivate the last active System Administrator account." });
    }
  }

  const updated = await db.updateUserFields(user.id, { status });
  await logAction({
    actor: req.user,
    action: status === "Active" ? "User reactivated" : "User deactivated",
    details: user.fullName,
    relatedRecordId: user.id,
    accessPointId: user.accessPointId
  });
  res.json({ user: sanitize(updated) });
}));

router.post("/:id/reset-password", requireGroup("StaffManagement"), asyncHandler(async (req, res) => {
  const user = await db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (!assertCanManageTarget(req, res, user)) return;
  const { newPassword } = req.body || {};
  const settings = await db.getSettings();
  const passwordIssues = passwordComplexityErrors(newPassword, settings.passwordMinLength);
  if (passwordIssues.length) {
    return res.status(400).json({ error: `Password must include: ${passwordIssues.join(", ")}.` });
  }
  // The account holder is required to set their own password before they
  // can actually use the account — this temporary one is only ever meant
  // to get them as far as logging in. previousPasswordHash keeps whatever
  // they had immediately before this reset, purely so that self-chosen
  // replacement can be checked against it too, not just against this
  // temporary one.
  await db.updateUserFields(user.id, {
    previousPasswordHash: user.passwordHash,
    passwordHash: bcrypt.hashSync(newPassword, 10),
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null
  });
  await logAction({
    actor: req.user,
    action: "Password reset",
    details: user.fullName,
    relatedRecordId: user.id,
    accessPointId: user.accessPointId
  });
  res.json({ ok: true });
}));

router.patch("/:id/access-point", requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const user = await db.getUserById(req.params.id);
  if (!user || !["Administrator", "AccessOfficer"].includes(user.role)) {
    return res.status(404).json({ error: "Account not found." });
  }
  const { accessPointId } = req.body || {};
  const ap = await db.getAccessPointById(accessPointId);
  if (!ap || !ap.active) return res.status(400).json({ error: "Select a valid, active Access Point." });

  const previous = user.accessPointId ? await db.getAccessPointById(user.accessPointId) : null;
  const updated = await db.updateUserFields(user.id, { accessPointId });
  await logAction({
    actor: req.user,
    action: `${user.role === "Administrator" ? "Administrator" : "Access Officer"} reassigned`,
    details: `${user.fullName}: ${previous ? previous.name : "unassigned"} → ${ap.name}`,
    relatedRecordId: user.id,
    accessPointId
  });
  res.json({ user: { ...sanitize(updated), department: ap.department } });
}));

module.exports = router;
