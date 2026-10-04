// PR #28 / TESTING_NOTES 2A #3: manually editing a job entry to 0 hours
// deletes it (same as Remove) instead of saving a locked 0h entry that
// nothing ever cleans up.
import { launch, settle, block, input, button, at, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('zero-hours manual edit deletes the entry');
const D1 = businessDayStr(2), D2 = businessDayStr(3);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16)],
  entries: [entry('e1', 's1', 'i1', D1, 0, 8), entry('e2', 's1', 'i1', D2, 0, 8)],
};
const { browser, page, db } = await launch(seed);
try {
  await (await block(page, 'Mark', D2, 0)).click();
  await input(page, 'Hours').fill('0');
  await button(page, 'Save').click();
  await settle(db);
  r.check('entry removed from DB', at(db, 's1', D2, 0).length === 0, at(db, 's1', D2, 0));
  r.check('no locked 0h entry anywhere', !db.tables.entries.some(e => Number(e.hours) === 0));
  r.check('other entry untouched', at(db, 's1', D1, 0).length === 1);
  await page.click('text=↩ Undo'); await settle(db);
  r.check('undo brings it back', at(db, 's1', D2, 0).length === 1 && Number(at(db, 's1', D2, 0)[0].hours) === 8, at(db, 's1', D2, 0));
} catch (e) { r.error(e); }
await browser.close();
r.done();
