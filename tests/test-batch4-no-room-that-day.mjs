// PR #55 (Batch 4, 2E #7): auto-fill with an occupied START day/slot asks
// first ("⚠ No Room That Day": Schedule First Available (date) / Go Back)
// instead of silently landing somewhere later. Nothing is saved until a
// choice is made; Go Back saves nothing; First Available schedules from
// the real next open day.
import { launch, settle, newEntry, button, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Batch 4: occupied start day prompts instead of skipping');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j1', 'Laundry', 16, 1)],
  entries: [entry('k1', 's1', 'i1', D(3), 0, 8)],
};
const { browser, page, db } = await launch(seed);
const posts = () => db.log.filter(l => l.method === 'POST' && l.t === 'entries').length;
try {
  await newEntry(page, 'Mark', D(6), 0, { itemId: 'i2', autoFill: true });
  await page.locator('input[type="date"]').fill(D(3));
  await button(page, /^Schedule \d+ days?$/).click();
  r.check('"No Room That Day" prompt shown', await page.locator('text=No Room That Day').count() > 0);
  r.check('nothing saved before choosing', posts() === 0);
  await button(page, 'Go Back').click();
  await settle(db);
  r.check('Go Back saves nothing', posts() === 0);
  await button(page, /^Schedule \d+ days?$/).click();
  const fa = page.locator('button', { hasText: /^Schedule First Available \(/ });
  r.check('offers First Available with its date', await fa.count() === 1);
  await fa.click();
  await settle(db, 2500);
  const l = rows(db, e => e.sub_item_id === 'i2').sort((a, b) => a.date_str.localeCompare(b.date_str));
  r.check('nothing landed on the occupied day', !l.some(e => e.date_str === D(3) && e.slot === 0), l);
  r.check('starts on the next open day', l[0] && l[0].date_str === D(4), l);
  r.check('full 16h scheduled', itemTotal(db, 'i2') === 16, l);
  r.check('Kitchen untouched', rows(db, e => e.id === 'k1')[0]?.hours === 8);
} catch (e) { r.error(e); }
await browser.close();
r.done();
