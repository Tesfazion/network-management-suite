const config = require('../config');

/**
 * Query-param pagination helpers.
 * Pagination is opt-in: omitting ?limit= returns every row
 * (backwards compatible with the current API and frontend).
 */

function parse(query) {
  const limitRaw = Number(query.limit);
  const offsetRaw = Number(query.offset);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, config.maxPageLimit)
    : null;
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  return { limit, offset };
}

/** Append a bound LIMIT/OFFSET clause when pagination is requested. */
function apply(sql, { limit, offset }, initialParams = []) {
  if (limit === null) return { sql, params: initialParams };
  const paramOffset = initialParams.length;
  return { 
    sql: `${sql} LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`, 
    params: [...initialParams, limit, offset] 
  };
}

module.exports = { parse, apply };