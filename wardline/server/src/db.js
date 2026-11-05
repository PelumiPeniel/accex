// db.js
// ---------------------------------------------------------------------------
// The ONLY file in the application that talks to the database directly.
//
// Every route asks this module for data rather than querying PostgreSQL
// itself. That was a deliberate decision made back when this used a JSON
// file — and it's exactly what made this migration a rewrite of one file
// instead of a rewrite of the whole server.
//
// Each function here is small, named for what it does, and returns plain
// JavaScript objects shaped the same way the rest of the app already
// expects (camelCase keys), so nothing downstream had to change.
// ---------------------------------------------------------------------------
const { query, withTransaction } = require("./pool");

// --- shape converters -------------------------------------------------
// PostgreSQL columns are snake_case by convention; our JavaScript is
// camelCase. These translate between the two so neither side has to
// compromise on its own conventions.

function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.full_name,
    firstName: r.first_name,
    lastName: r.last_name,
    staffNumber: r.staff_number,
    username: r.username,
    passwordHash: r.password_hash,
    role: r.role,
    accessPointId: r.access_point_id,
    status: r.status,
    sessionTimerVisible: r.session_timer_visible,
    failedAttempts: r.failed_attempts,
    lockedUntil: r.locked_until ? r.locked_until.toISOString() : null,
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    mustChangePassword: r.must_change_password,
    previousPasswordHash: r.previous_password_hash,
    createdAt: r.created_at ? r.created_at.toISOString() : null
  };
}

function rowToAccessPoint(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    department: r.department,
    entryRules: r.entry_rules,
    active: r.active,
    createdAt: r.created_at ? r.created_at.toISOString() : null
  };
}

function rowToVisitor(r) {
  if (!r) return null;
  return {
    id: r.id,
    accessPointId: r.access_point_id,
    visitorType: r.visitor_type,
    fullName: r.full_name,
    firstName: r.first_name,
    lastName: r.last_name,
    company: r.company,
    phone: r.phone,
    staffNumber: r.staff_number,
    department: r.department,
    purpose: r.purpose,
    timeIn: r.time_in ? r.time_in.toISOString() : null,
    expectedDurationLabel: r.expected_duration_label,
    expectedDurationMinutes: r.expected_duration_minutes,
    expectedDeparture: r.expected_departure ? r.expected_departure.toISOString() : null,
    signInSignature: r.sign_in_signature,
    signInSignatureAt: r.sign_in_signature_at ? r.sign_in_signature_at.toISOString() : null,
    agreedToTerms: r.agreed_to_terms,
    agreedToTermsAt: r.agreed_to_terms_at ? r.agreed_to_terms_at.toISOString() : null,
    status: r.status,
    supervisingOfficer: r.supervising_officer,
    supervisingStaffNumber: r.supervising_staff_number,
    extensions: r.extensions || [],
    timeOut: r.time_out ? r.time_out.toISOString() : null,
    durationMinutes: r.duration_minutes,
    signOutSignature: r.sign_out_signature,
    signOutMethod: r.sign_out_method,
    signOutOfficer: r.sign_out_officer,
    signOutStaffNumber: r.sign_out_staff_number,
    signOutNotes: r.sign_out_notes
  };
}

function rowToAudit(r) {
  return {
    id: r.id,
    timestamp: r.timestamp ? r.timestamp.toISOString() : null,
    user: r.user_name,
    staffNumber: r.staff_number,
    role: r.role,
    accessPointId: r.access_point_id,
    action: r.action,
    relatedRecordId: r.related_record_id,
    details: r.details
  };
}

// --- users ------------------------------------------------------------

async function getUserById(id) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  return rowToUser(rows[0]);
}

async function getUserByUsername(username) {
  const { rows } = await query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
  return rowToUser(rows[0]);
}

async function listUsersByRole(role) {
  const { rows } = await query("SELECT * FROM users WHERE role = $1 ORDER BY full_name", [role]);
  return rows.map(rowToUser);
}

async function listUsersByRoleAndAccessPoint(role, accessPointId) {
  const { rows } = await query(
    "SELECT * FROM users WHERE role = $1 AND access_point_id = $2 ORDER BY full_name",
    [role, accessPointId]
  );
  return rows.map(rowToUser);
}

async function staffNumberExists(staffNumber, excludeId = null) {
  const { rows } = await query(
    "SELECT 1 FROM users WHERE LOWER(staff_number) = LOWER($1) AND ($2::text IS NULL OR id <> $2)",
    [staffNumber, excludeId]
  );
  return rows.length > 0;
}

async function usernameExists(username, excludeId = null) {
  const { rows } = await query(
    "SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND ($2::text IS NULL OR id <> $2)",
    [username, excludeId]
  );
  return rows.length > 0;
}

async function createUser(u) {
  // full_name is derived here, not entered anywhere — first/last name are
  // the fields the app actually collects. full_name is kept populated
  // regardless, so ORDER BY full_name and the old camelCase read
  // (`user.fullName`) keep working everywhere they're already used.
  const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  await query(
    `INSERT INTO users (id, full_name, first_name, last_name, staff_number, username, password_hash, role,
       access_point_id, status, session_timer_visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [u.id, fullName, u.firstName || "", u.lastName || "", u.staffNumber, u.username, u.passwordHash, u.role,
     u.accessPointId, u.status, u.sessionTimerVisible !== false]
  );
  return getUserById(u.id);
}

async function updateUserFields(id, fields) {
  // If either name half changes, full_name is recomputed from the final
  // pair (whichever half wasn't touched keeps its current DB value) so it
  // never drifts out of sync with first_name/last_name.
  if (fields.firstName !== undefined || fields.lastName !== undefined) {
    const current = await getUserById(id);
    const firstName = fields.firstName !== undefined ? fields.firstName : current.firstName;
    const lastName = fields.lastName !== undefined ? fields.lastName : current.lastName;
    fields = { ...fields, fullName: `${firstName} ${lastName}`.trim() };
  }
  const map = {
    fullName: "full_name", firstName: "first_name", lastName: "last_name",
    staffNumber: "staff_number", status: "status",
    passwordHash: "password_hash", accessPointId: "access_point_id",
    sessionTimerVisible: "session_timer_visible", failedAttempts: "failed_attempts",
    lockedUntil: "locked_until", lastLoginAt: "last_login_at",
    mustChangePassword: "must_change_password", previousPasswordHash: "previous_password_hash"
  };
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return getUserById(id);
  values.push(id);
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${i}`, values);
  return getUserById(id);
}

// --- access points ----------------------------------------------------

async function listAccessPoints({ activeOnly = false } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM access_points WHERE active = TRUE ORDER BY name"
    : "SELECT * FROM access_points ORDER BY name";
  const { rows } = await query(sql);
  return rows.map(rowToAccessPoint);
}

async function getAccessPointById(id) {
  const { rows } = await query("SELECT * FROM access_points WHERE id = $1", [id]);
  return rowToAccessPoint(rows[0]);
}

async function getAccessPointByName(name) {
  const { rows } = await query("SELECT * FROM access_points WHERE LOWER(name) = LOWER($1)", [name]);
  return rowToAccessPoint(rows[0]);
}

async function createAccessPoint(ap) {
  await query(
    `INSERT INTO access_points (id, name, department, entry_rules, active)
     VALUES ($1,$2,$3,$4,$5)`,
    [ap.id, ap.name, ap.department, ap.entryRules, ap.active !== false]
  );
  return getAccessPointById(ap.id);
}

async function updateAccessPoint(id, fields) {
  const map = { name: "name", department: "department", entryRules: "entry_rules", active: "active" };
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return getAccessPointById(id);
  values.push(id);
  await query(`UPDATE access_points SET ${sets.join(", ")} WHERE id = $${i}`, values);
  return getAccessPointById(id);
}

// --- departments ------------------------------------------------------

async function listDepartments({ activeOnly = false } = {}) {
  const sql = activeOnly
    ? "SELECT * FROM departments WHERE active = TRUE ORDER BY name"
    : "SELECT * FROM departments ORDER BY name";
  const { rows } = await query(sql);
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }));
}

async function getDepartmentById(id) {
  const { rows } = await query("SELECT * FROM departments WHERE id = $1", [id]);
  const r = rows[0];
  return r ? { id: r.id, name: r.name, active: r.active } : null;
}

async function getDepartmentByName(name) {
  const { rows } = await query("SELECT * FROM departments WHERE LOWER(name) = LOWER($1)", [name]);
  const r = rows[0];
  return r ? { id: r.id, name: r.name, active: r.active } : null;
}

async function createDepartment(d) {
  await query("INSERT INTO departments (id, name, active) VALUES ($1,$2,$3)", [d.id, d.name, d.active !== false]);
  return getDepartmentById(d.id);
}

async function updateDepartment(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  if (fields.name !== undefined) { sets.push(`name = $${i++}`); values.push(fields.name); }
  if (fields.active !== undefined) { sets.push(`active = $${i++}`); values.push(fields.active); }
  if (sets.length === 0) return getDepartmentById(id);
  values.push(id);
  await query(`UPDATE departments SET ${sets.join(", ")} WHERE id = $${i}`, values);
  return getDepartmentById(id);
}

async function deleteDepartment(id) {
  await query("DELETE FROM departments WHERE id = $1", [id]);
}

async function departmentInUseByActiveAccessPoint(name) {
  const { rows } = await query(
    "SELECT 1 FROM access_points WHERE active = TRUE AND LOWER(department) = LOWER($1)",
    [name]
  );
  return rows.length > 0;
}

// --- duration categories ----------------------------------------------

async function listDurationCategories() {
  const { rows } = await query("SELECT * FROM duration_categories ORDER BY sort_order, minutes");
  return rows.map((r) => ({ id: r.id, label: r.label, minutes: r.minutes }));
}

async function replaceDurationCategories(categories) {
  return withTransaction(async (client) => {
    await client.query("DELETE FROM duration_categories");
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      await client.query(
        "INSERT INTO duration_categories (id, label, minutes, sort_order) VALUES ($1,$2,$3,$4)",
        [c.id, c.label, Number(c.minutes), i]
      );
    }
    const { rows } = await client.query("SELECT * FROM duration_categories ORDER BY sort_order, minutes");
    return rows.map((r) => ({ id: r.id, label: r.label, minutes: r.minutes }));
  });
}

// --- visitors ---------------------------------------------------------

async function getVisitorById(id) {
  const { rows } = await query("SELECT * FROM visitors WHERE id = $1", [id]);
  return rowToVisitor(rows[0]);
}

async function listActiveVisitors(accessPointId) {
  const { rows } = await query(
    `SELECT * FROM visitors
     WHERE access_point_id = $1 AND status IN ('Active','Overdue')
     ORDER BY time_in ASC`,
    [accessPointId]
  );
  return rows.map(rowToVisitor);
}

async function listVisitorsForSummary(accessPointId) {
  const { rows } = await query("SELECT * FROM visitors WHERE access_point_id = $1", [accessPointId]);
  return rows.map(rowToVisitor);
}

async function createVisitor(v) {
  const fullName = `${v.firstName || ""} ${v.lastName || ""}`.trim();
  await query(
    `INSERT INTO visitors (
      id, access_point_id, visitor_type, full_name, first_name, last_name, company, phone, staff_number,
      department, purpose, time_in, expected_duration_label, expected_duration_minutes,
      expected_departure, sign_in_signature, sign_in_signature_at, agreed_to_terms,
      agreed_to_terms_at, status, supervising_officer, supervising_staff_number, extensions
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)`,
    [v.id, v.accessPointId, v.visitorType, fullName, v.firstName || "", v.lastName || "", v.company, v.phone, v.staffNumber,
     v.department, v.purpose, v.timeIn, v.expectedDurationLabel, v.expectedDurationMinutes,
     v.expectedDeparture, v.signInSignature, v.signInSignatureAt, v.agreedToTerms,
     v.agreedToTermsAt, v.status, v.supervisingOfficer, v.supervisingStaffNumber,
     JSON.stringify(v.extensions || [])]
  );
  return getVisitorById(v.id);
}

async function updateVisitor(id, fields) {
  const map = {
    status: "status", expectedDeparture: "expected_departure", timeOut: "time_out",
    durationMinutes: "duration_minutes", signOutSignature: "sign_out_signature",
    signOutMethod: "sign_out_method", signOutOfficer: "sign_out_officer",
    signOutStaffNumber: "sign_out_staff_number", signOutNotes: "sign_out_notes"
  };
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(fields, "extensions")) {
    sets.push(`extensions = $${i++}::jsonb`);
    values.push(JSON.stringify(fields.extensions));
  }
  if (sets.length === 0) return getVisitorById(id);
  values.push(id);
  await query(`UPDATE visitors SET ${sets.join(", ")} WHERE id = $${i}`, values);
  return getVisitorById(id);
}

// Search with filters applied in SQL rather than in JavaScript — this is
// the core scaling win over the JSON file: the database returns only the
// matching rows, instead of the server loading every visitor ever and
// filtering them in memory.
async function searchVisitors({ accessPointId, todayOnly, status, visitorType, from, to, q }) {
  const where = [];
  const values = [];
  let i = 1;

  if (accessPointId) { where.push(`access_point_id = $${i++}`); values.push(accessPointId); }
  if (todayOnly) where.push(`time_in >= date_trunc('day', NOW())`);
  if (status) { where.push(`status = $${i++}`); values.push(status); }
  if (visitorType) { where.push(`visitor_type = $${i++}`); values.push(visitorType); }
  if (from) { where.push(`time_in >= $${i++}`); values.push(from); }
  if (to) { where.push(`time_in <= $${i++}`); values.push(to); }
  if (q) {
    where.push(`(
      full_name ILIKE $${i} OR company ILIKE $${i} OR department ILIKE $${i} OR
      purpose ILIKE $${i} OR phone ILIKE $${i} OR staff_number ILIKE $${i} OR
      supervising_officer ILIKE $${i} OR supervising_staff_number ILIKE $${i}
    )`);
    values.push(`%${q}%`);
    i++;
  }

  const sql = `SELECT * FROM visitors ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY time_in DESC LIMIT 2000`;
  const { rows } = await query(sql, values);
  return rows.map(rowToVisitor);
}

// --- audit ------------------------------------------------------------

async function insertAudit(entry) {
  await query(
    `INSERT INTO audit_log (id, user_name, staff_number, role, access_point_id, action, related_record_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entry.id, entry.user, entry.staffNumber, entry.role, entry.accessPointId,
     entry.action, entry.relatedRecordId, entry.details]
  );
}

async function searchAudit({ accessPointId, action, from, to, q, limit = 500 }) {
  const where = [];
  const values = [];
  let i = 1;
  if (accessPointId) { where.push(`access_point_id = $${i++}`); values.push(accessPointId); }
  if (action) { where.push(`action = $${i++}`); values.push(action); }
  if (from) { where.push(`timestamp >= $${i++}`); values.push(from); }
  if (to) { where.push(`timestamp <= $${i++}`); values.push(to); }
  if (q) {
    where.push(`(user_name ILIKE $${i} OR details ILIKE $${i} OR action ILIKE $${i})`);
    values.push(`%${q}%`);
    i++;
  }
  values.push(limit);
  const sql = `SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY timestamp DESC LIMIT $${i}`;
  const { rows } = await query(sql, values);
  return rows.map(rowToAudit);
}

// --- settings ---------------------------------------------------------
// Stored as key/value rows rather than a fixed-column table, so adding a
// new setting later needs no schema change.

async function getSettings() {
  const { rows } = await query("SELECT key, value FROM settings");
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function setSettings(partial) {
  return withTransaction(async (client) => {
    for (const [key, value] of Object.entries(partial)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)]
      );
    }
    const { rows } = await client.query("SELECT key, value FROM settings");
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  });
}

const DEFAULT_ENTRY_RULES = `RESTRICTED AREA — AUTHORIZED PERSONNEL ONLY

1. ACCESS
- Valid ID + Access Badge required
- Sign in/out at the device provided
- Visitors must be escorted by staff at all times
- No badge sharing, no tailgating

2. SECURITY
- No food, drinks, or smoking
- No photos, videos, or personal devices without authorization
- All activity is monitored

3. EQUIPMENT
- No installation, removal, or changes without authorization
- Report faults or hazards to staff immediately

4. CONFIDENTIALITY
- Access to data/systems only with explicit authorization
- All information seen is confidential
- Violation may result in disciplinary or legal action

IN CASE OF EMERGENCY: EVACUATE & CALL SECURITY`;

module.exports = {
  DEFAULT_ENTRY_RULES,
  // users
  getUserById, getUserByUsername, listUsersByRole, listUsersByRoleAndAccessPoint,
  staffNumberExists, usernameExists, createUser, updateUserFields,
  // access points
  listAccessPoints, getAccessPointById, getAccessPointByName, createAccessPoint, updateAccessPoint,
  // departments
  listDepartments, getDepartmentById, getDepartmentByName, createDepartment,
  updateDepartment, deleteDepartment, departmentInUseByActiveAccessPoint,
  // duration categories
  listDurationCategories, replaceDurationCategories,
  // visitors
  getVisitorById, listActiveVisitors, listVisitorsForSummary, createVisitor,
  updateVisitor, searchVisitors,
  // audit
  insertAudit, searchAudit,
  // settings
  getSettings, setSettings
};
