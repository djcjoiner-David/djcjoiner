// PRs #44-#46: a Catch-up entry uses the SAME solid border as any other job
// entry (the dashed teal border was reverted - and the first revert didn't
// actually land), only the "↺ Catch-up" tag marks it. An empty slot with
// leftover capacity says "Hours / Available" on two lines, with NO hour
// count (so staff can't work out each other's efficiency).
import { launch, cell, block, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Catch-up border + Hours Available hint');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j1', 'Laundry', 3, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8),
    entry('c1', 's1', 'i1', D(3), 0, 2, { is_catch_up: true, hours_locked: true }),
    entry('l1', 's1', 'i2', D(4), 0, 3),
  ],
};
const { browser, page } = await launch(seed);
try {
  const style = async b => (await b.evaluate(el => getComputedStyle(el).borderTopStyle));
  r.check('Catch-up entry border is solid, not dashed', (await style(await block(page, 'Mark', D(3), 0))) === 'solid', await style(await block(page, 'Mark', D(3), 0)));
  const hint = (await (await cell(page, 'Mark', D(4), 1)).innerText()).trim();
  r.check('empty slot shows "Hours Available"', /Hours\s*\n\s*Available/.test(hint), hint);
  r.check('hint shows no hour count', !/\d/.test(hint), hint);
} catch (e) { r.error(e); }
await browser.close();
r.done();
