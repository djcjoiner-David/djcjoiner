// PR #34: a second Undo click while the first is still saving must be
// ignored, not act on the same step again. Pre-fix, both clicks read the
// same stack, so two steps were consumed for one real undo.
import { launch, settle, block, cell, drag, snap, eq, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('double-click Undo while busy undoes once');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j1', 'Laundry', 8, 1)],
  entries: [entry('e1', 's1', 'i1', D(2), 0, 8), entry('e2', 's1', 'i2', D(3), 0, 8)],
};
const { browser, page, db } = await launch(seed);
try {
  const s0 = snap(db);
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Ian', D(4), 0));
  const s1 = snap(db);
  await drag(page, db, await block(page, 'Mark', D(3), 0), await cell(page, 'Ian', D(5), 0));
  const s2 = snap(db);
  r.check('two moves happened', !eq(s0, s1) && !eq(s1, s2));
  db.hooks.delayMs = 700;
  const u = page.locator('button', { hasText: '↩ Undo' });
  await u.click(); await sleep(100); await u.click();
  await settle(db); db.hooks.delayMs = 0;
  r.check('only the last move was undone', eq(snap(db), s1), snap(db));
  await u.click(); await settle(db);
  r.check('next Undo undoes the first move', eq(snap(db), s0), snap(db));
  await page.click('text=↪ Redo'); await settle(db);
  await page.click('text=↪ Redo'); await settle(db);
  r.check('two Redos bring back both moves', eq(snap(db), s2), snap(db));
} catch (e) { r.error(e); }
await browser.close();
r.done();
