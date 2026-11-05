// staffLookup.js
// ---------------------------------------------------------------------------
// Calls the Active Directory autofill endpoint. Used on every staff-number
// field in the app (visitor sign-in for Staff-type visitors, and every
// account creation/edit form).
//
// Deliberately silent on any kind of failure — a bad network, AD being
// down, the feature being turned off, or just no match for that staff
// number. None of those should ever block the form: the caller just
// doesn't get an autofill, and the person types the name in themselves,
// same as always. Nothing here throws.
// ---------------------------------------------------------------------------
import { api } from "../api";

export async function tryStaffLookup(staffNumber) {
  if (!staffNumber || !staffNumber.trim()) return null;
  try {
    const data = await api.get(`/users/lookup-staff/${encodeURIComponent(staffNumber.trim())}`);
    if (data?.found) {
      return { firstName: data.firstName || "", lastName: data.lastName || "" };
    }
    return null;
  } catch {
    return null;
  }
}
