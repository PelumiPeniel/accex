const express = require("express");
const db = require("../db");
const { requireAuth, requireGroup, requireRole } = require("../middleware/auth");
const { newId } = require("../utils/ids");
const { deriveVisitorView } = require("../utils/visitTime");
const { hasGroup } = require("../utils/permissions");
const { logAction } = require("../utils/audit");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

// Administrator and Access Officer always use their own account's fixed
// accessPointId. System Administrator has none — by design, since they
// aren't tied to one location — so for officer-duty actions specifically,
// they explicitly choose which Access Point they're currently acting for
// (an in-session "Acting Access Point" selector in the dashboard, not a
// permanent assignment), and must pass its id explicitly.
function resolveAccessPointId(req, source) {
  if (req.user.accessPointId) return req.user.accessPointId;
  if (req.user.role === "SystemAdministrator") return source?.accessPointId || null;
  return null;
}

// ---------------------------------------------------------------------------
// Staff endpoints
// ---------------------------------------------------------------------------
router.use(requireAuth);

router.post("/sign-in", requireGroup("OfficerDuties"), asyncHandler(async (req, res) => {
  const accessPointId = resolveAccessPointId(req, req.body);
  if (!accessPointId) return res.status(400).json({ error: "No Access Point context for this sign-in." });

  const ap = await db.getAccessPointById(accessPointId);
  if (!ap || !ap.active) return res.status(400).json({ error: "Invalid or inactive Access Point." });

  const {
    visitorType, firstName, lastName, purpose, durationCategoryId, signature, agreedToTerms,
    staffNumber, department, company, phone
  } = req.body || {};

  if (!["Staff", "External"].includes(visitorType)) {
    return res.status(400).json({ error: "Select whether this visitor is Staff or an External Visitor." });
  }
  if (!agreedToTerms) {
    return res.status(400).json({ error: "The visitor must accept the entry rules before signing in." });
  }

  const commonMissing = ["firstName", "lastName", "purpose", "durationCategoryId", "signature"].filter((f) => !req.body?.[f]);
  const typeMissing = visitorType === "Staff"
    ? ["staffNumber", "department"].filter((f) => !req.body?.[f])
    : ["company", "phone"].filter((f) => !req.body?.[f]);
  const missing = [...commonMissing, ...typeMissing];
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });

  if (visitorType === "Staff" && department.trim().toLowerCase() === ap.department.toLowerCase()) {
    return res.status(400).json({ error: `Staff visitors can't be from ${ap.name}'s own department (${ap.department}).` });
  }

  const categories = await db.listDurationCategories();
  const category = categories.find((c) => c.id === durationCategoryId);
  if (!category) return res.status(400).json({ error: "Select a valid expected duration." });

  const settings = await db.getSettings();
  const now = new Date();
  const nowIso = now.toISOString();
  const expectedDeparture = new Date(now.getTime() + category.minutes * 60000).toISOString();

  const visitor = await db.createVisitor({
    id: newId("vis"),
    accessPointId,
    visitorType,
    firstName,
    lastName,
    company: visitorType === "External" ? company : settings.organizationName,
    phone: visitorType === "External" ? phone : null,
    staffNumber: visitorType === "Staff" ? staffNumber : null,
    department: visitorType === "Staff" ? department : null,
    purpose,
    timeIn: nowIso,
    expectedDurationLabel: category.label,
    expectedDurationMinutes: category.minutes,
    expectedDeparture,
    signInSignature: signature,
    signInSignatureAt: nowIso,
    agreedToTerms: true,
    agreedToTermsAt: nowIso,
    status: "Active",
    supervisingOfficer: req.user.fullName,
    supervisingStaffNumber: req.user.staffNumber,
    extensions: []
  });

  await logAction({
    actor: req.user,
    action: "Visitor sign-in",
    details: `${visitor.fullName} (${visitorType}${visitorType === "Staff" ? `, ${department}` : `, ${company}`}) — expected ${category.label}`,
    relatedRecordId: visitor.id,
    accessPointId
  });
  res.status(201).json({ visitor: deriveVisitorView(visitor) });
}));

router.get("/active", requireGroup("OfficerDuties"), asyncHandler(async (req, res) => {
  const accessPointId = resolveAccessPointId(req, req.query);
  if (!accessPointId) return res.status(400).json({ error: "No Access Point context." });

  const now = new Date().toISOString();
  const active = await db.listActiveVisitors(accessPointId);
  const views = active.map((v) => deriveVisitorView(v, now)).sort((a, b) => new Date(a.timeIn) - new Date(b.timeIn));
  res.json({ visitors: views });
}));

router.get("/summary", requireGroup("OfficerDuties"), asyncHandler(async (req, res) => {
  const accessPointId = resolveAccessPointId(req, req.query);
  if (!accessPointId) return res.status(400).json({ error: "No Access Point context." });

  const all = await db.listVisitorsForSummary(accessPointId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todays = all.filter((v) => new Date(v.timeIn) >= todayStart);
  const activeNow = all.filter((v) => v.status === "Active" || v.status === "Overdue");
  const overdueNow = activeNow.filter((v) => deriveVisitorView(v).status === "Overdue");

  res.json({
    activeVisitors: activeNow.length,
    overdueVisitors: overdueNow.length,
    todaysSignIns: todays.length,
    todaysCompleted: todays.filter((v) => v.status === "Completed").length
  });
}));

router.get("/", asyncHandler(async (req, res) => {
  const canFullHistory = hasGroup(req.user, "ReportingAudit");
  const canToday = hasGroup(req.user, "OfficerDuties");
  if (!canFullHistory && !canToday) {
    return res.status(403).json({ error: "You do not have permission to view visitor records." });
  }

  const { q, status, date, from, to, visitorType, accessPointId } = req.query;
  const params = { status, visitorType, q };

  if (req.user.role === "SystemAdministrator") {
    if (accessPointId) params.accessPointId = accessPointId;
  } else {
    params.accessPointId = req.user.accessPointId;
    if (!canFullHistory) {
      params.todayOnly = true;
    } else {
      if (date) { params.from = new Date(date).toISOString(); params.to = new Date(new Date(date).getTime() + 86400000).toISOString(); }
      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(to).toISOString();
    }
  }

  const rows = await db.searchVisitors(params);
  res.json({ visitors: rows.map((v) => deriveVisitorView(v)) });
}));

async function loadOwnedVisitor(req, res) {
  const visitor = await db.getVisitorById(req.params.id);
  if (!visitor) {
    res.status(404).json({ error: "Visitor record not found." });
    return null;
  }
  if (req.user.role !== "SystemAdministrator" && visitor.accessPointId !== req.user.accessPointId) {
    res.status(403).json({ error: "This visitor record belongs to a different Access Point." });
    return null;
  }
  return visitor;
}

router.get("/:id", requireGroup("OfficerDuties"), asyncHandler(async (req, res) => {
  const visitor = await loadOwnedVisitor(req, res);
  if (!visitor) return;
  res.json({ visitor: deriveVisitorView(visitor) });
}));

router.post("/:id/extend", requireGroup("OfficerDuties"), asyncHandler(async (req, res) => {
  const visitor = await loadOwnedVisitor(req, res);
  if (!visitor) return;
  if (visitor.status === "Completed" || visitor.status === "Cancelled") {
    return res.status(400).json({ error: "This visit has already ended." });
  }
  const { extraMinutes, reason } = req.body || {};
  const minutes = Number(extraMinutes);
  if (!minutes || minutes <= 0) return res.status(400).json({ error: "Enter a valid extension length." });

  const previousExpectedDeparture = visitor.expectedDeparture;
  const newExpectedDeparture = new Date(new Date(visitor.expectedDeparture).getTime() + minutes * 60000).toISOString();
  const extensions = [...visitor.extensions, {
    id: newId("ext"),
    previousExpectedDeparture,
    extensionMinutes: minutes,
    newExpectedDeparture,
    grantedBy: req.user.fullName,
    grantedByStaffNumber: req.user.staffNumber,
    reason: reason || null,
    at: new Date().toISOString()
  }];

  const updated = await db.updateVisitor(visitor.id, {
    expectedDeparture: newExpectedDeparture,
    status: "Active",
    extensions
  });

  await logAction({
    actor: req.user,
    action: "Visitor extension granted",
    details: `${visitor.fullName}: +${minutes} min${reason ? ` — ${reason}` : ""}`,
    relatedRecordId: visitor.id,
    accessPointId: visitor.accessPointId
  });
  res.json({ visitor: deriveVisitorView(updated) });
}));

router.post("/:id/sign-out", requireGroup("OfficerDuties"), asyncHandler(async (req, res) => {
  const visitor = await loadOwnedVisitor(req, res);
  if (!visitor) return;
  if (visitor.status === "Completed" || visitor.status === "Cancelled") {
    return res.status(400).json({ error: "This visit has already ended." });
  }
  const { signature, notes } = req.body || {};
  if (!signature) return res.status(400).json({ error: "A signature is required to complete sign-out." });

  const now = new Date().toISOString();
  const view = deriveVisitorView(visitor, now);
  const updated = await db.updateVisitor(visitor.id, {
    timeOut: now,
    durationMinutes: view.currentDurationMinutes,
    signOutSignature: signature,
    signOutMethod: "Assisted",
    signOutOfficer: req.user.fullName,
    signOutStaffNumber: req.user.staffNumber,
    signOutNotes: notes || null,
    status: "Completed"
  });

  await logAction({
    actor: req.user,
    action: "Assisted sign-out",
    details: `${visitor.fullName}${notes ? ` — ${notes}` : ""}`,
    relatedRecordId: visitor.id,
    accessPointId: visitor.accessPointId
  });
  res.json({ visitor: deriveVisitorView(updated) });
}));

router.post("/:id/cancel", requireRole("Administrator", "SystemAdministrator"), asyncHandler(async (req, res) => {
  const visitor = await loadOwnedVisitor(req, res);
  if (!visitor) return;
  const updated = await db.updateVisitor(visitor.id, { status: "Cancelled" });
  await logAction({
    actor: req.user,
    action: "Visitor record cancelled",
    details: visitor.fullName,
    relatedRecordId: visitor.id,
    accessPointId: visitor.accessPointId
  });
  res.json({ visitor: deriveVisitorView(updated) });
}));

module.exports = router;
