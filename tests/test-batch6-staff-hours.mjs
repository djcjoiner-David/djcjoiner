// PR #57 (Batch 6, 2E #6):
// Rule 1 - editing a staff member's daily hours, up or down, changes
//   NOTHING already on the grid (pre-fix it PATCHed entries down, and never
//   back up - even on other staff's entries in a shared item).
// Rule 2 - once some OTHER grid action triggers the background pass, it
//   uses current staff hours and gets it right both ways: a sole
//   non-final entry shrinks to the new cap and grows back when raised.
import { launch, settle, cell, block, drag, button, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Batch 6: staff hours edits are not retroactive; later grid actions recalc both ways');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'David', 7, 0), staff('s2', 'Mark', 8, 1), staff('s3', 'Ian', 8, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 10), item('i2', 'j1', 'Pantry', 15, 1), item('i3', 'j1', 'Laundry', 8, 2)],
  entries: [
    entry('d2', 's1', 'i1', D(2), 0, 7), entry('d3', 's1', 'i1', D(3), 0, 3),     // David solo on Kitchen
    entry('p1', 's1', 'i2', D(5), 0, 7), entry('p2', 's2', 'i2', D(5), 0, 8),     // Pantry shared David+Mark
    entry('l1', 's3', 'i3', D(7), 0, 8),                                          // unrelated, used as the trigger
  ],
};
const { browser, page, db } = await launch(seed);
const h = id => Number(rows(db, e => e.id === id)[0]?.hours);
const entryWrites = () => db.log.filter(l => l.t === 'entries' && l.method !== 'GET').length;
async function setCap(name, v) {
  const row = page.locator('table tbody tr', { has: page.locator(`td div:text-is("${name}")`) }).first();
  await row.locator('button', { hasText: /^Edit$/ }).click();
  await page.locator('input[type="range"]').fill(String(v));
  await button(page, 'Save').click();
  await settle(db, 2500);
}
try {
  await settle(db, 2500);
  const w0 = entryWrites();
  await setCap('David', 6);
  r.check('rule 1: lowering David 7h->6h writes no entries', entryWrites() === w0, db.log.slice(-5));
  r.check('rule 1: David\'s and Mark\'s hours untouched', h('d2') === 7 && h('p1') === 7 && h('p2') === 8);
  await setCap('David', 7);
  await setCap('David', 6);
  r.check('rule 1: raising/lowering again still writes nothing', entryWrites() === w0);
  // Rule 2: an unrelated grid action triggers the pass with David at 6h.
  await drag(page, db, await block(page, 'Ian', D(7), 0), await cell(page, 'Ian', D(8), 0));
  await settle(db, 3000);
  r.check('rule 2: after a grid action, David\'s solo day shrinks to 6h', h('d2') === 6, rows(db, e => e.sub_item_id === 'i1'));
  r.check('rule 2: his final Kitchen day takes up the slack (4h)', h('d3') === 4, rows(db, e => e.sub_item_id === 'i1'));
  await setCap('David', 7);
  r.check('rule 1 again: raising alone writes nothing', h('d2') === 6);
  await drag(page, db, await block(page, 'Ian', D(8), 0), await cell(page, 'Ian', D(9), 0));
  await settle(db, 3000);
  r.check('rule 2: after the next grid action it grows back to 7h', h('d2') === 7, rows(db, e => e.sub_item_id === 'i1'));
  r.check('rule 2: final day back to 3h', h('d3') === 3, rows(db, e => e.sub_item_id === 'i1'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
