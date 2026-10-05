// PR #30 (2A #4/#5, 2B #3): a LOCKED entry whose other slot was filled by a
// DIFFERENT job (using the person's whole day) shows "⚠ Overcommitted · Nh
// short", its edit box accepts a corrected number (it was clamped to 0),
// and the corrected number sticks (the background pass used to force it
// back down).
import { launch, settle, cell, block, input, button, at, staff, job, item, entry, businessDayStr, reporter, cellText } from './harness.mjs';

const r = reporter('cross-item overcommit: shortfall shown, manual fix possible and sticks');
const D1 = businessDayStr(2);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j2', 'Laundry', 8, 1)],
  entries: [
    // Laundry (job 202) scheduled FIRST in slot 2, using Mark's whole day.
    entry('eL', 's1', 'i2', D1, 1, 8, { job_id: 'j2' }),
    // Kitchen (job 101) scheduled after, locked at 8h in slot 1.
    entry('eK', 's1', 'i1', D1, 0, 8, { hours_locked: true }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  const txt = await cellText(page, 'Mark', D1, 0);
  r.check('locked entry flagged Overcommitted with its shortfall', /Overcommitted\s*·\s*8h short/.test(txt), txt);
  await (await block(page, 'Mark', D1, 0)).click();
  await input(page, 'Hours').fill('4');
  r.check('Hours box accepts 4 (not clamped to 0)', (await input(page, 'Hours').inputValue()) === '4', await input(page, 'Hours').inputValue());
  r.check('warns that the other slot already has hours', await page.locator('text=/^Mark has 8hrs assigned on \\w{3} \\d{2} \\w{3} leaving 0hrs available for scheduling$/').count() > 0);
  await button(page, 'Save').click();
  // 4h + Laundry's 8h is still over Mark's 8h: asks first (2E #15).
  await button(page, 'Schedule Anyway').click();
  await settle(db, 3000);
  const k = at(db, 's1', D1, 0)[0];
  r.check('corrected 4h saved and still 4h after background pass', k && Number(k.hours) === 4, k);
} catch (e) { r.error(e); }
await browser.close();
r.done();
