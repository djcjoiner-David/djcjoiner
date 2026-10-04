// Core labels (commits 58cc7d3, d29425a, 0b4691f):
// - an entry the background pass reduced to nothing says "0h", not
//   "over-run";
// - a LOCKED entry always shows its own typed hours, never "over-run",
//   even past the point the item's budget is used up;
// - a Misc entry shows its hours on the note line ("Wash cars · 3h").
import { launch, settle, cellText, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: 0h / locked / Misc labels');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j1', 'Laundry', 10, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's2', 'i1', D(2), 0, 0),
    entry('l1', 's1', 'i2', D(4), 0, 8), entry('l2', 's2', 'i2', D(5), 0, 5, { hours_locked: true }),
    entry('m1', 's2', null, D(6), 0, 3, { job_id: null, misc_note: 'Wash cars' }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await settle(db, 2500);
  const z = await cellText(page, 'Ian', D(2), 0);
  r.check('zeroed entry says 0h', /·\s*0h/.test(z) && !/over-run/.test(z), z);
  const l = await cellText(page, 'Ian', D(5), 0);
  r.check('locked entry past budget shows its own 5h, not over-run', /·\s*5h/.test(l) && !/over-run/.test(l), l);
  const m = await cellText(page, 'Ian', D(6), 0);
  r.check('Misc entry shows "Wash cars · 3h"', /Wash cars\s*·\s*3h/.test(m), m);
} catch (e) { r.error(e); }
await browser.close();
r.done();
