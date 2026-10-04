// Was PR #35 (the other slot yields to a manual edit). REPLACED by the
// user's rule, TESTING_NOTES 2E #15: a manual edit never shrinks the
// person's other entry. Going over their day asks first; Schedule Anyway
// keeps both - the other job's locked entry stays exactly as it was.
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
  r.check('6h + 5h = 11h of 8h: Scheduling Conflict pop-up', await page.locator('text=/Mark has 8hrs max per day/').count() > 0);
  await button(page, 'Schedule Anyway').click();
  await settle(db, 3000);
  const a = at(db, 's1', D1, 0)[0], b = at(db, 's1', D1, 1)[0];
  r.check('edited entry saved at 5h', Number(b.hours) === 5, b);
  r.check('other-job entry NOT shrunk - still 6h, still locked', a && Number(a.hours) === 6 && a.hours_locked === true, a);
} catch (e) { r.error(e); }
await browser.close();
r.done();
