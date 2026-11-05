const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { newId } = require("../utils/ids");
const { logAction } = require("../utils/audit");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

router.get("/public-list", asyncHandler(async (req, res) => {
  const departments = await db.listDepartments({ activeOnly: true });
  res.json({ departments: departments.map((d) => ({ id: d.id, name: d.name })) });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  res.json({ departments: await db.listDepartments({ activeOnly: true }) });
}));

router.get("/all", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  res.json({ departments: await db.listDepartments() });
}));

router.post("/", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Department name is required." });
  if (await db.getDepartmentByName(name)) {
    return res.status(409).json({ error: "A department with that name already exists." });
  }
  const dept = await db.createDepartment({ id: newId("dep"), name, active: true });
  await logAction({ actor: req.user, action: "Department created", details: dept.name, relatedRecordId: dept.id });
  res.status(201).json({ department: dept });
}));

router.put("/:id", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const dept = await db.getDepartmentById(req.params.id);
  if (!dept) return res.status(404).json({ error: "Department not found." });
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Department name is required." });
  const clash = await db.getDepartmentByName(name);
  if (clash && clash.id !== dept.id) {
    return res.status(409).json({ error: "A department with that name already exists." });
  }
  const oldName = dept.name;
  const updated = await db.updateDepartment(dept.id, { name });
  await logAction({
    actor: req.user,
    action: "Department renamed",
    details: `${oldName} → ${updated.name}`,
    relatedRecordId: dept.id
  });
  res.json({ department: updated });
}));

router.patch("/:id/status", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const dept = await db.getDepartmentById(req.params.id);
  if (!dept) return res.status(404).json({ error: "Department not found." });
  const active = Boolean(req.body?.active);
  const updated = await db.updateDepartment(dept.id, { active });
  await logAction({
    actor: req.user,
    action: active ? "Department reactivated" : "Department deactivated",
    details: dept.name,
    relatedRecordId: dept.id
  });
  res.json({ department: updated });
}));

router.delete("/:id", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const dept = await db.getDepartmentById(req.params.id);
  if (!dept) return res.status(404).json({ error: "Department not found." });

  if (await db.departmentInUseByActiveAccessPoint(dept.name)) {
    return res.status(409).json({
      error: `"${dept.name}" is still in use by an active Access Point. Reassign or deactivate that Access Point first.`
    });
  }

  await db.deleteDepartment(dept.id);
  await logAction({ actor: req.user, action: "Department removed", details: dept.name });
  res.json({ ok: true });
}));

module.exports = router;
