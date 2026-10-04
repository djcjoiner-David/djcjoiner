// Core manual edit rules (commits 3f511b9, ba6b011):
// - a typed-in number on an item's FINAL (completing) entry sticks - it's
//   locked, survives the background pass and a reload (pre-fix it was
//   recalculated straight back);
// - a manual edit re-balances the one colleague sharing that item on the
//   same day to what's left of the budget.
import { launch, settle, block, input, button, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: manual edits stick and rebalance a same-day colleague');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 10), item('i2', 'j1', 'Pantry', 12, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's2', 'i1', D(3), 0, 2),
    entry('p1', 's1', 'i2', D(5), 0, 8), entry('p2', 's2', 'i2', D(5), 0, 4),
  ],
};
const { browser, page, db } = await launch(seed);
const h = id => rows(db, e => e.id === id)[0];
try {
  await (await block(page, 'Ian', D(3), 0)).click();
  await input(page, 'Hours').fill('5');
  await button(page, 'Save').click();
  await settle(db, 3000);
  r.check('final entry keeps typed 5h after the background pass', Number(h('k2').hours) === 5 && h('k2').hours_locked === true, h('k2'));
  await page.reload(); await page.waitForSelector('text=Today'); await settle(db, 2500);
  r.check('...and after a reload', Number(h('k2').hours) === 5, h('k2'));
  await (await block(page, 'Mark', D(5), 0)).click();
  await input(page, 'Hours').fill('5');
  await button(page, 'Save').click();
  await settle(db, 3000);
  r.check('edited entry saved at 5h', Number(h('p1').hours) === 5, h('p1'));
  r.check('same-day colleague rebalanced to the 7h left', Number(h('p2').hours) === 7, h('p2'));
} catch (e) { r.error(e); }
await browser.close();
r.done();
