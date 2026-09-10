function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestId };
