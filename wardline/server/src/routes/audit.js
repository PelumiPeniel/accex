const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
// Audit Trail is now System Administrator only — viewing and exporting
// both. Administrator held the Reporting & Audit group by default, which
// used to include this; that's been narrowed specifically, without
// touching what Reporting & Audit still covers (report generation).
router.use(requireAuth, requireRole("SystemAdministrator"));

router.get("/", asyncHandler(async (req, res) => {
  const { action, from, to, q } = req.query;
  const params = { action, q };
  if (from) params.from = new Date(from).toISOString();
  if (to) params.to = new Date(to).toISOString();

  res.json({ auditLog: await db.searchAudit(params) });
}));

module.exports = router;
