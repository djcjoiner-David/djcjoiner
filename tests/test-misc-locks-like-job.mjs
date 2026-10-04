// PRs #37/#38: a Misc entry's manually saved hours stick (it locks like a
// job entry) - pre-#37 the background pass reclamped it straight back down
// moments after saving. AND it still yields when the OTHER slot is edited
// afterwards - #37's first attempt exempted Misc entirely, which broke that.
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
  // 1. edit the Misc entry to 5h
  await (await block(page, 'Mark', D1, 1)).click();
  await input(page, 'Hours').fill('5');
  await button(page, 'Save').click();
  await settle(db, 3000);
  let m = at(db, 's1', D1, 1)[0];
  r.check('Misc entry saved at 5h and still 5h after background pass', m && Number(m.hours) === 5, m);
  r.check('Misc entry is locked', m && m.hours_locked === true, m);
  // 2. now edit the job entry in the other slot to 7h -> Misc should yield to 1h
  await (await block(page, 'Mark', D1, 0)).click();
  await input(page, 'Hours').fill('7');
  await button(page, 'Save').click();
  await settle(db, 3000);
  const k = at(db, 's1', D1, 0)[0];
  m = at(db, 's1', D1, 1)[0];
  r.check('job entry saved at 7h', k && Number(k.hours) === 7, k);
  r.check('Misc sibling unlocked and shrunk to fit (1h)', m && !m.hours_locked && Number(m.hours) === 1, m);
} catch (e) { r.error(e); }
await browser.close();
r.done();
