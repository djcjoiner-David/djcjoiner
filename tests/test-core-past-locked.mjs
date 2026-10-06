// Core (commit 33d727d): a past-dated entry is history - nobody (admin
// included) can drag it or open it for editing.
import { launch, settle, staff, job, item, entry, pastBusinessDayStr, today, iso, reporter } from './harness.mjs';

const r = reporter('core: past entries are locked');
const P = pastBusinessDayStr(1);
const seed = { staff: [staff('s1', 'Mark', 8, 0)], jobs: [job('j1', '101', 'Smith')], sub_items: [item('i1', 'j1', 'Kitchen', 8)], entries: [entry('k1', 's1', 'i1', P, 0, 8)] };
const { browser, page, db } = await launch(seed);
try {
  // The last working day is last week's Friday when today is Monday, so it
  // isn't on this week's grid: switch to 1 Week view and step back a week.
  // (Found by the suite failing on a Monday - never assume "yesterday" is
  // on the current week.)
  const t = today(); const monday = new Date(t); monday.setDate(t.getDate() + (t.getDay() === 0 ? -6 : 1 - t.getDay()));
  if (P < iso(monday)) { await page.locator('button', { hasText: /^1 Week$/ }).click(); await page.locator('button', { hasText: /^‹$/ }).click(); await settle(db, 800); }
  const b = page.locator('div[draggable]', { hasText: 'Kitchen' }).first();
  r.check('past entry is not draggable', (await b.getAttribute('draggable')) === 'false');
  await b.click();
  await settle(db, 1000);
  r.check('clicking it opens no edit form', await page.locator('div:has(> div:text-is("Hours")) input').count() === 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
