// TESTING_NOTES 2E #9 (user's rule). A group move landing on a LOCKED entry
// never moves, unlocks or changes it - it was there first. The moved entry
// (always the newest) takes the person's OTHER slot with whatever hours are
// left that day, and the rest of its item goes further out. With 0h left,
// the Scheduling Conflict pop-up asks first (2E #12).
// Example agreed with the user: Mark 6.5h/day, Wed: Kerrigan 4h locked in
// slot 1. A 6.5h Harries day lands on Mark's slot 1 -> Kerrigan stays 4h in
// slot 1, Harries gets 2.5h in slot 2, its other 4h is added further out.
import { launch, settle, cell, block, drag, button, rows, at, snap, eq, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('group move onto a locked entry: locked entry untouched');
const D = n => businessDayStr(n);
const seed = kerriganHours => ({
  staff: [staff('s1', 'Mark', 6.5, 0), staff('s2', 'Ian', 6.5, 1)],
  jobs: [job('j1', '246', 'Kerrigan'), job('j2', '309', 'Harries')],
  sub_items: [item('i1', 'j1', 'Pantry W', kerriganHours), item('i2', 'j2', 'Mudroom W', 13, 1)],
  entries: [
    entry('kp', 's1', 'i1', D(3), 0, kerriganHours, { hours_locked: true }),
    entry('h1', 's2', 'i2', D(6), 0, 6.5, { job_id: 'j2' }), entry('h2', 's2', 'i2', D(7), 0, 6.5, { job_id: 'j2' }),
  ],
});
async function moveGroup(page, db) {
  await button(page, 'Select').click();
  await (await block(page, 'Ian', D(6), 0)).click();
  await (await block(page, 'Ian', D(7), 0)).click();
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'Mark', D(3), 0), { dispatch: true });
  await page.keyboard.press('Escape');
}
// 1. Mark has 2.5h left: no pop-up.
{
  const { browser, page, db } = await launch(seed(4));
  try {
    const kBefore = { ...rows(db, e => e.id === 'kp')[0] };
    await moveGroup(page, db);
    await settle(db, 3000);
    const k = rows(db, e => e.id === 'kp')[0];
    r.check('room left: no pop-up', await page.locator('text=⚠ Scheduling Conflict').count() === 0);
    r.check('Kerrigan stays in slot 1 at 4h, still locked, same booking time', k && k.slot === 0 && Number(k.hours) === 4 && k.hours_locked === true && k.created_at === kBefore.created_at, k);
    const h = at(db, 's1', D(3), 1)[0];
    r.check('Harries in Mark\'s slot 2 with the 2.5h left', h && h.sub_item_id === 'i2' && Number(h.hours) === 2.5, at(db, 's1', D(3), 1));
    r.check('Harries still totals its 13h (rest added further out)', itemTotal(db, 'i2') === 13, rows(db, e => e.sub_item_id === 'i2'));
    r.check('no slot holds two entries', rows(db, () => true).every(e => at(db, e.staff_id, e.date_str, e.slot).length === 1));
  } catch (e) { r.error(e); }
  await browser.close();
}
// 2. Kerrigan uses Mark's whole 6.5h: pop-up; Go Back changes nothing.
{
  const { browser, page, db } = await launch(seed(6.5));
  try {
    const s0 = snap(db);
    await moveGroup(page, db);
    r.check('no hours left: pop-up shown', await page.locator('text=⚠ Scheduling Conflict').count() > 0);
    await button(page, 'Go Back').click();
    await settle(db, 2500);
    r.check('Go Back changes nothing', eq(snap(db), s0), snap(db));
  } catch (e) { r.error(e); }
  await browser.close();
}
// 3. Same, Schedule Anyway: Kerrigan untouched, Harries in slot 2 at full hours.
{
  const { browser, page, db } = await launch(seed(6.5));
  try {
    await moveGroup(page, db);
    await button(page, 'Schedule Anyway').click();
    await settle(db, 3000);
    const k = rows(db, e => e.id === 'kp')[0];
    const h = at(db, 's1', D(3), 1)[0];
    r.check('Schedule Anyway: Kerrigan untouched (slot 1, 6.5h, locked)', k && k.slot === 0 && Number(k.hours) === 6.5 && k.hours_locked === true, k);
    r.check('Schedule Anyway: Harries in slot 2 at its full 6.5h, locked', h && Number(h.hours) === 6.5 && h.hours_locked === true, h);
    r.check('Schedule Anyway: both show red Conflict', (await (await cell(page, 'Mark', D(3), 0)).locator('text=⚠ Conflict').count()) > 0 && (await (await cell(page, 'Mark', D(3), 1)).locator('text=⚠ Conflict').count()) > 0);
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
