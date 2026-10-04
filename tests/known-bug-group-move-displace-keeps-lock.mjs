// NOTE: the user has since decided the right behaviour is different (2E #9 /
// #12): a group move onto a LOCKED entry must show the Scheduling Conflict
// pop-up and never displace it. This test gets rewritten when that is built.
// KNOWN OPEN BUG - TESTING_NOTES 2E #9. Expected to FAIL until fixed.
// PR #42 says a group move's displaced entry keeps its lock and its hours
// exactly as they were. But performGroupMove then re-settles the displaced
// entry's own item via unlockAllLocksInItem, which clears the lock, and the
// recalculation overwrites a manually typed number (5h -> 8h here).
import { launch, settle, cell, block, drag, button, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('group move: displaced LOCKED entry keeps its lock and manual hours');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16), item('i2', 'j2', 'Laundry', 8, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's1', 'i1', D(3), 0, 8),
    entry('eL', 's2', 'i2', D(2), 0, 5, { job_id: 'j2', hours_locked: true }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await button(page, 'Select').click();
  await (await block(page, 'Mark', D(2), 0)).click();
  await (await block(page, 'Mark', D(3), 0)).click();
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Ian', D(2), 0));
  await page.keyboard.press('Escape');
  await settle(db, 3000);
  const l = rows(db, e => e.id === 'eL')[0];
  r.check('displaced entry moved to the other slot', l && l.slot === 1, l);
  r.check('displaced entry still locked', l && l.hours_locked === true, l);
  r.check('displaced entry keeps its manual 5h', l && Number(l.hours) === 5, l);
  const ianDay = rows(db, e => e.staff_id === 's2' && e.date_str === D(2)).reduce((a, e) => a + Number(e.hours), 0);
  r.check('Ian not booked past 8h that day', ianDay <= 8, rows(db, e => e.staff_id === 's2' && e.date_str === D(2)));
} catch (e) { r.error(e); }
await browser.close();
r.done();
