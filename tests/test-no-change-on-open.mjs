// TESTING_NOTES 2E #10 (fix B):
// 1. Opening (or refreshing) the app never changes any saved hours.
//    Pre-fix, Batch 6's grow-back rule rewrote correct data on open:
//    - Mary 8h + TJ 3.5h sharing an item's day (TJ created first) got
//      swapped to TJ 8h + Mary 3.5h;
//    - a correctly-zeroed 0h entry grew to 8h ("over-run", item over budget);
//    - a staff member's lowered hours rewrote their entries on reopen.
// 2. After a real grid action, those same entries still aren't swapped or
//    grown past the item's budget - but a genuinely-too-big entry still
//    shrinks (Batch 6 rule 2 keeps working).
import { launch, settle, cell, block, drag, button, rows, itemTotal, cellText, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('opening the app changes nothing; grow-back never swaps or overruns');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mary', 8, 0), staff('s2', 'TJ', 8, 1), staff('s3', 'Mark', 8, 2), staff('s4', 'Ian', 8, 3), staff('s5', 'David', 6, 4), staff('s6', 'Jeff', 8, 5)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Living W', 11.5), item('i2', 'j1', 'Kitchen', 8, 1), item('i3', 'j1', 'Pantry', 10, 2), item('i4', 'j1', 'Laundry', 8, 3)],
  entries: [
    entry('t1', 's2', 'i1', D(2), 0, 3.5), entry('m1', 's1', 'i1', D(2), 0, 8),   // TJ created first
    entry('k1', 's3', 'i2', D(3), 0, 8), entry('k2', 's4', 'i2', D(3), 0, 0),     // Ian correctly 0h
    entry('d1', 's5', 'i3', D(5), 0, 7), entry('d2', 's5', 'i3', D(6), 0, 3),     // David's cap lowered to 6 after scheduling
    entry('x1', 's6', 'i4', D(8), 0, 8),                                         // unrelated, used as the grid action
  ],
};
const { browser, page, db } = await launch(seed);
const writes = () => db.log.filter(l => l.method !== 'GET').map(l => [l.method, l.params.id, l.body]);
const h = id => Number(rows(db, e => e.id === id)[0]?.hours);
try {
  await settle(db, 3000);
  r.check('opening: no saves at all', writes().length === 0, writes());
  const ian = await cellText(page, 'Ian', D(3), 0);
  r.check('opening: Ian\'s entry shows 0h, not over-run', /·\s*0h/.test(ian), ian);
  await page.reload(); await page.waitForSelector('text=Today'); await settle(db, 3000);
  r.check('reopening: still no saves', writes().length === 0, writes());
  await button(page, '↻ Refresh').click();
  await settle(db, 2000);
  r.check('Refresh: still no saves', writes().length === 0, writes());
  // A real grid action elsewhere now runs the background check.
  await drag(page, db, await block(page, 'Jeff', D(8), 0), await cell(page, 'Jeff', D(9), 0));
  await settle(db, 3000);
  r.check('after a grid action: Mary/TJ NOT swapped', h('m1') === 8 && h('t1') === 3.5, rows(db, e => e.sub_item_id === 'i1'));
  r.check('after a grid action: Living W still 11.5h', itemTotal(db, 'i1') === 11.5);
  r.check('after a grid action: Ian still 0h (Kitchen not over budget)', h('k2') === 0 && itemTotal(db, 'i2') === 8, rows(db, e => e.sub_item_id === 'i2'));
  r.check('after a grid action: David\'s too-big 7h day shrinks to his 6h', h('d1') === 6, rows(db, e => e.sub_item_id === 'i3'));
  r.check('after a grid action: Pantry still totals 10h', itemTotal(db, 'i3') === 10, rows(db, e => e.sub_item_id === 'i3'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
