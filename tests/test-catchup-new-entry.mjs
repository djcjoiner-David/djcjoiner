// PR #43: a manual entry that would push an already fully-scheduled item
// over budget offers "Add Catch-up Hours". The entry is saved tagged
// Catch-up, keeps its own hours, doesn't eat into the item's budget (the
// existing entry is untouched), shows "↺ Catch-up" on the grid, and the
// modal shows the running Catch-up total for the item.
import { launch, settle, cell, block, newEntry, input, button, at, staff, job, item, entry, businessDayStr, reporter, cellText } from './harness.mjs';

const r = reporter('Catch-up Hours on a fully-allocated item');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8)],
  entries: [entry('k1', 's1', 'i1', D(2), 0, 8)],
};
const { browser, page, db } = await launch(seed);
try {
  await newEntry(page, 'Ian', D(3), 0, { itemId: 'i1', autoFill: false });
  await input(page, 'Hours').fill('4');
  await button(page, 'Save').click();
  r.check('"All hours allocated" prompt offered', await page.locator('text=All hours allocated').count() > 0);
  await button(page, 'Add Catch-up Hours').click();
  await settle(db, 3000);
  const c = at(db, 's2', D(3), 0)[0];
  r.check('saved as Catch-up with its own 4h', c && c.is_catch_up === true && Number(c.hours) === 4, c);
  r.check('existing 8h entry untouched (Catch-up not in budget math)', Number(at(db, 's1', D(2), 0)[0].hours) === 8, at(db, 's1', D(2), 0));
  r.check('grid shows the Catch-up tag', (await cellText(page, 'Ian', D(3), 0)).includes('Catch-up'), await cellText(page, 'Ian', D(3), 0));
  // The Catch-up line belongs to the Catch-up entry itself (user, 2F #10):
  // not shown when scheduling the item again, shown when editing it.
  await newEntry(page, 'Ian', D(4), 0, { itemId: 'i1', autoFill: false });
  r.check('new entry form shows no Catch-up line', await page.locator('text=/Catch-up logged for this/').count() === 0);
  await button(page, 'Cancel').click();
  await (await block(page, 'Ian', D(3), 0)).click();
  r.check('editing the Catch-up entry shows "4hrs Catch-up logged for this entry"', await page.locator('text=/^4hrs Catch-up logged for this entry, not deducted from item total hrs\\.$/').count() > 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
