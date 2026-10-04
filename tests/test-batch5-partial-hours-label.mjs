// PR #56 (Batch 5, 2E #4): a day where someone works only part of their
// day on an item (e.g. sharing that day's budget with a colleague) shows
// its real hours (3.5h), not the item's flat total-budget placeholder
// (46h) - even when that person has later entries on the same item.
// Ordinary full days still show the placeholder (intentional, 2D #1).
import { launch, settle, cellText, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Batch 5: genuine partial day shows real hours');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mary', 8, 0), staff('s2', 'TJ', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Living W', 46)],
  entries: [
    entry('m2', 's1', 'i1', D(2), 0, 8), entry('t2', 's2', 'i1', D(2), 0, 3.5),
    entry('m3', 's1', 'i1', D(3), 0, 8), entry('t3', 's2', 'i1', D(3), 0, 8),
    entry('m4', 's1', 'i1', D(4), 0, 8), entry('t4', 's2', 'i1', D(4), 0, 8),
    entry('m5', 's1', 'i1', D(5), 0, 2.5),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await settle(db, 2500);
  const tj = await cellText(page, 'TJ', D(2), 0);
  r.check('TJ\'s shared day shows 3.5h', /·\s*3\.5h/.test(tj), tj);
  r.check('...not the 46h placeholder', !/46h/.test(tj), tj);
  const full = await cellText(page, 'Mary', D(3), 0);
  r.check('an ordinary full day still shows the 46h placeholder', /46h/.test(full), full);
  r.check('stored hours unchanged', db.tables.entries.find(e => e.id === 't2').hours === 3.5);
} catch (e) { r.error(e); }
await browser.close();
r.done();
