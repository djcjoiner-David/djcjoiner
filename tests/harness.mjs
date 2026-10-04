// Shared Playwright harness for the regression tests in this folder.
//
// The app talks to its database only through /api/db. Every test swaps that
// for a stateful in-memory fake (makeDb), so every DELETE/POST/PATCH the app
// makes really "persists" and a test can check the actual stored rows, not
// just what the screen shows. No real database is ever touched.
//
// Dates are always relative to today (businessDayStr), so tests never drift
// into the past and silently stop working.

let pw;
try { pw = await import('playwright'); }
catch { pw = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs'); }
const { chromium } = pw;

export const BASE = process.env.BASE || 'http://localhost:5183';

function pad(n) { return String(n).padStart(2, '0'); }
export function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// The n-th weekday (Mon-Fri) strictly after today (n>=1). Always in the
// future, so entries on it are editable and draggable.
export function businessDay(n) {
  const d = today();
  let c = 0;
  while (c < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) c++; }
  return d;
}
export function businessDayStr(n) { return iso(businessDay(n)); }
// The n-th weekday strictly BEFORE today (n>=1) - a past, non-editable date.
export function pastBusinessDayStr(n) {
  const d = today();
  let c = 0;
  while (c < n) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) c++; }
  return iso(d);
}
export function nextSaturdayStr() { const d = businessDay(1); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); return iso(d); }

// ---- seed builders -------------------------------------------------------
export function staff(id, name, productiveHours, sortOrder) {
  return { id, name, productive_hours: productiveHours, sort_order: sortOrder };
}
export function job(id, jobNo, name, extra = {}) {
  return { id, job_no: jobNo, name, bg_color: '#FEE2E2', border_color: '#EF4444', text_color: '#991B1B', completed: false, created_at: `2026-01-01T00:00:0${id.length % 10}.000Z`, ...extra };
}
export function item(id, jobId, name, totalHours, n = 0) {
  return { id, job_id: jobId, name, total_hours: totalHours, created_at: `2026-01-02T00:00:${pad(n)}.000Z` };
}
let seedClock = 0;
export function entry(id, staffId, subItemId, dateStr, slot, hours, extra = {}) {
  seedClock++;
  return {
    id, staff_id: staffId, job_id: extra.job_id ?? 'j1', sub_item_id: subItemId, date_str: dateStr, slot, hours,
    misc_note: null, hours_locked: false, is_catch_up: false,
    created_at: new Date(Date.parse('2026-01-03T00:00:00Z') + seedClock * 1000).toISOString(), ...extra,
  };
}

// ---- fake database -------------------------------------------------------
export function makeDb(seed) {
  const tables = { staff: [], jobs: [], sub_items: [], entries: [], app_settings: [], user_roles: [], ...structuredClone(seed) };
  let nextId = 1000;
  let clock = Date.parse('2026-06-01T00:00:00Z');
  const log = [];
  const hooks = { delayMs: 0, failNext: null }; // test knobs: slow network, forced failure
  function filterRows(rows, params) {
    let out = rows;
    for (const [k, v] of Object.entries(params)) {
      if (k === 'table' || k === 'order') continue;
      if (v.startsWith('eq.')) out = out.filter(r => String(r[k]) === v.slice(3));
      else if (v.startsWith('in.(')) { const ids = v.slice(4, -1).split(','); out = out.filter(r => ids.includes(String(r[k]))); }
    }
    return out;
  }
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const params = Object.fromEntries(url.searchParams.entries());
    const t = params.table;
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    log.push({ method, t, params, body, at: Date.now() });
    if (hooks.delayMs && method !== 'GET') await new Promise(r => setTimeout(r, hooks.delayMs));
    if (hooks.failNext && hooks.failNext(method, t, params, body)) {
      hooks.failNext = null;
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'forced failure' });
    }
    const rows = tables[t] || (tables[t] = []);
    let result = [];
    if (method === 'GET') {
      result = filterRows(rows, params);
      if (params.order) result = [...result].sort((a, b) => String(a[params.order]).localeCompare(String(b[params.order])));
    } else if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      result = list.map(r => {
        clock += 1000;
        const row = { id: `id${nextId++}`, created_at: new Date(clock).toISOString(), ...r };
        rows.push(row); return row;
      });
    } else if (method === 'PATCH') {
      result = filterRows(rows, params).map(r => Object.assign(r, body));
    } else if (method === 'DELETE') {
      const del = new Set(filterRows(rows, params));
      tables[t] = rows.filter(r => !del.has(r));
      result = [...del];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  }
  return { tables, log, hooks, handle };
}

// ---- browser -------------------------------------------------------------
export async function launch(seed, { width = 1800, height = 1100, role = 'admin', weeks = 4 } = {}) {
  let browser;
  try { browser = await chromium.launch(); }
  catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const page = await browser.newPage({ viewport: { width, height } });
  const db = makeDb(seed);
  await page.route('**/api/db*', db.handle);
  await page.addInitScript(r => sessionStorage.setItem('djc_user', JSON.stringify({ email: 't@t', role: r, name: 'Tester', id: 'u1', token: 'tok' })), role);
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.goto(BASE);
  await page.waitForSelector('text=Today', { timeout: 20000 });
  // Same grid width on every code version (older versions defaulted to 2).
  if (weeks) await page.locator('button', { hasText: new RegExp(`^${weeks} Weeks$`) }).click();
  await settle(db);
  return { browser, page, db, pageErrors };
}

// Waits until the app has made no db calls for `quietMs` (its background
// correction pass included).
export async function settle(db, quietMs = 1500, maxMs = 20000) {
  const start = Date.now();
  let last = db.log.length, lastChange = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 150));
    if (db.log.length !== last) { last = db.log.length; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return;
  }
}

// The grid's <td> for a staff member / date / slot. The column comes from
// the date itself (the grid always starts on this week's Monday and shows
// Mon-Sat), never a fixed index. A staff member's Slot 2 row has no leading
// name cell, so its cells sit one to the left of Slot 1's.
export async function cell(page, staffName, dateStr, slot) {
  const t = today();
  const monday = new Date(t); monday.setDate(t.getDate() + (t.getDay() === 0 ? -6 : 1 - t.getDay()));
  const target = new Date(dateStr + 'T00:00:00');
  const days = Math.round((target - monday) / 86400000);
  if (days < 0 || target.getDay() === 0) throw new Error(`date not on grid: ${dateStr}`);
  const col = Math.floor(days / 7) * 6 + (days % 7); // 0-based day column
  const ri = await page.evaluate(name => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    return rows.findIndex(r => r.children[0] && r.children[0].rowSpan === 2 && r.children[0].innerText.trim().split('\n').some(l => l.trim() === name));
  }, staffName);
  if (ri < 0) throw new Error(`staff row not found: ${staffName}`);
  const row = page.locator('table tbody tr').nth(slot === 0 ? ri : ri + 1);
  return row.locator(':scope > td').nth(slot === 0 ? col + 1 : col);
}
export async function block(page, staffName, dateStr, slot, hasText) {
  const c = await cell(page, staffName, dateStr, slot);
  return hasText ? c.locator('div[draggable]', { hasText }).first() : c.locator('div[draggable]').first();
}
export async function drag(page, db, from, to, { copy = false } = {}) {
  if (copy) {
    // Playwright's dragTo can't hold Ctrl, so fire the HTML5 events directly.
    const src = await from.elementHandle();
    const dst = await to.elementHandle();
    await page.evaluate(([s, d]) => {
      const dt = new DataTransfer();
      s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ctrlKey: true }));
      d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ctrlKey: true }));
      s.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    }, [src, dst]);
  } else {
    await from.dragTo(to);
  }
  await settle(db);
}

// Text of the visible block in a cell (for label checks).
export async function cellText(page, staffName, dateStr, slot) {
  return (await (await cell(page, staffName, dateStr, slot)).innerText()).replace(/\s+/g, ' ').trim();
}

// ---- DB helpers ----------------------------------------------------------
export function rows(db, pred = () => true) { return db.tables.entries.filter(pred); }
export function at(db, staffId, dateStr, slot) { return db.tables.entries.filter(e => e.staff_id === staffId && e.date_str === dateStr && e.slot === slot); }
export function snap(db) {
  return db.tables.entries.map(e => `${e.staff_id}|${e.date_str}|${e.slot}|${e.sub_item_id || ''}|${e.misc_note || ''}|${Number(e.hours)}|${e.hours_locked ? 'L' : ''}|${e.is_catch_up ? 'C' : ''}|${e.created_at}`).sort();
}
export function itemTotal(db, subItemId, { includeCatchUp = false } = {}) {
  return db.tables.entries.filter(e => e.sub_item_id === subItemId && (includeCatchUp || !e.is_catch_up)).reduce((a, e) => a + Number(e.hours), 0);
}

// ---- reporting -----------------------------------------------------------
export function reporter(name) {
  let fails = 0;
  console.log(`# ${name}`);
  return {
    check(label, cond, extra = '') {
      console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${cond ? '' : ' :: ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
      if (!cond) fails++;
    },
    error(e) { console.log('ERROR', e.stack || e.message); fails++; },
    done() { console.log(fails ? `FAILED (${fails})` : 'ALL PASS'); process.exit(fails ? 1 : 0); },
  };
}
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
// Compact "what's stored where" list, for exact before/after comparisons.
export function summarize(entries) {
  return entries.map(e => `${e.staff_id}|${e.date_str}|${e.slot}|${e.sub_item_id || e.misc_note}|${e.hours}`).sort();
}

// ---- form helpers (modal fields are a label <div> followed by the control)
export function input(page, label) { return page.locator(`div:has(> div:text-is("${label}")) > input`).last(); }
export function select(page, label) { return page.locator(`div:has(> div:text-is("${label}")) > select`).last(); }
export function button(page, text) { return page.locator('button', { hasText: text instanceof RegExp ? text : new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).last(); }
// Opens a new-entry modal on an empty cell and fills job/item.
export async function newEntry(page, staffName, dateStr, slot, { jobId = 'j1', itemId, autoFill = true } = {}) {
  await (await cell(page, staffName, dateStr, slot)).click();
  await page.locator('select').filter({ has: page.locator('option', { hasText: '— Select job —' }) }).selectOption(jobId);
  if (itemId) await select(page, 'Joinery Item').selectOption(itemId);
  const af = page.locator('label', { hasText: 'Auto-fill consecutive days' }).locator('input');
  if (await af.count()) { if (autoFill) await af.check(); else await af.uncheck(); }
}
