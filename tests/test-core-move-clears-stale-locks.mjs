// Core (commit 68e91e2): a move touching an item clears every lock in that
// item and re-settles the whole item to its budget - a later locked day
// can't keep reserving its hours while the rest is redistributed around it.
import { launch, settle, cell, block, drag, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: a move clears stale locks in the item');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Jenny', 6, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 24)],
  entries: [entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's1', 'i1', D(3), 0, 8), entry('k3', 's1', 'i1', D(4), 0, 8, { hours_locked: true })],
};
const { browser, page, db } = await launch(seed);
try {
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Jenny', D(2), 0), { dispatch: true });
  await settle(db, 3000);
  r.check('the later locked day is unlocked', rows(db, e => e.id === 'k3')[0]?.hours_locked === false, rows(db, e => e.id === 'k3'));
  r.check('item still totals exactly 24h', itemTotal(db, 'i1') === 24, rows(db, e => e.sub_item_id === 'i1'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
