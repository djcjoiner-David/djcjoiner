// Core auto-fill (commits 33d727d, 95c2a35, a036c8c): a multi-day auto-fill
// is capacity-aware - a day's free hours are what's left after the person's
// other slot - and never overbooks anyone. If the chosen slot is taken on
// the FIRST day but the other slot has room, it starts in the other slot;
// once started, the person stays in that slot for the item, using the
// other slot only on a day their usual one is taken (TESTING_NOTES 2F #12);
// a day with no room in either slot is skipped.
import { launch, settle, newEntry, button, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: auto-fill is capacity-aware, slot-consistent');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Laundry', 3), item('i2', 'j1', 'Kitchen', 16, 1), item('i3', 'j1', 'Pantry', 8, 2)],
  entries: [
    entry('l1', 's1', 'i1', D(2), 0, 3),   // day 2: slot 1 taken (3h) - 5h left in slot 2
    entry('p1', 's1', 'i3', D(4), 1, 8),   // day 4: slot 2 taken (8h, his whole day)
  ],
};
const { browser, page, db } = await launch(seed);
try {
  // Open from the free slot 2, then ask for Slot 1 (which is taken).
  await newEntry(page, 'Mark', D(2), 1, { itemId: 'i2', autoFill: true });
  await button(page, 'Slot 1').click();
  await button(page, /^Schedule \d+ days?$/).click();
  await settle(db, 3000);
  const k = rows(db, e => e.sub_item_id === 'i2');
  const on = d => k.find(e => e.date_str === d);
  r.check('Kitchen gets exactly its 16h', itemTotal(db, 'i2') === 16, k);
  r.check('day 2: starts in slot 2 with the 5h left', on(D(2))?.slot === 1 && Number(on(D(2))?.hours) === 5, k);
  r.check('day 3: stays in slot 2, full 8h', on(D(3))?.slot === 1 && Number(on(D(3))?.hours) === 8, k);
  r.check('day 4: skipped (slot 2 taken, slot 1 has no room left)', !on(D(4)), k);
  r.check('day 5: the last 3h, still slot 2', on(D(5))?.slot === 1 && Number(on(D(5))?.hours) === 3, k);
  const byDay = {}; db.tables.entries.forEach(e => byDay[e.date_str] = (byDay[e.date_str] || 0) + Number(e.hours));
  r.check('Mark never booked past 8h on any day', Object.values(byDay).every(h => h <= 8), byDay);
} catch (e) { r.error(e); }
await browser.close();
r.done();
