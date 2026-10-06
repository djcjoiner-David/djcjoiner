// TESTING_NOTES 2F #12 (user's live review): David 7's 10h Vanity W
// started Wed in his top slot; Thu-Mon his top slot had Vanity S, so the
// fill skipped to the next Tuesday (7h + 3h a week apart). User's rule: an
// item starts and finishes in the same slot - if it won't fit in Slot 1,
// the WHOLE run goes in Slot 2, not one day in each. Only when neither slot
// alone covers the run as early does it use whichever slot has room.
import { launch, settle, button, newEntry, rows, staff, job, item, entry, businessDay, iso, reporter, sleep } from './harness.mjs';

const r = reporter('auto-fill keeps a run in the slot that fits');
let n = 3; while (businessDay(n).getDay() !== 3) n++;
const W = k => iso(businessDay(n + k)); // W(0) Wed, W(1) Thu, W(2) Fri, W(3) Mon, W(4) Tue
const fmt = w => w.map(e => `${e.date_str}/s${e.slot}/${e.hours}`).join(' ');
async function schedule(entries, tentative) {
  const seed = {
    staff: [staff('s1', 'David 7', 7, 0)],
    jobs: [job('j1', '101214', 'Driscoll')],
    sub_items: [item('iS', 'j1', 'Vanity S', 12), item('iW', 'j1', 'Vanity W', 10, 1), item('iX', 'j1', 'Pantry', 2, 2)],
    entries,
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await newEntry(page, 'David 7', W(0), 0, { itemId: 'iW' });
    if (tentative) await button(page, 'Schedule as Tentative').click();
    await page.locator('div:has(> div:text-is("Hours to Deduct from Budget")) input[type=number]').fill('10');
    await page.locator('button', { hasText: /^Schedule \d+ days?$/ }).click();
    await sleep(800);
    const gap = await page.locator('text=⚠ Break in schedule').count();
    await settle(db, 3000);
    const w = rows(db, e => e.sub_item_id === 'iW').sort((a, b) => a.date_str.localeCompare(b.date_str));
    const byDay = {}; db.tables.entries.forEach(e => byDay[e.date_str] = (byDay[e.date_str] || 0) + Number(e.hours));
    return { gap, w, over: Object.values(byDay).some(h => h > 7), byDay };
  } finally { await browser.close(); }
}
const vanityS = () => [entry('S1', 's1', 'iS', W(1), 0, 4, { hours_locked: true }), entry('S2', 's1', 'iS', W(2), 0, 7), entry('S3', 's1', 'iS', W(3), 0, 1)];
for (const tentative of [true, false]) {
  const label = tentative ? 'tentative' : 'normal';
  try {
    const { gap, w, over, byDay } = await schedule(vanityS(), tentative);
    r.check(`${label}: no "Break in schedule"`, gap === 0);
    r.check(`${label}: whole run in Slot 2 - Wed 7h, Thu 3h`, w.length === 2 && w.every(e => e.slot === 1) && w[0].date_str === W(0) && Number(w[0].hours) === 7 && w[1].date_str === W(1) && Number(w[1].hours) === 3, fmt(w));
    r.check(`${label}: David never over 7h`, !over, byDay);
  } catch (e) { r.error(e); }
}
// Free week: stays in the chosen Slot 1.
try {
  const { w } = await schedule([], false);
  r.check('free days: stays in Slot 1', w.length === 2 && w.every(e => e.slot === 0), fmt(w));
} catch (e) { r.error(e); }
// Wed bottom taken, Thu top taken: the run still starts and finishes in
// one slot (user's rule) - Slot 1 Wed 5h, Thu skipped, Fri 5h - rather
// than hopping rows (a 1-day gap is not a "break").
try {
  const { w, gap } = await schedule([entry('X1', 's1', 'iX', W(0), 1, 2), entry('S1', 's1', 'iS', W(1), 0, 4, { hours_locked: true })], false);
  r.check('one slot start to finish: Wed 5h, Fri 5h, both Slot 1', gap === 0 && w.length === 2 && w.every(e => e.slot === 0) && w[0].date_str === W(0) && Number(w[0].hours) === 5 && w[1].date_str === W(2) && Number(w[1].hours) === 5, fmt(w));
} catch (e) { r.error(e); }
r.done();
