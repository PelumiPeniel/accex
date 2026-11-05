// seed.js
// ---------------------------------------------------------------------------
// Populates a freshly-migrated, empty database with the same starting
// point the old db.json seed used to provide automatically: one Access
// Point, one department, the three demo accounts, default duration
// categories, and default settings.
//
// Safe to run once, on an empty database. Run with: npm run seed
// ---------------------------------------------------------------------------
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("./pool");
const db = require("./db");
const { newId } = require("./utils/ids");

(async () => {
  try {
    const existing = await db.getUserByUsername("sysadmin");
    if (existing) {
      console.log("Seed data already exists (sysadmin account found) — nothing to do.");
      return;
    }

    const dept = await db.createDepartment({ id: newId("dep"), name: "ICT", active: true });

    const accessPoint = await db.createAccessPoint({
      id: newId("ap"),
      name: "Server Room",
      department: dept.name,
      entryRules: db.DEFAULT_ENTRY_RULES,
      active: true
    });

    await db.createUser({
      id: newId("usr"),
      firstName: "System",
      lastName: "Administrator",
      staffNumber: "STF-00000",
      username: "sysadmin",
      passwordHash: bcrypt.hashSync("SysAdmin@123", 10),
      role: "SystemAdministrator",
      accessPointId: null,
      status: "Active",
      sessionTimerVisible: true
    });

    await db.createUser({
      id: newId("usr"),
      firstName: "Chinedu",
      lastName: "Obi",
      staffNumber: "STF-00001",
      username: "admin",
      passwordHash: bcrypt.hashSync("Admin@123", 10),
      role: "Administrator",
      accessPointId: accessPoint.id,
      status: "Active",
      sessionTimerVisible: true
    });

    await db.createUser({
      id: newId("usr"),
      firstName: "Ada",
      lastName: "Okafor",
      staffNumber: "STF-00002",
      username: "aofficer",
      passwordHash: bcrypt.hashSync("Officer@123", 10),
      role: "AccessOfficer",
      accessPointId: accessPoint.id,
      status: "Active",
      sessionTimerVisible: true
    });

    await db.replaceDurationCategories([
      { id: newId("dur"), label: "Within 1 hour", minutes: 60 },
      { id: newId("dur"), label: "1-3 hours", minutes: 180 },
      { id: newId("dur"), label: "3+ hours", minutes: 480 }
    ]);

    await db.setSettings({
      organizationName: "Nahco Aviance",
      sessionTimeoutMinutes: 15,
      sessionWarningSeconds: 60,
      maxFailedLogins: 5,
      loginLockoutMinutes: 5,
      passwordMinLength: 8,
      activeDirectoryEnabled: false
    });

    console.log("Seed complete:");
    console.log("  System Administrator — sysadmin / SysAdmin@123");
    console.log("  Administrator        — admin / Admin@123");
    console.log("  Access Officer       — aofficer / Officer@123");
    console.log(`  Access Point: ${accessPoint.name} (${dept.name})`);
  } catch (err) {
    console.error("Seeding failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
