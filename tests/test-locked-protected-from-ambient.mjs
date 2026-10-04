// PR #30 extra fix (2B #3): the background correction pass must never
// change a LOCKED entry's hours - including when it lost the same-day
// scheduling-order tie-break to a different job's entry. Pre-fix, a locked
// 4h correction was silently forced back down to 0h moments after loading.
import { launch, settle, at, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('locked entry is untouched by the background pass');
const D1 = businessDayStr(2);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j2', 'Laundry', 8, 1)],
  entries: [
    entry('eL', 's1', 'i2', D1, 1, 8, { job_id: 'j2' }),
    entry('eK', 's1', 'i1', D1, 0, 4, { hours_locked: true }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await settle(db, 3000);
  const k = at(db, 's1', D1, 0)[0];
  r.check('locked 4h entry still 4h', k && Number(k.hours) === 4, k);
  r.check('no PATCH was sent for the locked entry', !db.log.some(l => l.method === 'PATCH' && l.params.id === 'eq.eK'), db.log.filter(l => l.method !== 'GET'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
