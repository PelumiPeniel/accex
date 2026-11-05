// activeDirectory.js
// ---------------------------------------------------------------------------
// Looks a staff number up in the organization's Active Directory over LDAP,
// so First name / Last name can be auto-filled instead of typed by hand.
//
// This is entirely optional and off by default. Nothing in this file runs
// unless:
//   1. AD_URL (and the other AD_* env vars) are configured, AND
//   2. the "activeDirectoryEnabled" global setting is turned on.
// Either one being missing means lookups are skipped — never an error that
// blocks account or visitor creation. AD is a convenience, not a
// dependency: every field it would fill stays a normal, editable text
// input, and if the directory is down, unreachable, or simply doesn't have
// a match, the person just types the name in themselves.
// ---------------------------------------------------------------------------
const ldap = require("ldapjs");

const AD_URL = process.env.AD_URL; // e.g. ldaps://dc01.nahco.local:636
const AD_BASE_DN = process.env.AD_BASE_DN; // e.g. DC=nahco,DC=local
const AD_BIND_DN = process.env.AD_BIND_DN; // service account, e.g. svc-accex@nahco.local
const AD_BIND_PASSWORD = process.env.AD_BIND_PASSWORD;
const AD_STAFF_NUMBER_ATTR = process.env.AD_STAFF_NUMBER_ATTR || "employeeID";
const AD_TIMEOUT_MS = Number(process.env.AD_TIMEOUT_MS) || 5000;

function isConfigured() {
  return Boolean(AD_URL && AD_BASE_DN && AD_BIND_DN && AD_BIND_PASSWORD);
}

// Resolves to { firstName, lastName, department, email } on a match,
// or null when there's no match, AD isn't configured, or anything about
// the lookup fails. Callers never need a try/catch — a failure here always
// just means "couldn't autofill," never a thrown error.
async function lookupStaffByNumber(staffNumber) {
  if (!isConfigured() || !staffNumber) return null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let client;
    try {
      client = ldap.createClient({
        url: AD_URL,
        timeout: AD_TIMEOUT_MS,
        connectTimeout: AD_TIMEOUT_MS
      });
    } catch (err) {
      return finish(null);
    }

    client.on("error", () => finish(null));

    const safeStaffNumber = String(staffNumber).replace(/[()\\*\0]/g, ""); // basic LDAP filter escaping

    client.bind(AD_BIND_DN, AD_BIND_PASSWORD, (bindErr) => {
      if (bindErr) {
        client.destroy();
        return finish(null);
      }

      const opts = {
        filter: `(&(objectClass=user)(${AD_STAFF_NUMBER_ATTR}=${safeStaffNumber}))`,
        scope: "sub",
        attributes: ["givenName", "sn", "department", "mail"]
      };

      let match = null;
      client.search(AD_BASE_DN, opts, (searchErr, res) => {
        if (searchErr) {
          client.destroy();
          return finish(null);
        }
        res.on("searchEntry", (entry) => {
          const attrs = (entry.pojo?.attributes || []).reduce((acc, a) => {
            acc[a.type] = a.values?.[0];
            return acc;
          }, {});
          match = {
            firstName: attrs.givenName || "",
            lastName: attrs.sn || "",
            department: attrs.department || null,
            email: attrs.mail || null
          };
        });
        res.on("error", () => { client.destroy(); finish(null); });
        res.on("end", () => {
          client.unbind(() => {});
          client.destroy();
          finish(match);
        });
      });
    });
  });
}

module.exports = { lookupStaffByNumber, isConfigured };
