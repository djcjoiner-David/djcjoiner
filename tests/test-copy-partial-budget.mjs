// TESTING_NOTES 2E #11 (user's decision: option a). A copy only becomes
// Catch-up Hours when its item's budget is ALREADY fully used. With hours
// still left, the copy is a normal entry and the item settles to its budget
// (pre-fix: an 8h copy onto an item with 4h left became all Catch-up and
// the 4h was never filled). Judged per item only.
import { launch, settle, cell, block, drag, button, rows, itemTotal, snap, eq, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('copy: Catch-up only when the item is already full');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 4, 1), staff('s3', 'Jenny', 8, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16), item('i2', 'j1', 'Pantry', 20, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's2', 'i1', D(2), 0, 4),   // Kitchen: 12 of 16 used (Ian's whole 4h day)
    entry('p1', 's1', 'i2', D(5), 0, 8), entry('p2', 's1', 'i2', D(6), 0, 8),   // Pantry: 16 of 20 used
  ],
};
const { browser, page, db } = await launch(seed);
try {
  // 1. single ctrl-drag copy: 8h onto Kitchen with 4h left
  const s0 = snap(db);
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Jenny', D(2), 0), { copy: true });
  await settle(db, 3000);
  const copy = rows(db, e => e.staff_id === 's3' && e.sub_item_id === 'i1')[0];
  r.check('single copy: created as a normal entry (not Catch-up)', copy && !copy.is_catch_up, copy);
  r.check('single copy: Kitchen settles at exactly its 16h budget', itemTotal(db, 'i1') === 16, rows(db, e => e.sub_item_id === 'i1'));
  r.check('single copy: no Catch-up anywhere on Kitchen', !rows(db, e => e.sub_item_id === 'i1').some(e => e.is_catch_up));
  await page.click('text=↩ Undo'); await settle(db, 3000);
  r.check('single copy: one Undo restores exactly', eq(snap(db), s0), snap(db));
  // 2. group copy of both Pantry days (8h + 8h) onto Pantry with 4h left:
  //    the first copy fills what's left (normal), the second finds it full (Catch-up).
  await button(page, 'Select').click();
  await (await block(page, 'Mark', D(5), 0)).click();
  await (await block(page, 'Mark', D(6), 0)).click();
  await drag(page, db, await block(page, 'Mark', D(5), 0), await cell(page, 'Jenny', D(5), 0), { copy: true });
  await page.keyboard.press('Escape');
  await settle(db, 3000);
  const g = rows(db, e => e.staff_id === 's3' && e.sub_item_id === 'i2').sort((a, b) => a.date_str.localeCompare(b.date_str));
  r.check('group copy: two copies made', g.length === 2, g);
  r.check('group copy: first is normal, second is Catch-up', g.length === 2 && !g[0].is_catch_up && g[1].is_catch_up, g);
  r.check('group copy: Pantry budget entries total exactly 20h', itemTotal(db, 'i2') === 20, rows(db, e => e.sub_item_id === 'i2'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
