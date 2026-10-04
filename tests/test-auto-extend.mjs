// PR #31 (2A #6, 2B #4): a move or group move that lands an item on
// lower-capacity staff, leaving it short of its budget, auto-extends the
// schedule forward with the continuing staff, shows "Extended by N day(s)",
// and the extension undoes in the same single click as the move.
import { launch, settle, cell, block, drag, button, snap, eq, itemTotal, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('move-caused budget shortfall auto-extends');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1), staff('s3', 'Jenny', 6, 2), staff('s4', 'Mary', 5, 3)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16), item('i2', 'j1', 'Vanity', 16, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's1', 'i1', D(3), 0, 8),
    entry('v1', 's2', 'i2', D(6), 0, 8), entry('v2', 's2', 'i2', D(7), 0, 8),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  // 1. single move: Mark's last Kitchen day onto Jenny (6h/day) -> 2h short.
  const s0 = snap(db);
  await drag(page, db, await block(page, 'Mark', D(3), 0), await cell(page, 'Jenny', D(3), 0));
  r.check('single move: item back at its full 16h', itemTotal(db, 'i1') === 16, rows(db, e => e.sub_item_id === 'i1'));
  r.check('single move: extension placed after the last day', rows(db, e => e.sub_item_id === 'i1' && e.date_str > D(3)).length >= 1);
  r.check('single move: "Extended by" message shown', await page.locator('text=/Extended by 1 day/').count() > 0);
  await page.click('text=↩ Undo'); await settle(db);
  r.check('single move: one Undo removes move AND extension', eq(snap(db), s0), snap(db));

  // 2. group move: both Vanity days (Ian 8h) onto Mary's row (5h/day) -> 6h short.
  const g0 = snap(db);
  await button(page, 'Select').click();
  await (await block(page, 'Ian', D(6), 0)).click();
  await (await block(page, 'Ian', D(7), 0)).click();
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'Mary', D(6), 0));
  await page.keyboard.press('Escape');
  r.check('group move: item back at its full 16h', itemTotal(db, 'i2') === 16, rows(db, e => e.sub_item_id === 'i2'));
  r.check('group move: all Vanity rows now Mary', rows(db, e => e.sub_item_id === 'i2').every(e => e.staff_id === 's4'), rows(db, e => e.sub_item_id === 'i2'));
  await page.click('text=↩ Undo'); await settle(db);
  r.check('group move: one Undo restores exactly', eq(snap(db), g0), snap(db));
} catch (e) { r.error(e); }
await browser.close();
r.done();
