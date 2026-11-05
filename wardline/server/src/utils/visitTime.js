function minutesBetween(aIso, bIso) {
  return Math.floor((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

function formatDuration(totalMinutes) {
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${m}m`;
}

// Mutates nothing; returns a derived view of a visitor record. Overdue
// status is always computed fresh from the current time, never stored —
// this is the one and only definition of "overdue" in the codebase, shared
// by the monitoring table, the landing page counter, and reports alike.
function deriveVisitorView(visitor, nowIso = new Date().toISOString()) {
  // For Staff visitors, "company" is actually the organization name
  // (auto-filled from the global Organization Name setting) — shown as
  // "Organization/Department" so records read e.g. "Nahco Aviance/ICT".
  const orgLabel =
    visitor.visitorType === "Staff"
      ? `${visitor.company}/${visitor.department}`
      : visitor.company;

  if (visitor.status === "Completed" || visitor.status === "Cancelled") {
    return {
      ...visitor,
      orgLabel,
      currentDurationMinutes: visitor.durationMinutes ?? null,
      currentDurationLabel: visitor.durationMinutes != null ? formatDuration(visitor.durationMinutes) : null,
      overdueMinutes: 0,
      overdueLabel: null,
      signOutModeLabel:
        visitor.status === "Completed"
          ? visitor.signOutMethod === "Assisted"
            ? visitor.signOutOfficer
            : visitor.signOutMethod
          : null
    };
  }

  const currentDurationMinutes = minutesBetween(visitor.timeIn, nowIso);
  const overdueMinutes = Math.max(0, minutesBetween(visitor.expectedDeparture, nowIso));
  const isOverdue = overdueMinutes > 0;

  return {
    ...visitor,
    orgLabel,
    status: isOverdue ? "Overdue" : "Active",
    currentDurationMinutes,
    currentDurationLabel: formatDuration(currentDurationMinutes),
    overdueMinutes,
    overdueLabel: isOverdue ? formatDuration(overdueMinutes) : null,
    signOutModeLabel: null
  };
}

module.exports = { minutesBetween, formatDuration, deriveVisitorView };
