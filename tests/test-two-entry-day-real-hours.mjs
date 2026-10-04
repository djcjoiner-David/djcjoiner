// TESTING_NOTES 2F #7 (user's request): when a person has entries in BOTH
// slots on a day, each entry shows its own real hours, not the item's total
// budget. From the live 309 Harries review: Tue - David Laundry 2h +
// Mudroom 5h, Mark Laundry 3.5h + Mudroom 3h. Mudroom used to show "14h"
// for both. A day with only one entry keeps the current display.
import { launch, settle, cellText, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('two entries on a day: both show real hours');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'David', 7, 0), staff('s2', 'Mark', 6.5, 1)],
  jobs: [job('j1', '246', 'Kerrigan'), job('j2', '309', 'Harries')],
  sub_items: [item('i1', 'j1', 'Laundry W', 19), item('i2', 'j2', 'Mudroom W', 14, 1)],
  entries: [
    entry('kd1', 's1', 'i1', D(1), 0, 7), entry('km1', 's2', 'i1', D(1), 0, 6.5),   // Mon: one entry each, full days
    entry('kd2', 's1', 'i1', D(2), 0, 2), entry('km2', 's2', 'i1', D(2), 0, 3.5),   // Tue slot 1
    entry('hd2', 's1', 'i2', D(2), 1, 5, { job_id: 'j2' }), entry('hm2', 's2', 'i2', D(2), 1, 3, { job_id: 'j2' }),   // Tue slot 2
    entry('hd3', 's1', 'i2', D(3), 1, 3, { job_id: 'j2' }), entry('hm3', 's2', 'i2', D(3), 1, 3, { job_id: 'j2' }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await settle(db, 2500);
  const david = await cellText(page, 'David', D(2), 1), mark = await cellText(page, 'Mark', D(2), 1);
  r.check('David\'s Tue Mudroom shows 5h (not 14h)', /Mudroom W\s*·\s*5h/.test(david), david);
  r.check('Mark\'s Tue Mudroom shows 3h (not 14h)', /Mudroom W\s*·\s*3h/.test(mark), mark);
  r.check('David\'s Tue Laundry shows 2h', /Laundry W\s*·\s*2h/.test(await cellText(page, 'David', D(2), 0)), await cellText(page, 'David', D(2), 0));
  r.check('Mark\'s Tue Laundry shows 3.5h', /Laundry W\s*·\s*3\.5h/.test(await cellText(page, 'Mark', D(2), 0)), await cellText(page, 'Mark', D(2), 0));
  const mon = await cellText(page, 'David', D(1), 0);
  r.check('a one-entry full day still shows the item total (19h)', /Laundry W\s*·\s*19h/.test(mon), mon);
  r.check('nothing saved (display only)', db.log.filter(l => l.method !== 'GET').length === 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
