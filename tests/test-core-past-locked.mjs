// Core (commit 33d727d): a past-dated entry is history - nobody (admin
// included) can drag it or open it for editing.
import { launch, settle, cell, staff, job, item, entry, pastBusinessDayStr, reporter } from './harness.mjs';

const r = reporter('core: past entries are locked');
const P = pastBusinessDayStr(1);
const seed = { staff: [staff('s1', 'Mark', 8, 0)], jobs: [job('j1', '101', 'Smith')], sub_items: [item('i1', 'j1', 'Kitchen', 8)], entries: [entry('k1', 's1', 'i1', P, 0, 8)] };
const { browser, page, db } = await launch(seed);
try {
  const b = (await cell(page, 'Mark', P, 0)).locator('div[draggable]').first();
  r.check('past entry is not draggable', (await b.getAttribute('draggable')) === 'false');
  await b.click();
  await settle(db, 1000);
  r.check('clicking it opens no edit form', await page.locator('div:has(> div:text-is("Hours")) > input').count() === 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
