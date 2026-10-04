// Auto-delete of 0h entries (user's rule, restoring the 22 Sep behaviour):
// - after a real change on the grid, an unlocked entry the app reduces to
//   0h (e.g. a colleague's edit uses the whole budget) deletes itself, and
//   so does any unlocked entry already sitting at 0h;
// - never on opening the app, never a past-dated entry;
// - the change's one Undo brings it back.
import { launch, settle, block, cell, drag, input, button, rows, snap, eq, staff, job, item, entry, businessDayStr, pastBusinessDayStr, reporter } from './harness.mjs';

const r = reporter('0h entries delete themselves after a grid change');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1), staff('s3', 'Jeff', 8, 2)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j1', 'Pantry', 8, 1), item('i3', 'j1', 'Laundry', 8, 2), item('i4', 'j1', 'Vanity', 8, 3)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 4), entry('k2', 's2', 'i1', D(2), 0, 4),   // Kitchen shared 4+4
    entry('p1', 's1', 'i2', D(4), 0, 8), entry('p2', 's2', 'i2', D(4), 0, 0),   // Ian already at 0h
    entry('v1', 's1', 'i4', pastBusinessDayStr(2), 0, 8), entry('v2', 's2', 'i4', pastBusinessDayStr(2), 0, 0), // past 0h
    entry('x1', 's3', 'i3', D(8), 0, 8),
  ],
};
const { browser, page, db } = await launch(seed);
const has = id => rows(db, e => e.id === id).length === 1;
try {
  await settle(db, 2500);
  r.check('opening: existing 0h entry NOT deleted', has('p2'));
  r.check('opening: nothing saved', db.log.filter(l => l.method !== 'GET').length === 0);
  const s0 = snap(db);
  // Mark takes the whole Kitchen budget -> Ian is left with nothing.
  await (await block(page, 'Mark', D(2), 0)).click();
  await input(page, 'Hours').fill('8');
  await button(page, 'Save').click();
  await settle(db, 3000);
  r.check('Mark saved at 8h', Number(rows(db, e => e.id === 'k1')[0]?.hours) === 8);
  r.check('Ian\'s now-empty Kitchen entry deleted itself', !has('k2'), rows(db, e => e.sub_item_id === 'i1'));
  r.check('older 0h Pantry entry also tidied up', !has('p2'));
  r.check('past-dated 0h entry kept (history)', has('v2'));
  await page.click('text=↩ Undo'); await settle(db, 3000);
  r.check('one Undo brings everything back exactly', eq(snap(db), s0), snap(db));
} catch (e) { r.error(e); }
await browser.close();
r.done();
