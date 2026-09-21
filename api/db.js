import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';

const SCRYPT_KEYLEN = 64;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, salt, hashHex] = stored.split('$');
  if (!salt || !hashHex) return false;
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  const storedHash = Buffer.from(hashHex, 'hex');
  if (hash.length !== storedHash.length) return false;
  return timingSafeEqual(hash, storedHash);
}

// user_roles.password (and the internal login-lockout bookkeeping) never
// leaves this file - every response for that table has them stripped,
// whether the row came from select/insert/update/delete.
function sanitizeRows(table, rows) {
  if (table !== 'user_roles') return rows;
  return rows.map(({ password, failed_login_count, locked_until, ...rest }) => rest);
}

// Session tokens prove *who* is making a request without the server having to
// keep any state. They're signed with API_SECRET (already a private,
// server-only value) so a client can't forge one or edit the user id inside
// it. The role itself is never trusted from the token - it's looked up fresh
// from the database on every request, so a role change or removed account
// takes effect immediately instead of waiting for the old token to expire.
// Every token also carries its own expiry, so a stolen/leaked token only
// stays usable for a limited window rather than forever.
function signSession(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + SESSION_DURATION_MS })).toString('base64url');
  const sig = createHmac('sha256', process.env.API_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = createHmac('sha256', process.env.API_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Every real column name in your schema, per table. Anything not listed here
// is rejected before it ever reaches SQL - this is what closes the injection
// hole on `order=` and on filter keys, since previously those were pasted
// straight into the query string with no validation at all.
const ALLOWED_COLUMNS = {
  staff:          ['id', 'name', 'productive_hours', 'sort_order', 'created_at'],
  jobs:           ['id', 'job_no', 'name', 'bg_color', 'border_color', 'text_color', 'completed', 'created_at'],
  sub_items:      ['id', 'job_id', 'name', 'total_hours', 'created_at'],
  entries:        ['id', 'staff_id', 'job_id', 'sub_item_id', 'date_str', 'slot', 'hours', 'misc_note', 'created_at'],
  user_roles:     ['id', 'email', 'role', 'name', 'password', 'created_at', 'failed_login_count', 'locked_until'],
  keepalive_ping: ['id', 'pinged_at'],
  app_settings:   ['id', 'theme', 'logo_data', 'company_name', 'company_tagline'],
};
const ALLOWED_TABLES = Object.keys(ALLOWED_COLUMNS);

// Thrown only for input the caller can actually fix (an unknown column/filter
// name they sent). Anything else that reaches the catch block - a real
// database error, a driver/connection failure - is an internal detail and
// must never reach the client as-is, since it can contain table/column
// names, constraint names, or fragments of the query itself.
class ClientError extends Error {}

export default async function handler(req, res) {
  // --- Authentication ---
  // Requires a matching secret on every request. Set API_SECRET in Vercel's
  // Environment Variables, and send the same value as the x-api-key header
  // from the frontend (see the App.jsx db() function).
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

  // Builds parameterized WHERE conditions. Any filter key that isn't a real
  // column for this table is rejected outright instead of silently dropped -
  // silently dropping a bad filter is exactly what let a DELETE/PATCH end up
  // with zero conditions and hit every row in the table.
  function buildConditions(filterObj, paramsArr) {
    const conditions = [];
    for (const [key, val] of Object.entries(filterObj)) {
      if (!validColumns.includes(key)) {
        throw new ClientError(`Invalid filter column: ${key}`);
      }
      if (typeof val === 'string' && val.startsWith('eq.')) {
        paramsArr.push(val.slice(3));
        conditions.push(`${key} = $${paramsArr.length}`);
      } else if (typeof val === 'string' && val.startsWith('in.(') && val.endsWith(')')) {
        const items = val.slice(4, -1).split(',').filter(Boolean);
        const placeholders = items.map(v => { paramsArr.push(v); return `$${paramsArr.length}`; });
        conditions.push(`${key} in (${placeholders.join(',')})`);
      } else {
        throw new ClientError(`Invalid filter value for ${key}`);
      }
    }
    return conditions;
  }

  // Validates `order=column` or `order=column.asc` / `order=column.desc`
  // against the real column list, instead of pasting it into the query raw.
  function buildOrderClause(orderParam) {
    if (!orderParam) return '';
    const [col, dir] = orderParam.split('.');
    if (!validColumns.includes(col)) throw new ClientError('Invalid order column');
    const safeDir = dir === 'desc' ? 'desc' : 'asc';
    return ` order by ${col} ${safeDir}`;
  }

  try {
    // Login verifies the password hash server-side and never echoes it back,
    // instead of the old approach of handing the stored password to the
    // client over GET and comparing it there.
    if (req.method === 'POST' && table === 'user_roles' && req.query.login === '1') {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
      const rows = await sql('select * from user_roles where email = $1', [String(email).toLowerCase().trim()]);
      const user = rows[0];
      if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

      // Rate limiting: after too many wrong passwords in a row, lock the
      // account out for a while instead of letting a script keep guessing
      // indefinitely. Tracked per-account (not per-IP) since that needs no
      // extra infrastructure - just two columns on the row we already load.
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const minutesLeft = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.` });
      }

      let authenticated = verifyPassword(password, user.password);
      // One-time migration: accounts created before password hashing was
      // added still have their plaintext password in this column. Verify
      // against it once, then transparently upgrade it to a hash.
      if (!authenticated && user.password === password) {
        const upgraded = hashPassword(password);
        await sql('update user_roles set password = $1 where id = $2', [upgraded, user.id]);
        user.password = upgraded;
        authenticated = true;
      }
      if (!authenticated) {
        const attempts = (user.failed_login_count || 0) + 1;
        if (attempts >= LOGIN_MAX_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60000).toISOString();
          await sql('update user_roles set failed_login_count = 0, locked_until = $1 where id = $2', [lockUntil, user.id]);
          return res.status(429).json({ error: `Too many failed attempts. Try again in ${LOGIN_LOCKOUT_MINUTES} minutes.` });
        }
        await sql('update user_roles set failed_login_count = $1 where id = $2', [attempts, user.id]);
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // A successful login clears any earlier failed attempts.
      if (user.failed_login_count || user.locked_until) {
        await sql('update user_roles set failed_login_count = 0, locked_until = null where id = $1', [user.id]);
      }

      const [safeUser] = sanitizeRows(table, [user]);
      return res.status(200).json({ ...safeUser, token: signSession({ id: user.id }) });
    }

    // --- Role enforcement ---
    // Everything below this point requires a valid session (proof of which
    // user is asking), except the keepalive ping (no user behind a scheduled
    // request) and *reading* app_settings (the colour theme and logo aren't
    // secret - the login screen itself needs to show them before anyone is
    // signed in). Writing app_settings still requires a session, checked below.
    // The role is re-read from the database on every request rather than
    // trusted from the token, so revoking/downgrading someone's role takes
    // effect on their very next click, not just their next login.
    if (table !== 'keepalive_ping' && !(table === 'app_settings' && req.method === 'GET')) {
      const session = verifySession(req.headers['x-session-token']);
      if (!session) return res.status(401).json({ error: 'Session expired - please log in again.' });
      const [sessionUser] = await sql('select role from user_roles where id = $1', [session.id]);
      if (!sessionUser) return res.status(401).json({ error: 'Session expired - please log in again.' });
      const role = sessionUser.role;

      // Only admins may read or write the user_roles table at all - it's
      // where every account's role (and password hash) lives.
      if (table === 'user_roles' && role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
      }
      // Staff accounts are view-only everywhere else: they can GET, but
      // never create/edit/delete.
      if (table !== 'user_roles' && req.method !== 'GET' && role === 'staff') {
        return res.status(403).json({ error: 'Staff accounts are view-only.' });
      }
      // The colour theme is a company-wide setting - everyone can read it
      // (so the header renders correctly for staff too), but only an admin
      // can change it. Managers are excluded here even though they can edit
      // schedule data, since branding is an admin-level decision.
      if (table === 'app_settings' && req.method !== 'GET' && role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
      }
    }

    if (req.method === 'GET') {
      const params = [];
      const conditions = buildConditions(filters, params);
      let query = `select * from ${table}`;
      if (conditions.length) query += ' where ' + conditions.join(' and ');
      query += buildOrderClause(order);
      const rows = await sql(query, params);
      return res.status(200).json(sanitizeRows(table, rows));
    }

    if (req.method === 'POST') {
      const rowsIn = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];
      for (const row of rowsIn) {
        const cols = Object.keys(row);
        for (const c of cols) {
          if (!validColumns.includes(c)) return res.status(400).json({ error: `Invalid column: ${c}` });
        }
        const vals = cols.map(c => (table === 'user_roles' && c === 'password') ? hashPassword(row[c]) : row[c]);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
        const q = `insert into ${table} (${cols.join(',')}) values (${placeholders}) returning *`;
        const r = await sql(q, vals);
        results.push(r[0]);
      }
      return res.status(200).json(sanitizeRows(table, results));
    }

    if (req.method === 'PATCH') {
      const cols = Object.keys(req.body);
      for (const c of cols) {
        if (!validColumns.includes(c)) return res.status(400).json({ error: `Invalid column: ${c}` });
      }
      const vals = cols.map(c => (table === 'user_roles' && c === 'password') ? hashPassword(req.body[c]) : req.body[c]);
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(',');
      const params = [...vals];
      const conditions = buildConditions(filters, params);
      // Hard safety backstop: never allow an update with no WHERE clause.
      // This is what stops a missing/blank id from silently becoming
      // "update every row in the table".
      if (conditions.length === 0) {
        return res.status(400).json({ error: 'Refusing to run an unconditioned update - at least one filter is required.' });
      }
      const q = `update ${table} set ${setClause} where ${conditions.join(' and ')} returning *`;
      const rows = await sql(q, params);
      return res.status(200).json(sanitizeRows(table, rows));
    }

    if (req.method === 'DELETE') {
      const params = [];
      const conditions = buildConditions(filters, params);
      // Hard safety backstop: never allow a delete with no WHERE clause.
      // This is the single most important line in this file - it's what
      // stops a missing/undefined id from silently becoming "delete
      // everything in the table" with zero warning.
      if (conditions.length === 0) {
        return res.status(400).json({ error: 'Refusing to run an unconditioned delete - at least one filter is required.' });
      }
      const q = `delete from ${table} where ${conditions.join(' and ')} returning *`;
      const rows = await sql(q, params);
      return res.status(200).json(sanitizeRows(table, rows));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (e instanceof ClientError) {
      return res.status(400).json({ error: e.message });
    }
    // Real database/driver errors can contain table names, constraint
    // names, or fragments of the query - log the detail for the developer
    // (visible in Vercel's function logs) but never send it to the client.
    console.error('api/db error:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
