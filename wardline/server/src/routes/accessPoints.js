const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { newId } = require("../utils/ids");
const { logAction } = require("../utils/audit");
const { asyncHandler } = require("../utils/asyncHandler");
const { ensureDepartment } = require("../utils/departments");

const router = express.Router();

router.get("/public-list", asyncHandler(async (req, res) => {
  const points = await db.listAccessPoints({ activeOnly: true });
  res.json({ accessPoints: points.map((a) => ({ id: a.id, name: a.name })) });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role === "SystemAdministrator") {
    return res.json({ accessPoints: await db.listAccessPoints() });
  }
  const ap = req.user.accessPointId ? await db.getAccessPointById(req.user.accessPointId) : null;
  res.json({ accessPoints: ap ? [ap] : [] });
}));

router.use(requireAuth, requireRole("SystemAdministrator"));

// Everyone assigned to this Access Point — both Administrators and Access
// Officers — in one call. This is what the Access Points page uses to
// show "who works here" once you select a specific location, instead of
// System Administrator having no visibility into Access Officers at all.
router.get("/:id/staff", asyncHandler(async (req, res) => {
  const ap = await db.getAccessPointById(req.params.id);
  if (!ap) return res.status(404).json({ error: "Access Point not found." });

  const [administrators, officers] = await Promise.all([
    db.listUsersByRoleAndAccessPoint("Administrator", ap.id),
    db.listUsersByRoleAndAccessPoint("AccessOfficer", ap.id)
  ]);

  function sanitize(user) {
    const { passwordHash, failedAttempts, lockedUntil, ...safe } = user;
    return safe;
  }

  res.json({
    accessPoint: ap,
    administrators: administrators.map(sanitize),
    officers: officers.map(sanitize)
  });
}));

router.post("/", asyncHandler(async (req, res) => {
  const { name, department, entryRules } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Access Point name is required." });
  if (!department || !department.trim()) return res.status(400).json({ error: "Select or type a department." });

  const dept = await ensureDepartment(department);
  const accessPoint = await db.createAccessPoint({
    id: newId("ap"),
    name: name.trim(),
    department: dept.name,
    entryRules: entryRules && entryRules.trim() ? entryRules : db.DEFAULT_ENTRY_RULES,
    active: true
  });

  await logAction({
    actor: req.user,
    action: "Access Point created",
    details: `${accessPoint.name} (${accessPoint.department})`,
    relatedRecordId: accessPoint.id,
    accessPointId: accessPoint.id
  });
  res.status(201).json({ accessPoint });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const ap = await db.getAccessPointById(req.params.id);
  if (!ap) return res.status(404).json({ error: "Access Point not found." });

  const { name, department, entryRules } = req.body || {};
  const changes = [];
  const fields = {};

  if (name && name.trim() && name.trim() !== ap.name) {
    changes.push(`Name ${ap.name} → ${name.trim()}`);
    fields.name = name.trim();
  }
  if (department && department.trim()) {
    const dept = await ensureDepartment(department);
    if (dept.name !== ap.department) {
      changes.push(`Department ${ap.department} → ${dept.name}`);
      fields.department = dept.name;
    }
  }
  if (typeof entryRules === "string" && entryRules !== ap.entryRules) {
    changes.push("Entry rules updated");
    fields.entryRules = entryRules;
  }

  const updated = Object.keys(fields).length ? await db.updateAccessPoint(ap.id, fields) : ap;
  if (changes.length) {
    await logAction({
      actor: req.user,
      action: "Access Point updated",
      details: changes.join("; "),
      relatedRecordId: ap.id,
      accessPointId: ap.id
    });
  }
  res.json({ accessPoint: updated });
}));

router.patch("/:id/status", asyncHandler(async (req, res) => {
  const ap = await db.getAccessPointById(req.params.id);
  if (!ap) return res.status(404).json({ error: "Access Point not found." });
  const active = Boolean(req.body?.active);
  const updated = await db.updateAccessPoint(ap.id, { active });
  await logAction({
    actor: req.user,
    action: active ? "Access Point reactivated" : "Access Point deactivated",
    details: ap.name,
    relatedRecordId: ap.id,
    accessPointId: ap.id
  });
  res.json({ accessPoint: updated });
}));

module.exports = router;
