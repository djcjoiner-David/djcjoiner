// PR #53 (Batch 2, 2F #3): a job can't be marked Completed while it still
// has entries from today onward - an error says how many; a job with only
// past entries can be.
import { launch, settle, button, staff, job, item, entry, businessDayStr, pastBusinessDayStr, reporter } from './harness.mjs';

const r = reporter('Batch 2: no completing a job with future work');
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16), item('i2', 'j2', 'Laundry', 8, 1)],
  entries: [
    entry('k1', 's1', 'i1', pastBusinessDayStr(2), 0, 8),
    entry('k2', 's1', 'i1', businessDayStr(2), 0, 8),
    entry('l1', 's1', 'i2', pastBusinessDayStr(3), 0, 8, { job_id: 'j2' }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await page.locator('div', { hasText: /^101 Smith$/ }).first().click();
  await button(page, '✓ Mark Complete').click();
  await settle(db);
  r.check('job with a future entry NOT completed', db.tables.jobs.find(j => j.id === 'j1').completed === false);
  r.check('error names the count', await page.locator("text=/Can't close this job - it still has 1 entry scheduled/").count() > 0);
  await button(page, 'Cancel').click().catch(() => {});
  await page.keyboard.press('Escape');
  await page.locator('div', { hasText: /^202 Jones$/ }).first().click();
  await button(page, '✓ Mark Complete').click();
  await settle(db);
  r.check('job with only past entries completed', db.tables.jobs.find(j => j.id === 'j2').completed === true);
} catch (e) { r.error(e); }
await browser.close();
r.done();
