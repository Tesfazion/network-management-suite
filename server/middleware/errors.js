function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not found' });
}

/** Map a thrown error to an HTTP response. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.message || 'error';

  if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      status = 409;
      message = 'duplicate value already exists';
    } else if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      status = 400;
      message = 'references a record that does not exist';
    } else {
      status = 409;
      message = 'constraint violated';
    }
  }

  // Never leak internals for 5xx; log to the server console instead.
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    message = 'internal server error';
  }

  res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };