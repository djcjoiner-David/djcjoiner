// PR #47: opening a New Entry in auto-fill mode on a slot whose other slot
// already uses part of the day shows the orange "Max Xh left of <name>'s
// <cap>h/day cap" hint (it was only shown for manual/misc entries).
import { launch, cell, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('auto-fill New Entry shows hours-left hint');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 3), item('i2', 'j1', 'Laundry', 20, 1)],
  entries: [entry('k1', 's1', 'i1', D(2), 0, 3)],
};
const { browser, page } = await launch(seed);
try {
  await (await cell(page, 'Mark', D(2), 1)).click();
  await page.locator('select').filter({ has: page.locator('option', { hasText: '— Select job —' }) }).selectOption('j1');
  r.check('auto-fill is on by default', await page.locator('label', { hasText: 'Auto-fill consecutive days' }).locator('input').isChecked());
  r.check('hint "Max 5h left of Mark\'s 8h/day cap" shown', await page.locator("text=/Max 5h left of Mark's 8h\\/day cap/").count() > 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
