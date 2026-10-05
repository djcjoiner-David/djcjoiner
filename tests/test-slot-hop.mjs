// TESTING_NOTES 2F #12 (user's live review): David 7's tentative Vanity W
// 10h started Wed in his top slot; Thu-Mon his top slot had Vanity S, so
// the fill skipped to the next Tuesday (7h + 3h a week apart). Now an item
// uses the other slot on a day its usual one is taken, if there's room.
import { launch, settle, button, newEntry, rows, staff, job, item, entry, businessDay, iso, reporter, sleep } from './harness.mjs';

const r = reporter('auto-fill uses the other slot instead of skipping a day');
let n = 3; while (businessDay(n).getDay() !== 3) n++;
const W = k => iso(businessDay(n + k)); // W(0) Wed, W(1) Thu, W(2) Fri, W(3) Mon, W(4) Tue
for (const tentative of [true, false]) {
  const seed = {
    staff: [staff('s1', 'David 7', 7, 0)],
    jobs: [job('j1', '101214', 'Driscoll')],
    sub_items: [item('iS', 'j1', 'Vanity S', 12), item('iW', 'j1', 'Vanity W', 10, 1)],
    entries: [entry('S1', 's1', 'iS', W(1), 0, 4, { hours_locked: true }), entry('S2', 's1', 'iS', W(2), 0, 7), entry('S3', 's1', 'iS', W(3), 0, 1)],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await newEntry(page, 'David 7', W(0), 0, { itemId: 'iW' });
    if (tentative) await button(page, 'Tentative').click();
    await page.locator('div:has(> div:text-is("Hours to Deduct from Budget")) input[type=number]').fill('10');
    await page.locator('button', { hasText: /^Schedule \d+ days?$/ }).click();
    await sleep(800);
    const label = tentative ? 'tentative' : 'confirmed';
    r.check(`${label}: no "Break in schedule"`, await page.locator('text=⚠ Break in schedule').count() === 0);
    await settle(db, 3000);
    const w = rows(db, e => e.sub_item_id === 'iW').sort((a, b) => a.date_str.localeCompare(b.date_str));
    r.check(`${label}: Wed 7h top slot, Thu 3h bottom slot`, w.length === 2 && w[0].date_str === W(0) && w[0].slot === 0 && Number(w[0].hours) === 7 && w[1].date_str === W(1) && w[1].slot === 1 && Number(w[1].hours) === 3, w);
    const byDay = {}; db.tables.entries.forEach(e => byDay[e.date_str] = (byDay[e.date_str] || 0) + Number(e.hours));
    r.check(`${label}: David never over 7h`, Object.values(byDay).every(h => h <= 7), byDay);
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
