// PR #40: a group move onto a cell occupied by an unrelated entry moves that
// occupant to the day's other slot instead of stacking both in one cell as
// a red Conflict. PR #42: the displaced entry keeps its own hours,
// scheduling order (created_at) and lock - it was there first, so the
// incoming mover is the one that gets capped and pushed further out.
// (Keeping a LOCKED blocker's lock is covered separately.)
import { launch, settle, cell, block, drag, button, at, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('group move displaces a blocking entry, keeping its priority');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 16), item('i2', 'j2', 'Laundry', 4, 1)],
  entries: [
    entry('k1', 's1', 'i1', D(2), 0, 8), entry('k2', 's1', 'i1', D(3), 0, 8),
    // 4h, so Ian still has room that day. (If it used his whole day, the
    // move would show the Scheduling Conflict pop-up instead - 2E #12,
    // covered by test-no-room-conflict.mjs.)
    entry('eL', 's2', 'i2', D(2), 0, 4, { job_id: 'j2' }),
  ],
};
const { browser, page, db } = await launch(seed);
try {
  const lBefore = { ...at(db, 's2', D(2), 0)[0] };
  await button(page, 'Select').click();
  await (await block(page, 'Mark', D(2), 0)).click();
  await (await block(page, 'Mark', D(3), 0)).click();
  await drag(page, db, await block(page, 'Mark', D(2), 0), await cell(page, 'Ian', D(2), 0));
  await page.keyboard.press('Escape');
  await settle(db, 3000);
  const cells = {};
  db.tables.entries.forEach(e => { const k = `${e.staff_id}|${e.date_str}|${e.slot}`; cells[k] = (cells[k] || 0) + 1; });
  r.check('no cell holds two entries (no Conflict)', Object.values(cells).every(n => n === 1), cells);
  const l = rows(db, e => e.id === 'eL')[0];
  r.check('blocking entry moved to the other slot, same day', l && l.staff_id === 's2' && l.date_str === D(2) && l.slot === 1, l);
  r.check('all Kitchen entries now on Ian\'s row', rows(db, e => e.sub_item_id === 'i1').every(e => e.staff_id === 's2'), rows(db, e => e.sub_item_id === 'i1'));
  r.check('#42: displaced entry kept its hours', l && Number(l.hours) === 4, l);
  r.check('#42: displaced entry kept its created_at', l && l.created_at === lBefore.created_at, { before: lBefore.created_at, after: l && l.created_at });
  // (Keeping its LOCK is a separate, still-open bug - see
  // test-group-move-displace-keeps-lock.mjs / TESTING_NOTES 2E #9.)
  r.check('#42: Kitchen still adds up to 16h (mover pushed further out)', itemTotal(db, 'i1') === 16, rows(db, e => e.sub_item_id === 'i1'));
  r.check('no grid conflict shown', await page.locator('text=⚠ Conflict').count() === 0);
} catch (e) { r.error(e); }
await browser.close();
r.done();
