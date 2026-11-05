// passwordPolicy.js
// ---------------------------------------------------------------------------
// One shared password complexity check, used everywhere a new password is
// set — creating any account, resetting any account's password. Kept in
// one place so the actual rule can never accidentally differ between one
// form's server-side check and another's.
// ---------------------------------------------------------------------------
function passwordComplexityErrors(password, minLength) {
  const pw = password || "";
  const missing = [];
  if (pw.length < minLength) missing.push(`at least ${minLength} characters`);
  if (!/[a-z]/.test(pw)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(pw)) missing.push("an uppercase letter");
  if (!/[0-9]/.test(pw)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push("a special character");
  return missing;
}

module.exports = { passwordComplexityErrors };
