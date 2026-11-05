const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");
const { logAction } = require("../utils/audit");
const { asyncHandler } = require("../utils/asyncHandler");
const { passwordComplexityErrors } = require("../utils/passwordPolicy");

const router = express.Router();

function sanitize(user) {
  const { passwordHash, failedAttempts, lockedUntil, previousPasswordHash, ...safe } = user;
  return safe;
}

router.post("/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.getUserByUsername(String(username || ""));

  const genericError = () => res.status(401).json({ error: "Invalid username or password." });

  if (!user) {
    await logAction({ action: "Failed login", details: `Unknown username "${username}"` });
    return genericError();
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    await logAction({ actor: user, action: "Failed login", details: "Account temporarily locked." });
    return res.status(423).json({
      error: `Too many failed attempts. Try again after ${new Date(user.lockedUntil).toLocaleTimeString()}.`
    });
  }

  if (user.status !== "Active") {
    await logAction({ actor: user, action: "Failed login", details: "Account inactive." });
    return genericError();
  }

  const ok = bcrypt.compareSync(password || "", user.passwordHash);
  const settings = await db.getSettings();

  if (!ok) {
    const failedAttempts = (user.failedAttempts || 0) + 1;
    const max = settings.maxFailedLogins;
    if (failedAttempts >= max) {
      const lockoutMs = settings.loginLockoutMinutes * 60000;
      await db.updateUserFields(user.id, {
        failedAttempts: 0,
        lockedUntil: new Date(Date.now() + lockoutMs).toISOString()
      });
      await logAction({ actor: user, action: "Account locked", details: `${max} consecutive failed attempts.` });
    } else {
      await db.updateUserFields(user.id, { failedAttempts });
      await logAction({ actor: user, action: "Failed login", details: "Incorrect password." });
    }
    return genericError();
  }

  // No device-based login lock — which Access Point a session sees comes
  // entirely from the account's own accessPointId, not from where the
  // login happened. Any staff member can log in from anywhere.

  await db.updateUserFields(user.id, {
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString()
  });
  await logAction({ actor: user, action: "Staff login" });

  const token = signToken(user, settings.sessionTimeoutMinutes);
  res.json({
    token,
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    sessionWarningSeconds: settings.sessionWarningSeconds,
    user: sanitize(user)
  });
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await logAction({ actor: req.user, action: "Staff logout" });
  res.json({ ok: true });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const settings = await db.getSettings();
  res.json({
    user: sanitize(req.user),
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    sessionWarningSeconds: settings.sessionWarningSeconds
  });
}));

router.post("/heartbeat", requireAuth, asyncHandler(async (req, res) => {
  const settings = await db.getSettings();
  const token = signToken(req.user, settings.sessionTimeoutMinutes);
  res.json({ token, sessionTimeoutMinutes: settings.sessionTimeoutMinutes });
}));

router.patch("/session-timer-visibility", requireAuth, asyncHandler(async (req, res) => {
  const visible = Boolean(req.body?.visible);
  await db.updateUserFields(req.user.id, { sessionTimerVisible: visible });
  res.json({ sessionTimerVisible: visible });
}));

// The mandatory step after a password reset: the account holder must set
// their own password before they can actually use the account. Checked
// against both the temporary password they just logged in with, and
// whatever they had immediately before the reset — so a reset can't be
// quietly turned into "just log in with the same password again."
router.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const { newPassword } = req.body || {};
  const settings = await db.getSettings();
  const passwordIssues = passwordComplexityErrors(newPassword, settings.passwordMinLength);
  if (passwordIssues.length) {
    return res.status(400).json({ error: `Password must include: ${passwordIssues.join(", ")}.` });
  }

  const user = req.user;
  if (bcrypt.compareSync(newPassword, user.passwordHash)) {
    return res.status(400).json({ error: "Your new password can't be the same as the one you just logged in with." });
  }
  if (user.previousPasswordHash && bcrypt.compareSync(newPassword, user.previousPasswordHash)) {
    return res.status(400).json({ error: "Your new password can't be the same as your previous password." });
  }

  await db.updateUserFields(user.id, {
    passwordHash: bcrypt.hashSync(newPassword, 10),
    mustChangePassword: false,
    previousPasswordHash: null
  });
  await logAction({ actor: user, action: "Password changed", details: "Self-service, after an administrator-issued reset." });
  res.json({ ok: true });
}));

module.exports = router;
