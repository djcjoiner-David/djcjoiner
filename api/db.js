import { neon } from '@neondatabase/serverless';

const ALLOWED_TABLES = ['staff', 'jobs', 'sub_items', 'entries', 'user_roles'];

export default async function handler(req, res) {
  const { table, order, ...filters } = req.query;
  if (!ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  const sql = neon(process.env.DATABASE_URL);

  function buildConditions(filterObj, paramsArr) {
    const conditions = [];
    for (const [key, val] of Object.entries(filterObj)) {
      if (typeof val === 'string' && val.startsWith('eq.')) {
        paramsArr.push(val.slice(3));
        conditions.push(`${key} = $${paramsArr.length}`);
      }
    }
    return conditions;
  }

  try {
    if (req.method === 'GET') {
      const params = [];
      const conditions = buildConditions(filters, params);
      let query = `select * from ${table}`;
      if (conditions.length) query += ' where ' + conditions.join(' and ');
      if (order) query += ` order by ${order}`;
      const rows = await sql.query(query, params);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const rowsIn = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
        const q = `insert into ${table} (${cols.join(',')}) values (${placeholders}) returning *`;
        const r = await sql.query(q, vals);
        results.push(r[0]);
      }
      return res.status(200).json(results);
    }

    if (req.method === 'PATCH') {
      const cols = Object.keys(req.body);
      const vals = Object.values(req.body);
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(',');
      const params = [...vals];
      const conditions = buildConditions(filters, params);
      const q = `update ${table} set ${setClause}${conditions.length ? ' where ' + conditions.join(' and ') : ''} returning *`;
      const rows = await sql.query(q, params);
      return res.status(200).json(rows);
    }

    if (req.method === 'DELETE') {
      const params = [];
      const conditions = buildConditions(filters, params);
      const q = `delete from ${table}${conditions.length ? ' where ' + conditions.join(' and ') : ''} returning *`;
      const rows = await sql.query(q, params);
      return res.status(200).json(rows);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
