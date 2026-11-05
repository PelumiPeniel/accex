// pool.js
// ---------------------------------------------------------------------------
// The single PostgreSQL connection pool for the whole application.
//
// A "pool" keeps a small set of database connections open and reuses them,
// instead of opening a brand-new connection for every request (which is
// slow, and quickly exhausts what the database will allow). Every part of
// the server borrows a connection from here and gives it back when done.
// ---------------------------------------------------------------------------
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed database providers usually require SSL; local ones usually
  // don't. Controlled by an env var so the same code works in both.
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
});

// Small helper so route code never has to think about borrowing/returning
// connections — it just calls query() and gets rows back.
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// Runs several statements as one all-or-nothing unit: if any single one
// fails, every change made inside is rolled back automatically. This is
// the thing a JSON file fundamentally could not do, and it's what makes
// concurrent writes safe.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
