// asyncHandler.js
// ---------------------------------------------------------------------------
// Express 4 (what this project uses) does not automatically catch errors
// thrown inside an `async` route handler — a database call that fails
// would otherwise leave the request hanging forever instead of returning
// a clean error. This wrapper catches that and forwards it to the
// centralized error handler in index.js. Every route below is wrapped in
// this, once, rather than every handler needing its own try/catch purely
// for "what if the database call itself fails."
// ---------------------------------------------------------------------------
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
