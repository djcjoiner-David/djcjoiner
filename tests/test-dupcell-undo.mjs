// TESTING_NOTES 2E #1: a deliberately-doubled (Conflict) cell must survive
// undo/redo of an action that touches it. Seeds a genuine Conflict pair
// (A, B in the same staff/date/slot), drags B elsewhere, then Undo -> both
// back in the original cell; Redo -> B back at the destination; Undo again.
// Then undoes all the way and checks nothing was ever lost.
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
    { id: 'eA', staff_id: 's1', job_id: 'j1', sub_item_id: 'i1', date_str: D1, slot: 0, hours: 8, misc_note: null, hours_locked: true, is_catch_up: false, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'eB', staff_id: 's1', job_id: 'j1', sub_item_id: 'i2', date_str: D1, slot: 0, hours: 8, misc_note: null, hours_locked: true, is_catch_up: false, created_at: '2026-01-02T00:00:00.000Z' },
  ],
};

let fails = 0;
function check(name, cond, extra = '') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); if (!cond) fails++; }

const { browser, page, db } = await launch(seed);
try {
  await settle(db);
  const original = summarize(db.tables.entries);
  const src = await cell(page, 'Mark', D1, 0);
  check('conflict pair visible', (await src.locator('text=⚠ Conflict').count()) === 2);
  const bBlock = src.locator('div[draggable="true"]', { hasText: 'Laundry' });
  const dst = await cell(page, 'Ian', D2, 0);
  await bBlock.dragTo(dst);
  await settle(db);
  const afterMove = summarize(db.tables.entries);
  console.log('after move:', afterMove);
  check('move: B at destination', afterMove.some(s => s.startsWith(`s2|${D2}|0|i2`)));
  check('move: A still at source', afterMove.some(s => s.startsWith(`s1|${D1}|0|i1`)));

  await page.click('text=↩ Undo');
  await settle(db);
  const afterUndo = summarize(db.tables.entries);
  console.log('after undo:', afterUndo);
  check('undo: both entries restored to original cell', JSON.stringify(afterUndo) === JSON.stringify(original), JSON.stringify(afterUndo));
  check('undo: grid shows conflict pair again', (await (await cell(page, 'Mark', D1, 0)).locator('text=⚠ Conflict').count()) === 2);

  await page.click('text=↪ Redo');
  await settle(db);
  const afterRedo = summarize(db.tables.entries);
  console.log('after redo:', afterRedo);
  check('redo: matches post-move state', JSON.stringify(afterRedo) === JSON.stringify(afterMove), JSON.stringify(afterRedo));

  await page.click('text=↩ Undo');
  await settle(db);
  const afterUndo2 = summarize(db.tables.entries);
  check('undo again: original restored', JSON.stringify(afterUndo2) === JSON.stringify(original), JSON.stringify(afterUndo2));
  // created_at (scheduling order) preserved for both rows
  const cA = db.tables.entries.find(e => e.sub_item_id === 'i1')?.created_at;
  const cB = db.tables.entries.find(e => e.sub_item_id === 'i2')?.created_at;
  check('created_at order preserved', cA && cB && cA < cB, `${cA} ${cB}`);

  // Reload from the "database" to prove it's persisted, not just in memory.
  await page.reload(); await page.waitForSelector('text=↩ Undo'); await settle(db);
  check('reload: conflict pair still there', (await (await cell(page, 'Mark', D1, 0)).locator('text=⚠ Conflict').count()) === 2);
} catch (e) { console.log('ERROR', e.message); fails++; }
await browser.close();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
