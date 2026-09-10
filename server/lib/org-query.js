/**
 * Organization-aware database query helpers
 * Automatically adds org_id filtering to prevent data leaks between organizations
 */

const db = require('../db');

/**
 * Query with automatic org_id filtering
 * @param {string} sql - SQL query with placeholders
 * @param {Array} params - Query parameters
 * @param {string} orgId - Organization ID to filter by
 * @param {Object} options - Options for query behavior
 * @returns {Promise<Object>} Query result
 */
async function orgQuery(sql, params, orgId, options = {}) {
  if (!orgId) {
    throw new Error('Organization ID is required for org-scoped queries');
  }

  // Add org_id to WHERE clause if not already present
  let modifiedSql = sql;
  const modifiedParams = [...params];

  // Check if query already has WHERE clause
  const hasWhere = /\bWHERE\b/i.test(sql);
  
  // Check if org_id is already in the query
  const hasOrgId = /\borg_id\s*=/i.test(sql);

  if (!hasOrgId && !options.skipOrgFilter) {
    if (hasWhere) {
      // Add AND org_id = $N
      modifiedSql = sql.replace(
        /\bWHERE\b/i,
        `WHERE org_id = $${params.length + 1} AND`
      );
    } else {
      // Find the position to insert WHERE clause
      // Look for ORDER BY, LIMIT, or end of query
      const insertRegex = /(\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/i;
      modifiedSql = sql.replace(
        insertRegex,
        ` WHERE org_id = $${params.length + 1}$1`
      );
    }
    modifiedParams.push(orgId);
  }

  return db.query(modifiedSql, modifiedParams);
}

/**
 * Select query with org filtering
 */
async function select(table, conditions, orgId, options = {}) {
  const fields = options.fields || '*';
  const orderBy = options.orderBy || '';
  const limit = options.limit ? `LIMIT ${options.limit}` : '';
  const offset = options.offset ? `OFFSET ${options.offset}` : '';

  let whereClause = 'WHERE org_id = $1';
  const params = [orgId];
  let paramIndex = 2;

  if (conditions && Object.keys(conditions).length > 0) {
    whereClause += ' AND ';
    const conditionParts = [];
    
    for (const [key, value] of Object.entries(conditions)) {
      if (value === null) {
        conditionParts.push(`${key} IS NULL`);
      } else {
        conditionParts.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }
    
    whereClause += conditionParts.join(' AND ');
  }

  const sql = `SELECT ${fields} FROM ${table} ${whereClause} ${orderBy} ${limit} ${offset}`.trim();
  return db.query(sql, params);
}

/**
 * Insert query with automatic org_id
 */
async function insert(table, data, orgId) {
  if (!orgId) {
    throw new Error('Organization ID is required for insert');
  }

  const dataWithOrg = { ...data, org_id: orgId };
  const keys = Object.keys(dataWithOrg);
  const values = Object.values(dataWithOrg);
  
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.join(', ');
  
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
  
  return db.query(sql, values);
}

/**
 * Update query with org_id verification
 */
async function update(table, id, data, orgId) {
  if (!orgId) {
    throw new Error('Organization ID is required for update');
  }

  const keys = Object.keys(data);
  const values = Object.values(data);
  
  const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
  const sql = `UPDATE ${table} SET ${setClauses} WHERE id = $${keys.length + 1} AND org_id = $${keys.length + 2} RETURNING *`;
  
  return db.query(sql, [...values, id, orgId]);
}

/**
 * Delete query with org_id verification
 */
async function deleteRow(table, id, orgId) {
  if (!orgId) {
    throw new Error('Organization ID is required for delete');
  }

  const sql = `DELETE FROM ${table} WHERE id = $1 AND org_id = $2 RETURNING *`;
  return db.query(sql, [id, orgId]);
}

/**
 * Count query with org filtering
 */
async function count(table, conditions, orgId) {
  const result = await select(table, conditions, orgId, { fields: 'COUNT(*) as count' });
  return parseInt(result.rows[0]?.count || 0);
}

/**
 * Find one record with org filtering
 */
async function findOne(table, conditions, orgId) {
  const result = await select(table, conditions, orgId, { limit: 1 });
  return result.rows[0] || null;
}

/**
 * Find by ID with org verification
 */
async function findById(table, id, orgId) {
  return findOne(table, { id }, orgId);
}

/**
 * Check if record exists and belongs to org
 */
async function exists(table, id, orgId) {
  const record = await findById(table, id, orgId);
  return !!record;
}

module.exports = {
  orgQuery,
  select,
  insert,
  update,
  delete: deleteRow,
  count,
  findOne,
  findById,
  exists
};
