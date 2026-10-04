// Undo/redo regression for ordinary (one entry per cell) actions: every
// Undo must bring the DB back to exactly the snapshot before the action
// (including created_at scheduling order), every Redo exactly to the one
// after it. Covers single move, edit, delete (id churn), auto-fill create
// (multi-row), and a multi-select group move.
import { launch, settle, cell, businessDayStr } from './harness.mjs';

const D = n => businessDayStr(n);
const seed = {
  staff: [
    { id: 's1', name: 'Mark', productive_hours: 8, sort_order: 0 },
    { id: 's2', name: 'Ian', productive_hours: 7, sort_order: 1 },
    { id: 's3', name: 'Jenny', productive_hours: 6, sort_order: 2 },
  ],
  jobs: [{ id: 'j1', job_no: '101', name: 'Smith', bg_color: '#FEE2E2', border_color: '#EF4444', text_color: '#991B1B', completed: false, created_at: '2026-01-01' }],
  sub_items: [
    { id: 'i1', job_id: 'j1', name: 'Kitchen', total_hours: 16, created_at: '2026-01-01' },
    { id: 'i2', job_id: 'j1', name: 'Laundry', total_hours: 7, created_at: '2026-01-02' },
    { id: 'i3', job_id: 'j1', name: 'Vanity', total_hours: 20, created_at: '2026-01-03' },
  ],
  entries: [
    { id: 'k1', staff_id: 's1', job_id: 'j1', sub_item_id: 'i1', date_str: D(2), slot: 0, hours: 8, misc_note: null, hours_locked: false, is_catch_up: false, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'k2', staff_id: 's1', job_id: 'j1', sub_item_id: 'i1', date_str: D(3), slot: 0, hours: 8, misc_note: null, hours_locked: false, is_catch_up: false, created_at: '2026-01-01T00:00:01.000Z' },
    { id: 'l1', staff_id: 's2', job_id: 'j1', sub_item_id: 'i2', date_str: D(2), slot: 0, hours: 7, misc_note: null, hours_locked: false, is_catch_up: false, created_at: '2026-01-02T00:00:00.000Z' },
  ],
};

let fails = 0;
function check(name, cond, extra = '') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); if (!cond) fails++; }
const snap = db => db.tables.entries.map(e => `${e.staff_id}|${e.date_str}|${e.slot}|${e.sub_item_id}|${Number(e.hours)}|${e.hours_locked ? 'L' : ''}|${e.created_at}`).sort();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page, db } = await launch(seed);
async function undoRedoCycle(label, before, after) {
  await page.click('text=↩ Undo'); await settle(db);
  check(`${label}: undo exact`, eq(snap(db), before), JSON.stringify(snap(db)));
  await page.click('text=↪ Redo'); await settle(db);
  check(`${label}: redo exact`, eq(snap(db), after), JSON.stringify(snap(db)));
}
try {
  await settle(db);

  // 1. single move
  let before = snap(db);
  await (await cell(page, 'Ian', D(2), 0)).locator('div[draggable="true"]').dragTo(await cell(page, 'Jenny', D(4), 1));
  await settle(db);
  let after = snap(db);
  check('move happened', after.some(s => s.startsWith(`s3|${D(4)}|1|i2`)), JSON.stringify(after));
  await undoRedoCycle('single move', before, after);

  // 2. edit hours (manual edit -> locked)
  before = snap(db);
  await (await cell(page, 'Mark', D(3), 0)).locator('div[draggable="true"]').click();
  const hrs = page.locator('label:has-text("Hours") input, div:has(> div:text-is("Hours")) input[type="number"]').first();
  await hrs.fill('5');
  await page.locator('button', { hasText: /^Save$/ }).click();
  await settle(db);
  after = snap(db);
  check('edit happened', !eq(before, after), JSON.stringify(after));
  await undoRedoCycle('edit', before, after);

  // 3. delete via Remove (undo recreates with a new id, original created_at)
  before = snap(db);
  await (await cell(page, 'Mark', D(3), 0)).locator('div[draggable="true"]').click();
  await page.locator('button', { hasText: /^Remove$/ }).click();
  const confirm = page.locator('button', { hasText: /^(Remove|Delete|Yes.*)$/ });
  await page.waitForTimeout(300);
  if (await confirm.count() > 0 && await page.locator('text=Remove').count() > 1) await confirm.last().click().catch(() => {});
  await settle(db);
  after = snap(db);
  check('delete happened', after.length < before.length, JSON.stringify(after));
  await undoRedoCycle('delete', before, after);
  await page.click('text=↩ Undo'); await settle(db); // leave it restored
  check('delete: undo after redo exact', eq(snap(db), before), JSON.stringify(snap(db)));

  // 4. auto-fill create (multi-row)
  before = snap(db);
  await (await cell(page, 'Jenny', D(6), 0)).click();
  await page.locator('select').filter({ has: page.locator('option', { hasText: '— Select job —' }) }).selectOption('j1');
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Vanity' }) }).selectOption('i3');
  await page.locator('button', { hasText: /^Schedule \d+ days$/ }).click();
  await settle(db);
  after = snap(db);
  check('auto-fill created 4 rows', after.length - before.length === 4, JSON.stringify(after));
  await undoRedoCycle('auto-fill', before, after);

  // 5. multi-select group move (Kitchen k1 + Laundry wherever it is now)
  before = snap(db);
  await page.locator('button', { hasText: /^Select$/ }).click();
  const kCell = await cell(page, 'Mark', D(2), 0);
  await kCell.locator('div[draggable="true"]').click();
  const kCell2 = await cell(page, 'Mark', D(3), 0);
  await kCell2.locator('div[draggable="true"]').click();
  await kCell.locator('div[draggable="true"]').dragTo(await cell(page, 'Ian', D(8), 0));
  await settle(db);
  after = snap(db);
  check('group move happened', !eq(before, after) && after.some(s => s.startsWith(`s2|${D(8)}|0|i1`)), JSON.stringify(after));
  await page.keyboard.press('Escape');
  await undoRedoCycle('group move', before, after);
} catch (e) { console.log('ERROR', e.message); fails++; }
await browser.close();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
