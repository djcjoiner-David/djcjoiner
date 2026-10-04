// PR #34: if an Undo's database sync fails, the undo step must NOT be used
// up. Pre-fix, the step was popped first, so a failed click silently lost
// it and the next click acted on the wrong (or no) step.
import { launch, settle, block, cell, drag, snap, eq, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('failed undo keeps its step');
const D1 = businessDayStr(2), D2 = businessDayStr(3);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8)],
  entries: [entry('e1', 's1', 'i1', D1, 0, 8)],
};
const { browser, page, db } = await launch(seed);
try {
  const before = snap(db);
  await drag(page, db, await block(page, 'Mark', D1, 0), await cell(page, 'Ian', D2, 0));
  const after = snap(db);
  r.check('move happened', !eq(before, after));
  db.hooks.failNext = (m, t) => t === 'entries' && m !== 'GET';
  await page.click('text=↩ Undo'); await settle(db);
  r.check('failed undo changed nothing', eq(snap(db), after), snap(db));
  r.check('Undo still available after the failure', await page.locator('button', { hasText: '↩ Undo' }).isEnabled());
  r.check('Redo not offered for an undo that never happened', !(await page.locator('button', { hasText: '↪ Redo' }).isEnabled()));
  await page.click('text=↩ Undo'); await settle(db);
  r.check('retry undo restores the original', eq(snap(db), before), snap(db));
} catch (e) { r.error(e); }
await browser.close();
r.done();
