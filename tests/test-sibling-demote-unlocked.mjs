// Was PR #39 (an older unlocked sibling yields to a manual edit). REPLACED
// by the user's rule, TESTING_NOTES 2E #15: a manual edit never shrinks the
// person's other entry. Going over their day asks first; Schedule Anyway
// keeps both at their hours (the older entry is locked so nothing shrinks
// it later either).
import { launch, settle, block, input, button, at, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('unlocked older sibling yields to a manual edit');
const D1 = businessDayStr(2);
const seed = {
  staff: [staff('s1', 'Jeff', 8, 0)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Harries')],
  sub_items: [item('i1', 'j1', 'Pantry', 8), item('i2', 'j2', 'Wardrobe', 8, 1)],
  entries: [
    entry('eH', 's1', 'i2', D1, 0, 8, { job_id: 'j2' }),               // older, unlocked, whole day
    entry('eP', 's1', 'i1', D1, 1, 8, { hours_locked: true }),          // newer, locked, Overcommitted
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await (await block(page, 'Jeff', D1, 1)).click();
  await input(page, 'Hours').fill('5');
  await button(page, 'Save').click();
  r.check('8h + 5h over Jeff\'s 8h: Scheduling Conflict pop-up', await page.locator('text=/Jeff has 8hrs max per day/').count() > 0);
  await button(page, 'Schedule Anyway').click();
  await settle(db, 3000);
  const h = at(db, 's1', D1, 0)[0], p = at(db, 's1', D1, 1)[0];
  r.check('edited entry saved at 5h', p && Number(p.hours) === 5, p);
  r.check('older entry NOT shrunk - still 8h', h && Number(h.hours) === 8, h);
  r.check('older entry now locked so nothing shrinks it later', h && h.hours_locked === true, h);
} catch (e) { r.error(e); }
await browser.close();
r.done();
