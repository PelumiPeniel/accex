const jwt = require("jsonwebtoken");
const db = require("../db");
const { hasGroup } = require("../utils/permissions");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(user, timeoutMinutes) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: `${timeoutMinutes}m` });
}

// Now async, since confirming the user still exists means a real database
// lookup instead of reading an in-memory array. Every route that uses this
// middleware already awaits it implicitly via Express's error-handling for
// async middleware, so nothing downstream needed to change.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.getUserById(payload.sub);
    if (!user || user.status !== "Active") {
      return res.status(401).json({ error: "Session is no longer valid." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

function requireGroup(groupKey) {
  return (req, res, next) => {
    if (!req.user || !hasGroup(req.user, groupKey)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, requireGroup, JWT_SECRET };
