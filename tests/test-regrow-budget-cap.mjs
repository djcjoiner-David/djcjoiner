// TESTING_NOTES 2E #10 (fix B): Batch 6's grow-back (a sole earlier-day
// entry re-growing when its person's day gets bigger) can never push the
// item over its budget. Item 5h: Mark 4h + 1h final day; Mark's cap goes
// 4h -> 8h. Growing the first day straight to 8h would make 9h of a 5h item.
import { launch, settle, cell, block, drag, button, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('grow-back never exceeds the item budget');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Jeff', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Vanity', 5), item('i2', 'j1', 'Laundry', 8, 1)],
  entries: [
    // As saved back when Mark's day was 4h.
    entry('v1', 's1', 'i1', D(2), 0, 4), entry('v2', 's1', 'i1', D(3), 0, 1),
    entry('x1', 's2', 'i2', D(8), 0, 8),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await settle(db, 2500);
  await drag(page, db, await block(page, 'Jeff', D(8), 0), await cell(page, 'Jeff', D(9), 0));
  await settle(db, 3000);
  const v = rows(db, e => e.sub_item_id === 'i1');
  r.check('Vanity still totals exactly its 5h budget', itemTotal(db, 'i1') === 5, v);
  r.check('no single entry above the 5h budget', v.every(e => Number(e.hours) <= 5), v);
} catch (e) { r.error(e); }
await browser.close();
r.done();
