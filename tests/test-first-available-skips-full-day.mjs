// PR #51: the manual (auto-fill off) "First Available" button skips a
// day/slot that's technically empty but has 0h left because the other slot
// already uses the person's whole day. Pre-fix it landed there and nothing
// typed into Hours would stick.
import { launch, cell, newEntry, button, staff, job, item, entry, iso, today, businessDayStr, reporter } from './harness.mjs';

const r = reporter('First Available skips a full day');
const D = n => businessDayStr(n);
const t = today();
const todayIsWeekday = t.getDay() !== 0 && t.getDay() !== 6;
const fullDays = [...(todayIsWeekday ? [iso(t)] : []), D(1)];
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8 * fullDays.length), item('i2', 'j1', 'Laundry', 4, 1)],
  // Mark's slot 1 is full every day up to and including D(1); slot 2 is
  // literally empty on those days but has 0h left.
  entries: fullDays.map((d, i) => entry(`k${i}`, 's1', 'i1', d, 0, 8)),
};
const { browser, page } = await launch(seed);
try {
  await newEntry(page, 'Mark', D(3), 1, { itemId: 'i2', autoFill: false });
  await button(page, 'First Available').click();
  const picked = await page.locator('input[type="date"]').inputValue();
  r.check('did not pick a full day', !fullDays.includes(picked), { picked, fullDays });
  r.check('picked the next day with room', picked === D(2), { picked, expected: D(2) });
} catch (e) { r.error(e); }
await browser.close();
r.done();
