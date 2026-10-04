// PR #36: re-editing an existing Misc entry's Hours isn't clamped to what
// the other slot leaves free. Pre-fix every keystroke snapped back to the
// sibling-derived cap (here 2h), with no way to correct it.
import { launch, block, input, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('Misc re-edit not clamped by sibling cap');
const D1 = businessDayStr(2);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 6)],
  entries: [
    entry('eK', 's1', 'i1', D1, 0, 6),
    entry('eM', 's1', null, D1, 1, 2, { job_id: null, misc_note: 'Wash cars' }),
  ],
};
const { browser, page } = await launch(seed);
try {
  await (await block(page, 'Mark', D1, 1)).click();
  await input(page, 'Hours').fill('5');
  r.check('Hours box accepts 5', (await input(page, 'Hours').inputValue()) === '5', await input(page, 'Hours').inputValue());
} catch (e) { r.error(e); }
await browser.close();
r.done();
