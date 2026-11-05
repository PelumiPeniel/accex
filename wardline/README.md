# AcceX — Restricted Access Management

A web application that supervises and logs access to an organization's restricted
areas — a server room, a warehouse, a CCTV control room, or any other sensitive
space — each modeled as its own Access Point. No visitor is ever signed in
without staff physically present, and no self-service sign-out exists.

---

## 1. Requirements

- Node.js 18+ and npm
- PostgreSQL 14+ (local install, or a free-tier managed instance —
  Render, Railway, Supabase, and Neon all work fine)

## 2. First-time setup

```bash
npm install
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env    # optional, only for non-Vite hosting
```

Create an empty database, then point `DATABASE_URL` in `server/.env` at
it (the example file shows the format). If PostgreSQL is running locally
with default settings, this is usually enough:

```bash
createdb accex
```

Then create the tables, and seed the starting data:

```bash
cd server
npm run migrate
npm run seed
cd ..
```

`npm run migrate` is safe to re-run any time — it only creates tables that
don't already exist. `npm run seed` only seeds once; running it again on a
database that already has a `sysadmin` account does nothing.

## 3. Run it

```bash
npm run dev
```

API on http://localhost:4000, web app on http://localhost:5173.

## 4. Demo accounts

Created by `npm run seed`, all tied to one Access Point ("Server Room"):

| Role | Username | Password |
|---|---|---|
| System Administrator | sysadmin | SysAdmin@123 |
| Administrator | admin | Admin@123 |
| Access Officer | aofficer | Officer@123 |

Just open http://localhost:5173 and log in with any of the above —
Access Point context comes entirely from the account, so there's no
device setup step of any kind.

To reset everything: drop and recreate the database (`dropdb accex &&
createdb accex`), then run `npm run migrate` and `npm run seed` again.

## 5. What's implemented

Roles:
- System Administrator: creates/manages Access Points (including their
  entry rules and department), creates/manages Administrator accounts and
  their Access Point assignment, controls global security settings. Has
  no Access Point of their own, by design, and never sees the day-to-day
  sign-in/monitoring screens — only oversight (Access Points,
  Administrators, Departments, Global Settings, cross-location Reports
  and Audit Trail).
- Administrator: tied to exactly one Access Point (set when their account
  is created). Manages that Access Point's Access Officer accounts, full
  visitor history/search, reports, and audit trail for their Access
  Point. Can edit the shared expected-duration categories from the
  sign-in popup's kebab menu.
- Access Officer: tied to exactly one Access Point. Signs visitors in/out,
  monitors who's on-site, extends visits, searches today's records only.

Access Points:
- Every Administrator and Access Officer account carries its own
  accessPointId, set once when the account is created by a System
  Administrator — that's the single source of truth for "which Access
  Point does this session belong to." Any staff member can log in from
  any device or browser; there's no per-device binding of any kind.
- Departments are managed entirely by System Administrator, set when an
  Access Point is created (pick existing or type new, auto-adds to the
  master list). Officer/Administrator accounts inherit their department
  automatically from their Access Point.

Sign-in:
- Popup with Staff (staff number, first/last name, department, purpose, expected
  duration, signature) and External (first/last name, company, phone, purpose,
  expected duration, signature) tabs.
- Mandatory entry-rules acceptance (Accept/Decline popup) before Sign-In
  enables. Entry rules are set per Access Point by System Administrator.
- No Session ID anywhere. Sign-out is always assisted, by a staff member.

Names:
- First name and Last name are always collected as two separate fields —
  never a single "full name" input — across every form in the app: visitor
  sign-in and every account creation/edit form. `full_name` still exists in
  the database and API responses (computed as `first_name + " " + last_name`)
  purely so existing tables, reports, and audit entries keep displaying a
  full name without any changes.
- Optional Active Directory autofill: when a staff number is entered on any
  of those forms, and "Active Directory lookup" is turned on in Global
  Settings, the server looks the number up in AD (`server/src/utils/activeDirectory.js`)
  and fills First name / Last name in automatically. The fields always stay
  editable, and a failed or unconfigured lookup never blocks account or
  visitor creation — it just leaves the fields blank for manual entry.
  Requires `AD_URL`, `AD_BASE_DN`, `AD_BIND_DN`, `AD_BIND_PASSWORD` (and
  optionally `AD_STAFF_NUMBER_ATTR`) in `server/.env`.

Monitoring:
- Live active-visitor table; a visitor who exceeds their expected duration
  quietly shows "Overdue", no alarm, no sound.
- Landing page shows "Active Visitors" always, and "Overdue" only when the
  count is 1 or more (hidden entirely at 0), in red. No visitor names are
  ever shown on the public landing page.

Capabilities — fixed per role, nothing configurable or delegable:

| Capability | Access Officer | Administrator | System Administrator |
|---|---|---|---|
| Sign visitors in/out, monitor, extend visits, today's records | Yes | Yes | Yes (acting at a selected Access Point) |
| Create/manage Access Officer accounts | No | Yes | Yes |
| Full history search, reports | No | Yes | Yes (cross-location) |
| Audit Trail (view and export) | No | No | Yes only |

There is no way to grant an account more than its role already includes —
permission groups (delegation, per-account customization) were removed
entirely in favor of this fixed mapping, kept in exactly one place on
each side (`server/src/utils/permissions.js`, mirrored in
`client/src/utils/permissions.js`) so the UI and the server can never
disagree about what someone is allowed to do.

Reports: filter by visitor type, status, date range, or keyword; export
CSV, Excel, or PDF (PDF header includes the organization logo).

Session handling: inactivity timeout with a visible countdown that pulses
when it renews (fixing the "is it frozen?" confusion), and a personal
per-account toggle (account menu, top right) to hide/show the timer.

## 6. Known gaps / next steps

- Duration categories are a single global list, not per-Access-Point. This
  was an explicit default made pending confirmation; flip this if each
  Access Point should keep its own list instead.
- Session timer visibility toggle is a personal preference, not a System
  Administrator global setting. Same situation, flagged pending
  confirmation.
- No connection pooling limits have been tuned. The default `pg` Pool
  settings are fine for the current scale; worth revisiting (max
  connections, idle timeout) before a large deployment.

**Resolved since the original build:**
- ~~Single JSON-file datastore~~ — migrated to PostgreSQL. Every route
  still goes through `server/src/db.js` and nothing else touches the
  database directly, same discipline as before, now backed by real
  transactions and indexes instead of a whole-file read/write.
- ~~Signatures not in exported reports~~ — both sign-in and sign-out
  signatures are now embedded inline in Excel and PDF exports.
- ~~Per-device Access Point binding (claiming ceremony, device tracking,
  the Access Point switcher)~~ — removed entirely by design. Access Point
  context now comes purely from the logged-in account's own
  `accessPointId`, set once when the account is created. Any staff
  member can log in from any device or browser; there's no device
  identity of any kind left in the system.

## 7. Project layout

```
accex/
  server/src/
    index.js              (Express app + route mounting)
    db.js                  (PostgreSQL data-access layer — the only file that queries the database)
    pool.js                 (the PostgreSQL connection pool + transaction helper)
    migrate.js               (creates every table; safe to re-run)
    seed.js                   (populates a fresh database with starting data)
    middleware/auth.js     (JWT auth, role guards, permission-group guards)
    utils/permissions.js   (fixed, role-based capabilities — no delegation)
    utils/activeDirectory.js (optional LDAP staff-number lookup)
    routes/                 (auth, users, accessPoints, departments,
                              visitors, settings, audit)
  client/src/
    pages/                  (one file per screen)
    components/             (Sidebar, TopBar, VisitorSignInModal, NameFields, etc.)
    context/                 (AuthContext, VisitorSignInModalContext)
    styles/                   (theme.css design tokens + global.css)
```
