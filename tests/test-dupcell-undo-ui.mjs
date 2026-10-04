// TESTING_NOTES 2E #1, the exact live repro, driven through the UI: create a
// Conflict pair via the manual entry modal's "Schedule Anyway", drag the NEW
// entry elsewhere, Undo twice (drag, then the creation), Redo twice. At every
// step the DB must hold exactly the expected rows - the untouched original
// entry must never vanish or get duplicated.
import { launch, settle, cell, businessDayStr, summarize } from './harness.mjs';

const D1 = businessDayStr(2), D2 = businessDayStr(3);
const seed = {
  staff: [
    { id: 's1', name: 'Mark', productive_hours: 8, sort_order: 0 },
    { id: 's2', name: 'Ian', productive_hours: 8, sort_order: 1 },
  ],
  jobs: [{ id: 'j1', job_no: '101', name: 'Smith', bg_color: '#FEE2E2', border_color: '#EF4444', text_color: '#991B1B', completed: false, created_at: '2026-01-01' }],
  sub_items: [
    { id: 'i1', job_id: 'j1', name: 'Kitchen', total_hours: 8, created_at: '2026-01-01' },
    { id: 'i2', job_id: 'j1', name: 'Laundry', total_hours: 8, created_at: '2026-01-02' },
  ],
  entries: [
    { id: 'eA', staff_id: 's1', job_id: 'j1', sub_item_id: 'i1', date_str: D1, slot: 0, hours: 8, misc_note: null, hours_locked: false, is_catch_up: false, created_at: '2026-01-01T00:00:00.000Z' },
  ],
};

let fails = 0;
function check(name, cond, extra = '') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); if (!cond) fails++; }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, db } = await launch(seed);
try {
  await settle(db);
  const s0 = summarize(db.tables.entries);
  // Open a new entry from an empty cell, then point it at the occupied one.
  await (await cell(page, 'Mark', D2, 0)).click();
  const modal = page.locator('div', { has: page.locator('text=Auto-fill consecutive days') }).last();
  await page.locator('select').filter({ has: page.locator('option', { hasText: '— Select job —' }) }).selectOption('j1');
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Laundry' }) }).selectOption('i2');
  await page.locator('label', { hasText: 'Auto-fill consecutive days' }).locator('input').uncheck();
  await page.locator('input[type="date"]').fill(D1);
  await page.locator('button', { hasText: /^Save$/ }).click();
  await page.locator('button', { hasText: 'Schedule Anyway' }).click();
  await settle(db);
  const s1 = summarize(db.tables.entries);
  console.log('after Schedule Anyway:', s1);
  check('conflict pair created', s1.filter(s => s.startsWith(`s1|${D1}|0|`)).length === 2, JSON.stringify(s1));
  check('conflict pair visible', (await (await cell(page, 'Mark', D1, 0)).locator('text=⚠ Conflict').count()) === 2);

  const src = await cell(page, 'Mark', D1, 0);
  await src.locator('div[draggable="true"]', { hasText: 'Laundry' }).dragTo(await cell(page, 'Ian', D2, 0));
  await settle(db);
  const s2 = summarize(db.tables.entries);
  console.log('after drag:', s2);
  check('drag: Laundry moved, Kitchen stays', s2.some(s => s.startsWith(`s2|${D2}|0|i2`)) && s2.some(s => s.startsWith(`s1|${D1}|0|i1`)), JSON.stringify(s2));

  await page.click('text=↩ Undo'); await settle(db);
  const u1 = summarize(db.tables.entries);
  check('undo 1 -> conflict pair state', eq(u1, s1), JSON.stringify(u1));
  await page.click('text=↩ Undo'); await settle(db);
  const u2 = summarize(db.tables.entries);
  check('undo 2 -> original only (Kitchen kept, no duplicate)', eq(u2, s0), JSON.stringify(u2));
  check('undo 2 -> Kitchen kept its original id', db.tables.entries.some(e => e.id === 'eA'));
  await page.click('text=↪ Redo'); await settle(db);
  const r1 = summarize(db.tables.entries);
  check('redo 1 -> conflict pair state', eq(r1, s1), JSON.stringify(r1));
  await page.click('text=↪ Redo'); await settle(db);
  const r2 = summarize(db.tables.entries);
  check('redo 2 -> post-drag state', eq(r2, s2), JSON.stringify(r2));
  await page.reload(); await page.waitForSelector('text=↩ Undo'); await settle(db);
  check('reload: Kitchen + Laundry both present', summarize(db.tables.entries).length === 2);
} catch (e) { console.log('ERROR', e.message); fails++; }
await browser.close();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
