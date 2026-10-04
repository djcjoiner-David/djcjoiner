// PR #35: saving a manual edit unlocks a LOCKED entry in the person's other
// slot that day even when it belongs to a DIFFERENT job/item, and that
// sibling then yields to the typed value. Pre-fix only a same-item sibling
// was unlocked, so the other job's stale locked value stayed put.
import { launch, settle, block, input, button, at, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('manual edit unlocks a different-item sibling');
const D1 = businessDayStr(2);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j2', 'Laundry', 8, 1)],
  entries: [
    entry('eA', 's1', 'i1', D1, 0, 6, { hours_locked: true }),
    entry('eB', 's1', 'i2', D1, 1, 2, { job_id: 'j2', hours_locked: true }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await (await block(page, 'Mark', D1, 1)).click();
  await input(page, 'Hours').fill('5');
  await button(page, 'Save').click();
  await settle(db, 3000);
  const a = at(db, 's1', D1, 0)[0], b = at(db, 's1', D1, 1)[0];
  r.check('edited entry saved at 5h', Number(b.hours) === 5, b);
  r.check('other-job sibling unlocked', a && !a.hours_locked, a);
  r.check('sibling yields to the typed value (8-5=3h)', a && Number(a.hours) === 3, a);
} catch (e) { r.error(e); }
await browser.close();
r.done();
