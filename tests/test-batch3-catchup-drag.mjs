// PR #54 (Batch 3, 2E #3): dragging a Catch-up entry - single drag, or a
// group move of just that one entry - keeps its own fixed hours. Pre-fix it
// was recalculated to the destination staff member's full day.
import { launch, settle, cell, block, drag, button, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Batch 3: Catch-up entry keeps its hours when moved');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Jenny', 6, 0), staff('s2', 'Mary', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Living', 6)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 6),
    // 6h = Jenny's whole day: the case that used to snap to the new
    // person's full day on a move.
    entry('c1', 's1', 'i1', D(3), 0, 6, { is_catch_up: true }),
    entry('c2', 's1', 'i1', D(6), 0, 6, { is_catch_up: true }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await drag(page, db, await block(page, 'Jenny', D(3), 0), await cell(page, 'Mary', D(4), 0));
  await settle(db, 2500);
  let c = rows(db, e => e.id === 'c1')[0];
  r.check('single drag: moved to Mary', c && c.staff_id === 's2' && c.date_str === D(4), c);
  r.check('single drag: still 6h (not Mary\'s 8h)', c && Number(c.hours) === 6, c);
  r.check('single drag: still Catch-up', c && c.is_catch_up === true, c);
  // group move of exactly one
  await button(page, 'Select').click();
  await (await block(page, 'Jenny', D(6), 0)).click();
  await drag(page, db, await block(page, 'Jenny', D(6), 0), await cell(page, 'Mary', D(7), 0));
  await page.keyboard.press('Escape');
  await settle(db, 2500);
  c = rows(db, e => e.id === 'c2')[0];
  r.check('group move of one: moved to Mary', c && c.staff_id === 's2' && c.date_str === D(7), c);
  r.check('group move of one: still 6h', c && Number(c.hours) === 6, c);
} catch (e) { r.error(e); }
await browser.close();
r.done();
