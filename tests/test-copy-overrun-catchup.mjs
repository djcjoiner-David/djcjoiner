// PR #48: copying an entry onto a fully-used item lands the copy as
// Catch-up Hours (kept, excluded from the budget) instead of "Overrun"
// that the background pass then zeroed and deleted. A single ctrl+drag
// copy auto-opens the entry modal on it; a group copy shows a notice.
import { launch, settle, cell, block, drag, button, at, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('copy onto a fully-used item lands as Catch-up');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j1', 'Laundry', 8, 1)],
  entries: [entry('k1', 's1', 'i1', D(2), 0, 8), entry('l1', 's1', 'i2', D(3), 0, 8)],
};
const { browser, page, db } = await launch(seed);
try {
  // single ctrl+drag copy
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Ian', D(4), 0), { copy: true });
  await settle(db, 3000);
  const c = at(db, 's2', D(4), 0)[0];
  r.check('single copy kept, tagged Catch-up, 8h', c && c.is_catch_up === true && Number(c.hours) === 8, c);
  r.check('original untouched', Number(at(db, 's1', D(2), 0)[0].hours) === 8);
  r.check('entry modal auto-opened on the copy', await page.locator('div:has(> div:text-is("Hours")) input').count() > 0);
  await page.keyboard.press('Escape');
  await button(page, 'Cancel').click().catch(() => {});
  // group copy of both
  await button(page, 'Select').click();
  await (await block(page, 'Mark', D(2), 0)).click();
  await (await block(page, 'Mark', D(3), 0)).click();
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Ian', D(6), 0), { copy: true });
  await settle(db, 3000);
  const g = rows(db, e => e.staff_id === 's2' && e.date_str >= D(6));
  r.check('group copy: both copies kept as Catch-up', g.length === 2 && g.every(e => e.is_catch_up), g);
  r.check('group copy: notice says how many are Catch-up', await page.locator('text=/logged as Catch-up Hours/').count() > 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
