// Core copy rules (commits 09e375c, 2bd3e59): a copy onto a day where the
// item is already shared doesn't just clone the source's hours into an
// over-run - the item re-balances to its budget - and the whole thing
// undoes in one click.
import { launch, settle, cell, block, drag, rows, itemTotal, snap, eq, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: copy onto a shared day rebalances and undoes');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1), staff('s3', 'Jenny', 8, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16)],
  entries: [entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's2', 'i1', D(2), 0, 4)],
};
const { browser, page, db } = await launch(seed);
try {
  const s0 = snap(db);
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Jenny', D(2), 0), { copy: true });
  await settle(db, 3000);
  const copy = rows(db, e => e.staff_id === 's3')[0];
  r.check('copy created', !!copy, db.tables.entries);
  r.check('item settles at its 16h budget (no blind 8h clone over-run)', itemTotal(db, 'i1') === 16, db.tables.entries);
  r.check('copy is not Catch-up (item had room)', copy && !copy.is_catch_up, copy);
  await page.keyboard.press('Escape');
  await page.click('text=↩ Undo'); await settle(db);
  r.check('one Undo restores exactly', eq(snap(db), s0), snap(db));
} catch (e) { r.error(e); }
await browser.close();
r.done();
