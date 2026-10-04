// TESTING_NOTES 2E #17 (user's rules). A new auto-filled schedule asks first
// ("⚠ Break in schedule") when someone's run on the item would have a break
// of MORE than 1 working day, or a selected person would get no hours at
// all because the others finish first. The pop-up says "This would
// schedule with a {x} day break for {name} on {Wed 07 Oct}" / "{name} can't
// start until ... won't be scheduled", then "First available start with no
// break longer than 1 day: {date}." Buttons: Schedule from {date} /
// Schedule Anyway / Go Back. A 1-day break is fine (no pop-up).
import { launch, settle, newEntry, input, button, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('schedule gap alerts');
const D = n => businessDayStr(n);
const lbl = n => { const d = new Date(D(n) + 'T00:00:00'); return d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' }).replace(',', ''); };
const base = busy => ({
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Jenny', 8, 1)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 72), item('i2', 'j2', 'Other', 200, 1), item('i3', 'j1', 'Pantry', 16, 2)],
  entries: busy,
});
const busyDays = (sid, from, to, bothSlots = false) => {
  const out = [];
  for (let n = from; n <= to; n++) { out.push(entry(`b${sid}${n}a`, sid, 'i2', D(n), 0, 8, { job_id: 'j2' })); if (bothSlots) out.push(entry(`b${sid}${n}b`, sid, 'i2', D(n), 1, 0.5, { job_id: 'j2' })); }
  return out;
};
const kitchen = db => rows(db, e => e.sub_item_id === 'i1').map(e => e.date_str).sort();
async function single(seed, run) { const ctx = await launch(seed); try { await run(ctx); } catch (e) { r.error(e); } await ctx.browser.close(); }
async function startKitchen(page, who = ['Mark'], itemId = 'i1', hours) {
  await newEntry(page, who[0], D(1), 0, { itemId, autoFill: true });
  for (const n of who.slice(1)) await page.locator('label', { hasText: new RegExp(`^\\s*${n}`) }).locator('input[type=checkbox]').check();
  if (hours) await page.locator('div:has(> div:text-is("Total Hours to Deduct from Budget")) input').fill(String(hours));
  await button(page, /^(Schedule \d+ days?|Schedule \d+ staff)$/).click();
}
// Mark busy days 3-4 (his slot 1) -> 2-day break.
await single(base(busyDays('s1', 3, 4)), async ({ page, db }) => {
  await startKitchen(page, ['Mark'], 'i1', 32);
  r.check('single: pop-up shown', await page.locator('text=⚠ Break in schedule').count() > 0);
  r.check(`single: "This would schedule with a 2 day break for Mark on ${lbl(3)}"`, await page.locator(`text=This would schedule with a 2 day break for Mark on ${lbl(3)}`).count() > 0);
  r.check(`single: "First available start ... ${lbl(5)}."`, await page.locator(`text=/First available start with no break longer than 1 day: ${lbl(5)}\\./`).count() > 0);
  await button(page, `Schedule from ${lbl(5)}`).click();
  await settle(db, 3000);
  r.check('single: "Schedule from" puts the whole item there, no break', JSON.stringify(kitchen(db)) === JSON.stringify([D(5), D(6), D(7), D(8)]), kitchen(db));
  r.check('single: full 32h', itemTotal(db, 'i1') === 32, rows(db, e => e.sub_item_id === 'i1'));
});
await single(base(busyDays('s1', 3, 4)), async ({ page, db }) => {
  await startKitchen(page, ['Mark'], 'i1', 32);
  await button(page, 'Go Back').click(); await settle(db, 1500);
  r.check('single: Go Back saves nothing', kitchen(db).length === 0);
});
await single(base(busyDays('s1', 3, 4)), async ({ page, db }) => {
  await startKitchen(page, ['Mark'], 'i1', 32);
  await button(page, 'Schedule Anyway').click(); await settle(db, 3000);
  r.check('single: Schedule Anyway keeps the original dates (with the break)', JSON.stringify(kitchen(db)) === JSON.stringify([D(1), D(2), D(5), D(6)]), kitchen(db));
});
// Mark busy only day 3 -> 1-day break: fine, no pop-up.
await single(base(busyDays('s1', 3, 3)), async ({ page, db }) => {
  await startKitchen(page, ['Mark'], 'i1', 32);
  await settle(db, 3000);
  r.check('1-day break: no pop-up, saved straight away', await page.locator('text=⚠ Break in schedule').count() === 0 && kitchen(db).length === 4, kitchen(db));
});
// Multi-staff: Jenny busy days 3-4 -> her 2-day break is listed.
await single(base(busyDays('s2', 3, 4)), async ({ page, db }) => {
  await startKitchen(page, ['Mark', 'Jenny'], 'i1', 72);
  r.check(`multi: "This would schedule with a 2 day break for Jenny on ${lbl(3)}"`, await page.locator(`text=This would schedule with a 2 day break for Jenny on ${lbl(3)}`).count() > 0);
  r.check('multi: offers a "Schedule from" date', await page.locator('button', { hasText: /^Schedule from / }).count() === 1);
});
// Multi-staff: Jenny fully booked days 1-8 (both slots), Pantry 16h -> Mark finishes alone: Jenny left off.
await single(base(busyDays('s2', 1, 8, true)), async ({ page, db }) => {
  await startKitchen(page, ['Mark', 'Jenny'], 'i3', 16);
  r.check(`multi: "Jenny can't start until ${lbl(9)} - the job is finished before then, so Jenny won't be scheduled."`, await page.locator(`text=Jenny can't start until ${lbl(9)} - the job is finished before then, so Jenny won't be scheduled.`).count() > 0);
  await button(page, `Schedule from ${lbl(9)}`).click(); await settle(db, 3000);
  const p = rows(db, e => e.sub_item_id === 'i3');
  r.check('multi: "Schedule from" gives both staff work, no breaks', p.some(e => e.staff_id === 's1') && p.some(e => e.staff_id === 's2') && p.every(e => e.date_str >= D(9)), p);
  r.check('multi: full 16h', itemTotal(db, 'i3') === 16, p);
});
r.done();
