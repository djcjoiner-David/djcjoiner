import { neon } from '@neondatabase/serverless';

// Every real column name in your schema, per table. Anything not listed here
// is rejected before it ever reaches SQL - this is what closes the injection
// hole on `order=` and on filter keys, since previously those were pasted
// straight into the query string with no validation at all.
const ALLOWED_COLUMNS = {
  staff:          ['id', 'name', 'productive_hours', 'created_at'],
  jobs:           ['id', 'job_no', 'name', 'bg_color', 'border_color', 'text_color', 'created_at'],
  sub_items:      ['id', 'job_id', 'name', 'total_hours', 'created_at'],
  entries:        ['id', 'staff_id', 'job_id', 'sub_item_id', 'date_str', 'slot', 'hours', 'misc_note', 'created_at'],
  user_roles:     ['id', 'email', 'role', 'name', 'password', 'created_at'],
  keepalive_ping: ['id', 'pinged_at'],
};
const ALLOWED_TABLES = Object.keys(ALLOWED_COLUMNS);

export default async function handler(req, res) {
  const provided = req.headers['x-api-key'];
  if (!process.env.API_SECRET || provided !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { table, order, ...filters } = req.query;
  if (!ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: 'Invalid table' });
  }
  const validColumns = ALLOWED_COLUMNS[table];
  const sql = neon(process.env.DATABASE_URL);

  function buildConditions(filterObj, paramsArr) {
    const conditions = [];
    for (const [key, val] of Object.entries(filterObj)) {
      if (!validColumns.includes(key)) {
        throw new Error(`Invalid filter column: ${key}`);
      }
      if (typeof val === 'string' && val.startsWith('eq.')) {
        paramsArr.push(val.slice(3));
        conditions.push(`${key} = $${paramsArr.length}`);
      } else if (typeof val === 'string' && val.startsWith('in.(') && val.endsWith(')')) {
        const items = val.slice(4, -1).split(',').filter(Boolean);
        const placeholders = items.map(v => { paramsArr.push(v); return `$${paramsArr.length}`; });
        conditions.push(`${key} in (${placeholders.join(',')})`);
      } else {
        throw new Error(`Invalid filter value for ${key}`);
      }
    }
    return conditions;
  }

  function buildOrderClause(orderParam) {
    if (!orderParam) return '';
    const [col, dir] = orderParam.split('.');
    if (!validColumns.includes(col)) throw new Error('Invalid order column');
    const safeDir = dir === 'desc' ? 'desc' : 'asc';
    return ` order by ${col} ${safeDir}`;
  }

  try {
    if (req.method === 'GET') {
      const params = [];
      const conditions = buildConditions(filters, params);
      let query = `select * from ${table}`;
      if (conditions.length) query += ' where ' + conditions.join(' and ');
      query += buildOrderClause(order);
      const rows = await sql(query, params);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const rowsIn = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row);
        for (const c of cols) {
          if (!validColumns.includes(c)) return res.status(400).json({ error: `Invalid column: ${c}` });
        }
        const vals = Object.values(row);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
        const q = `insert into ${table} (${cols.join(',')}) values (${placeholders}) returning *`;
        const r = await sql(q, vals);
        results.push(r[0]);
      }
      return res.status(200).json(results);
    }

    if (req.method === 'PATCH') {
      const cols = Object.keys(req.body);
      for (const c of cols) {
        if (!validColumns.includes(c)) return res.status(400).json({ error: `Invalid column: ${c}` });
      }
      const vals = Object.values(req.body);
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(',');
      const params = [...vals];
      const conditions = buildConditions(filters, params);
      if (conditions.length === 0) {
        return res.status(400).json({ error: 'Refusing to run an unconditioned update - at least one filter is required.' });
      }
      const q = `update ${table} set ${setClause} where ${conditions.join(' and ')} returning *`;
      const rows = await sql(q, params);
      return res.status(200).json(rows);
    }

    if (req.method === 'DELETE') {
      const params = [];
      const conditions = buildConditions(filters, params);
      if (conditions.length === 0) {
        return res.status(400).json({ error: 'Refusing to run an unconditioned delete - at least one filter is required.' });
      }
      const q = `delete from ${table} where ${conditions.join(' and ')} returning *`;
      const rows = await sql(q, params);
      return res.status(200).json(rows);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
