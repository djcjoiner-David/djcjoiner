// PRs #29/#33 (2A #1, #7, #9): one user action that sets off a cascade
// (other entries recalculated) undoes and redoes as ONE click, restoring
// every entry exactly - hours, positions and scheduling order - with
// nothing lost on redo.
import { launch, settle, block, cell, drag, snap, eq, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('a cascading action undoes/redoes as one exact step');
const D = n => businessDayStr(n);
// Kitchen 20h shared: Mark 8 + Ian 8 on day 2, Mark 4 on day 3.
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1), staff('s3', 'Jenny', 6, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 20)],
  entries: [
    entry('e1', 's1', 'i1', D(2), 0, 8), entry('e2', 's2', 'i1', D(2), 0, 8),
    entry('e3', 's1', 'i1', D(3), 0, 4),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  const s0 = snap(db);
  // Move Ian's 8h day onto Jenny (6h/day) - forces the item to recalculate.
  await drag(page, db, await block(page, 'Ian', D(2), 0), await cell(page, 'Jenny', D(2), 0));
  const s1 = snap(db);
  const changed = s0.filter(x => !s1.includes(x)).length;
  r.check('move cascaded to more than the moved entry', changed >= 2, { s0, s1 });
  await page.click('text=↩ Undo'); await settle(db);
  r.check('one Undo restores everything exactly', eq(snap(db), s0), snap(db));
  r.check('Undo stack now empty (it was one step)', !(await page.locator('button', { hasText: '↩ Undo' }).isEnabled()));
  await page.click('text=↪ Redo'); await settle(db);
  r.check('one Redo restores the whole cascade exactly', eq(snap(db), s1), snap(db));
  r.check('Redo stack empty after one Redo', !(await page.locator('button', { hasText: '↪ Redo' }).isEnabled()));
} catch (e) { r.error(e); }
await browser.close();
r.done();
