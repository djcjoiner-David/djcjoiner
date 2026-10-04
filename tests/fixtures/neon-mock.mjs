// Stand-in for @neondatabase/serverless used by test-api-safety.mjs: records
// every SQL call instead of touching a real database. Tests steer it through
// globalThis.__neon.
const state = globalThis.__neon || (globalThis.__neon = { calls: [], role: 'admin', rows: [], fail: null });
export function neon() {
  return async function sql(query, params = []) {
    state.calls.push({ query, params });
    if (state.fail) throw new Error(state.fail);
    if (/^select role from user_roles where id = \$1/.test(query)) return state.role ? [{ role: state.role }] : [];
    if (/^insert into/.test(query)) return [Object.fromEntries((query.match(/\(([^)]*)\)/)[1]).split(',').map((c, i) => [c, params[i]]))];
    return state.rows;
  };
}
