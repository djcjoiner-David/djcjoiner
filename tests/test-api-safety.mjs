// The server's safety checks (api/db.js), run against a pretend database
// (fixtures/neon-mock.mjs) - no real data, no browser. Covers: the API key,
// signed sessions (commit d05f587 - no forging), role rules (staff are
// view-only, only admins touch users/branding), refusing an update/delete
// with no filter (no "change every row"), rejecting unknown columns
// (no SQL injection via filters/order), values always passed as parameters,
// passwords always stored hashed and never sent back, and database errors
// never leaking internal details.
import { register } from 'node:module';
import { createHmac } from 'node:crypto';
import { reporter } from './harness.mjs';

const mockUrl = new URL('./fixtures/neon-mock.mjs', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === '@neondatabase/serverless' ? { url: ${JSON.stringify(mockUrl)}, shortCircuit: true } : n(s, c); }`));
process.env.API_SECRET = 'test-key'; process.env.SESSION_SECRET = 'server-only-secret'; process.env.DATABASE_URL = 'postgres://mock';
const neonState = globalThis.__neon = { calls: [], role: 'admin', rows: [], fail: null };
const { default: handler } = await import(process.env.API_FILE || '../api/db.js');

const r = reporter('server safety checks (api/db.js)');
function token(id, { secret = 'server-only-secret', exp = Date.now() + 3600e3 } = {}) {
  const body = Buffer.from(JSON.stringify({ id, exp })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
// One pretend user per role: the server remembers a user's role for a
// minute (TESTING_NOTES 2F #13), so switching one user's role between
// checks would test the memory, not the rule.
async function call(method, query, { body, key = 'test-key', role = 'admin', session = token('u-' + role), rows = [], fail = null } = {}) {
  Object.assign(neonState, { calls: [], role, rows, fail });
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, query, body, headers: { 'x-api-key': key, ...(session ? { 'x-session-token': session } : {}) } }, res);
  return { code: res.code, body: res.body, sql: neonState.calls.filter(c => !/^select role from user_roles/.test(c.query)) };
}
try {
  r.check('wrong API key -> 401', (await call('GET', { table: 'entries' }, { key: 'nope' })).code === 401);
  r.check('unknown table -> 400', (await call('GET', { table: 'secrets' })).code === 400);
  r.check('no session -> 401', (await call('GET', { table: 'entries' }, { session: null })).code === 401);
  r.check('forged session (wrong signing key) -> 401', (await call('GET', { table: 'entries' }, { session: token('u1', { secret: 'test-key' }) })).code === 401);
  r.check('expired session -> 401', (await call('GET', { table: 'entries' }, { session: token('u1', { exp: Date.now() - 1000 }) })).code === 401);
  r.check('removed account (no role row) -> 401', (await call('GET', { table: 'entries' }, { role: null })).code === 401);
  r.check('staff can read entries', (await call('GET', { table: 'entries' }, { role: 'staff' })).code === 200);
  const staffWrite = await call('POST', { table: 'entries' }, { role: 'staff', body: [{ hours: 1 }] });
  r.check('staff cannot create entries -> 403, nothing written', staffWrite.code === 403 && staffWrite.sql.length === 0);
  r.check('manager cannot read users -> 403', (await call('GET', { table: 'user_roles' }, { role: 'manager' })).code === 403);
  r.check('manager cannot change branding -> 403', (await call('PATCH', { table: 'app_settings', id: 'eq.1' }, { role: 'manager', body: { theme: 'x' } })).code === 403);
  r.check('branding readable without signing in (login screen)', (await call('GET', { table: 'app_settings' }, { session: null })).code === 200);
  const del = await call('DELETE', { table: 'entries' });
  r.check('DELETE with no filter refused, nothing deleted', del.code === 400 && !del.sql.some(c => /^delete/.test(c.query)));
  const upd = await call('PATCH', { table: 'entries' }, { body: { hours: 0 } });
  r.check('PATCH with no filter refused, nothing updated', upd.code === 400 && !upd.sql.some(c => /^update/.test(c.query)));
  const badCol = await call('DELETE', { table: 'entries', 'id;drop table entries': 'eq.1' });
  r.check('unknown filter column refused, no SQL run', badCol.code === 400 && badCol.sql.length === 0);
  r.check('unknown order column refused', (await call('GET', { table: 'entries', order: 'id;drop table entries' })).code === 400);
  const inj = await call('GET', { table: 'entries', id: "eq.1' or '1'='1" });
  r.check('filter values passed as parameters, never pasted into SQL', inj.sql[0] && !inj.sql[0].query.includes("'1'='1") && inj.sql[0].params.includes("1' or '1'='1"), inj.sql);
  const pw = await call('PATCH', { table: 'user_roles', id: 'eq.u2' }, { body: { password: 'Secret123' } });
  r.check('password reset stored hashed, never as typed', pw.sql[0] && pw.sql[0].params.some(p => String(p).startsWith('scrypt$')) && !pw.sql[0].params.includes('Secret123'), pw.sql);
  const add = await call('POST', { table: 'user_roles' }, { body: [{ email: 'a@b', role: 'staff', name: 'A', password: 'Secret123' }] });
  r.check('new user password stored hashed', add.sql[0] && add.sql[0].params.some(p => String(p).startsWith('scrypt$')) && !add.sql[0].params.includes('Secret123'), add.sql);
  r.check('...and the hash is never sent back', add.body && !JSON.stringify(add.body).includes('scrypt$') && !('password' in add.body[0]), add.body);
  const list = await call('GET', { table: 'user_roles' }, { rows: [{ id: 'u2', email: 'a@b', password: 'scrypt$x$y', failed_login_count: 2, locked_until: null }] });
  r.check('user list never includes passwords or lockout details', !('password' in list.body[0]) && !('failed_login_count' in list.body[0]), list.body);
  const boom = await call('GET', { table: 'entries' }, { fail: 'relation "internal_secret_table" does not exist' });
  r.check('database errors never leak internal details', boom.code >= 500 && !JSON.stringify(boom.body).includes('internal_secret_table'), boom.body);
} catch (e) { r.error(e); }
// Role memory (2F #13): a second click by the same person doesn't re-check
// their role; any change to users makes the next click re-check it.
{
  const roleQueries = () => neonState.calls.filter(c => /^select role from user_roles/.test(c.query)).length;
  const me = token('u-memory');
  await call('GET', { table: 'entries' }, { session: me, role: 'manager' });
  r.check('first click checks the role', roleQueries() === 1);
  await call('GET', { table: 'entries' }, { session: me, role: 'manager' });
  r.check('next click within a minute does not', roleQueries() === 0);
  await call('PATCH', { table: 'user_roles', id: 'eq.u9' }, { body: { role: 'staff' }, role: 'admin' });
  await call('GET', { table: 'entries' }, { session: me, role: 'manager' });
  r.check('after a change to users, the role is checked again', roleQueries() === 1);
}
r.done();
