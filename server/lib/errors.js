/** Small HTTP error factory helpers used across routes. */
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function badRequest(message) {
  return httpError(400, message);
}

function notFound(message = 'not found') {
  return httpError(404, message);
}

module.exports = { httpError, badRequest, notFound };