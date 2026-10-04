// PRs #37/#38: a Misc entry's manually saved hours stick (it locks like a
// job entry) - pre-#37 the background pass reclamped it straight back down
// moments after saving. The second half (it used to shrink when the OTHER
// slot was edited) is REPLACED by the user's rule, TESTING_NOTES 2E #15: an
// edit that goes over the day asks first, and the Misc entry is never
// shrunk.
import { launch, settle, block, input, button, at, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Misc entry: own edit sticks, still yields to a sibling edit');
const D1 = businessDayStr(2);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 6)],
  entries: [
    entry('eK', 's1', 'i1', D1, 0, 6),
    entry('eM', 's1', null, D1, 1, 2, { job_id: null, misc_note: 'Wash cars' }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  // 1. edit the Misc entry to 1.5h (fits: 6h + 1.5h)
  await (await block(page, 'Mark', D1, 1)).click();
  await input(page, 'Hours').fill('1.5');
  await button(page, 'Save').click();
  await settle(db, 3000);
  let m = at(db, 's1', D1, 1)[0];
  r.check('Misc entry saved at 1.5h and still 1.5h after background pass', m && Number(m.hours) === 1.5, m);
  r.check('Misc entry is locked', m && m.hours_locked === true, m);
  // 2. edit the job entry to 7h -> 8.5h of 8h: asks first, Misc never shrunk
  await (await block(page, 'Mark', D1, 0)).click();
  await input(page, 'Hours').fill('7');
  await button(page, 'Save').click();
  r.check('over the day: Scheduling Conflict pop-up', await page.locator('text=/Mark has 8hrs max per day/').count() > 0);
  await button(page, 'Schedule Anyway').click();
  await settle(db, 3000);
  const k = at(db, 's1', D1, 0)[0];
  m = at(db, 's1', D1, 1)[0];
  r.check('job entry saved at 7h', k && Number(k.hours) === 7, k);
  r.check('Misc entry NOT shrunk - still 1.5h', m && Number(m.hours) === 1.5, m);
} catch (e) { r.error(e); }
await browser.close();
r.done();
