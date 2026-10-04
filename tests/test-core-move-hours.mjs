// Core move rules (commits 02adbc9, c8eb68f):
// - an entry using its person's whole day, moved to someone with a smaller
//   day, drops to their day (7h -> 6h) - and climbs back (6h -> 7h) when
//   moved back (pre-fix it stayed stuck at 6h);
// - moved onto a day where ANOTHER person already works the same item, it
//   is NOT forced to a full day (that's a shared split, not a solo day).
import { launch, settle, cell, block, drag, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: move restores full day, but not onto a shared item day');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Craig', 7, 0), staff('s2', 'Melody', 6, 1), staff('s3', 'Ian', 4, 2), staff('s4', 'Mark', 8, 3)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 7), item('i2', 'j1', 'Pantry', 12, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 7),
    entry('p1', 's4', 'i2', D(5), 0, 8), entry('p2', 's3', 'i2', D(6), 0, 4),
  ],
};
const { browser, page, db } = await launch(seed);
const k = () => rows(db, e => e.id === 'k1')[0];
try {
  await drag(page, db, await block(page, 'Craig', D(2), 0), await cell(page, 'Melody', D(3), 0));
  r.check('7h full day -> Melody (6h/day) lands at 6h', Number(k().hours) === 6, k());
  await drag(page, db, await block(page, 'Melody', D(3), 0), await cell(page, 'Craig', D(4), 0));
  r.check('moved back to Craig climbs back to 7h', Number(k().hours) === 7, k());
  // Ian's 4h (his whole day) onto Melody on Mark's Pantry day: shared item day.
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'Melody', D(5), 0));
  const p = rows(db, e => e.id === 'p2')[0];
  r.check('onto a shared item day: not forced to Melody\'s full 6h', Number(p.hours) === 4, p);
  r.check('Pantry still totals its 12h budget', itemTotal(db, 'i2') === 12, rows(db, e => e.sub_item_id === 'i2'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
