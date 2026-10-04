// PR #54 (Batch 3, 2E #5): a manual (auto-fill off) entry for several staff
// at once caps each person to their own daily hours, instead of giving
// everyone the one typed number (7.5h for a 6h and a 4.5h person).
import { launch, settle, newEntry, input, button, at, staff, job, item, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Batch 3: manual multi-staff entry caps each person');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 7.5, 0), staff('s2', 'Ian', 6, 1), staff('s3', 'Jenny', 4.5, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 40)],
  entries: [],
};
const { browser, page, db } = await launch(seed);
try {
  await newEntry(page, 'Mark', D(3), 0, { itemId: 'i1', autoFill: false });
  await page.locator('label', { hasText: /^\s*Ian/ }).locator('input[type=checkbox]').check();
  await page.locator('label', { hasText: /^\s*Jenny/ }).locator('input[type=checkbox]').check();
  await input(page, 'Hours').fill('7.5');
  await button(page, /^(Save|Schedule \d+ staff)$/).click();
  await settle(db, 2500);
  const h = id => Number(at(db, id, D(3), 0)[0]?.hours);
  r.check('Mark gets 7.5h', h('s1') === 7.5, db.tables.entries);
  r.check('Ian capped to 6h', h('s2') === 6, db.tables.entries);
  r.check('Jenny capped to 4.5h', h('s3') === 4.5, db.tables.entries);
} catch (e) { r.error(e); }
await browser.close();
r.done();
