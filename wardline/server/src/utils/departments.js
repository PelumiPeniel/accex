// A single shared version of "find this department, or create it if it's
// new" — used when creating or editing an Access Point. Kept in one place
// so it can't quietly drift into slightly different behavior anywhere it's
// used.
const db = require("../db");
const { newId } = require("./ids");

async function ensureDepartment(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const existing = await db.getDepartmentByName(trimmed);
  if (existing) return existing;
  return db.createDepartment({ id: newId("dep"), name: trimmed, active: true });
}

module.exports = { ensureDepartment };
