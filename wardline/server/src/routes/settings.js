const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../utils/audit");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

router.get("/duration-categories", requireAuth, asyncHandler(async (req, res) => {
  res.json({ durationCategories: await db.listDurationCategories() });
}));

router.put(
  "/duration-categories",
  requireAuth,
  requireRole("Administrator", "SystemAdministrator"),
  asyncHandler(async (req, res) => {
    const { durationCategories } = req.body || {};
    if (!Array.isArray(durationCategories) || durationCategories.length === 0) {
      return res.status(400).json({ error: "At least one duration category is required." });
    }
    for (const c of durationCategories) {
      if (!c.label || !c.minutes || c.minutes <= 0) {
        return res.status(400).json({ error: "Each category needs a label and a positive number of minutes." });
      }
    }
    const normalized = durationCategories.map((c) => ({
      id: c.id && !c.id.startsWith("dur_temp") ? c.id : `dur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: c.label,
      minutes: Number(c.minutes)
    }));
    const saved = await db.replaceDurationCategories(normalized);
    await logAction({
      actor: req.user,
      action: "Duration categories updated",
      details: saved.map((c) => c.label).join(", ")
    });
    res.json({ durationCategories: saved });
  })
);

router.get("/", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  res.json({ settings: await db.getSettings() });
}));

router.put("/", requireAuth, requireRole("SystemAdministrator"), asyncHandler(async (req, res) => {
  const allowedKeys = [
    "organizationName", "sessionTimeoutMinutes", "sessionWarningSeconds",
    "maxFailedLogins", "loginLockoutMinutes", "passwordMinLength",
    "activeDirectoryEnabled"
  ];
  const partial = {};
  for (const key of allowedKeys) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
      partial[key] = req.body[key];
    }
  }
  const settings = await db.setSettings(partial);
  await logAction({ actor: req.user, action: "Configuration changed", details: `Updated: ${Object.keys(partial).join(", ")}` });
  res.json({ settings });
}));

module.exports = router;
