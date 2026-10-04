// Core (commit 76b9247): First Available keeps the slot you picked - with
// Slot 2 chosen and the day free, it stays on Slot 2 instead of jumping to
// Slot 1.
import { launch, newEntry, button, staff, job, item, iso, today, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: First Available respects the chosen slot');
const seed = { staff: [staff('s1', 'Mark', 8, 0)], jobs: [job('j1', '101', 'Smith')], sub_items: [item('i1', 'j1', 'Kitchen', 4)], entries: [] };
const { browser, page } = await launch(seed);
try {
  await newEntry(page, 'Mark', businessDayStr(4), 1, { itemId: 'i1', autoFill: false });
  await button(page, 'Slot 2').click();
  await button(page, 'First Available').click();
  const bg = await button(page, 'Slot 2').evaluate(el => getComputedStyle(el).backgroundColor);
  r.check('Slot 2 still selected', bg === 'rgb(59, 130, 246)', bg);
  const t = today(); const first = (t.getDay() === 0 || t.getDay() === 6) ? businessDayStr(1) : iso(t);
  r.check('picked the first free day', (await page.locator('input[type="date"]').inputValue()) === first, await page.locator('input[type="date"]').inputValue());
} catch (e) { r.error(e); }
await browser.close();
r.done();
