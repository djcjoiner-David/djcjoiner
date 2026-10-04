// PR #39: a manual edit makes the other slot's entry yield even when that
// entry was never locked. Pre-fix an older, unlocked entry kept winning the
// same-day tie-break on its creation date and kept the whole day (the live
// "TJ Pantry/Harries" case).
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
  const hBefore = at(db, 's1', D1, 0)[0].created_at;
  await (await block(page, 'Jeff', D1, 1)).click();
  await input(page, 'Hours').fill('5');
  await button(page, 'Save').click();
  await settle(db, 3000);
  const h = at(db, 's1', D1, 0)[0], p = at(db, 's1', D1, 1)[0];
  r.check('edited entry saved at 5h', p && Number(p.hours) === 5, p);
  r.check('older unlocked sibling re-dated (now yields the tie-break)', h && h.created_at > p.created_at && h.created_at !== hBefore, { h, p });
  r.check('older sibling shrunk to the 3h left', h && Number(h.hours) === 3, h);
} catch (e) { r.error(e); }
await browser.close();
r.done();
