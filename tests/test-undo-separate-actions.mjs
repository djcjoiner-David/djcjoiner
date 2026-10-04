// PR #29 (2A #2): two separate actions must always be two separate undo
// steps, even when the first one's saving is still in flight when the
// second starts. Pre-fix, a shared "bundling" flag merged them, so one Undo
// click undid both.
import { launch, settle, block, cell, snap, eq, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('overlapping actions stay separate undo steps');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 5, 1), staff('s3', 'Jenny', 8, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 12), item('i2', 'j1', 'Laundry', 8, 1)],
  entries: [
    entry('e1', 's1', 'i1', D(2), 0, 8), entry('e2', 's1', 'i1', D(3), 0, 4),
    entry('e3', 's3', 'i2', D(2), 0, 8),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  const s0 = snap(db);
  db.hooks.delayMs = 700;
  // A: move a Kitchen day (triggers item recalculation cascade).
  // Moving Mark's first 8h day to Ian (5h/day) on a later day forces the
  // item to re-split (Mark's 4h day grows, Ian's shrinks) - several slow
  // saves, the window the second action lands inside.
  await (await block(page, 'Mark', D(2), 0)).dragTo(await cell(page, 'Ian', D(4), 0));
  await sleep(1100);
  // B: start a second, unrelated move while A's cascade may still be saving.
  await (await block(page, 'Jenny', D(2), 0)).dragTo(await cell(page, 'Jenny', D(6), 1));
  await settle(db, 2500); db.hooks.delayMs = 0;
  const s2 = snap(db);
  const kitchenMoved = s2.some(s => s.startsWith(`s2|${D(4)}|0|i1`));
  const laundryMoved = s2.some(s => s.startsWith(`s3|${D(6)}|1|i2`));
  r.check('both moves happened', kitchenMoved && laundryMoved, s2);
  await page.click('text=↩ Undo'); await settle(db);
  const u1 = snap(db);
  r.check('one Undo reverts only the second move', u1.some(s => s.startsWith(`s3|${D(2)}|0|i2`)) && u1.some(s => s.startsWith(`s2|${D(4)}|0|i1`)), u1);
  await page.click('text=↩ Undo'); await settle(db);
  r.check('second Undo restores the exact original', eq(snap(db), s0), snap(db));
} catch (e) { r.error(e); }
await browser.close();
r.done();
