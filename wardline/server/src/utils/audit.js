// audit.js
// ---------------------------------------------------------------------------
// One helper, used by every route that performs a recordable action. With
// the JSON file, this used to push into an array that the caller then had
// to remember to save. With a real database, the insert IS the save — so
// every call site just does `await logAction(...)` and it's already
// durable, no separate write step to forget.
// ---------------------------------------------------------------------------
const db = require("../db");
const { newId } = require("./ids");

async function logAction({ actor = null, action, details = "", relatedRecordId = null, accessPointId = null }) {
  await db.insertAudit({
    id: newId("aud"),
    user: actor ? actor.fullName : "Unauthenticated",
    staffNumber: actor ? actor.staffNumber : null,
    role: actor ? actor.role : null,
    accessPointId: accessPointId || (actor ? actor.accessPointId : null),
    action,
    relatedRecordId,
    details
  });
}

module.exports = { logAction };
