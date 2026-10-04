// TESTING_NOTES 2E #15 (user's decision): a manual hours edit NEVER shrinks
// the person's other entry that day. If the typed hours take them over
// their daily max, the pop-up says "<name> has <max>hrs max per day, these
// additional hours will create a conflict, Schedule anyway?" (plus a note
// that reducing the other entry would leave its item short). Schedule
// Anyway keeps both, red Conflict; Go Back saves nothing. An edit that
// still fits saves straight away. User's live example: Ian 7.5h/day,
// Driscoll Laundry W 7h in slot 2; a Catch-up copy in slot 1 edited to 4h
// used to cut Laundry to 3.5h ("3.5h under").
import { launch, settle, cell, block, drag, input, button, rows, at, snap, eq, staff, job, item, entry, businessDayStr, reporter, cellText } from './harness.mjs';

const r = reporter('manual edit over the daily max: pop-up, never shrinks the other entry');
const D = n => businessDayStr(n);
const seed = () => ({
  staff: [staff('s1', 'David', 7, 0), staff('s2', 'Ian', 7.5, 1)],
  jobs: [job('j1', '101214', 'Driscoll')],
  sub_items: [item('i1', 'j1', 'Laundry W', 14)],
  entries: [entry('dl', 's1', 'i1', D(5), 0, 7), entry('il', 's2', 'i1', D(5), 1, 7)],
});
async function copyAndType(page, db, hours) {
  await drag(page, db, await block(page, 'David', D(5), 0), await cell(page, 'Ian', D(5), 0), { copy: true });
  await settle(db, 2500);
  await input(page, 'Hours').fill(String(hours));
  await button(page, 'Save').click();
}
const laundry = db => rows(db, e => e.id === 'il')[0];
const catchup = db => at(db, 's2', D(5), 0)[0];
// 1. Over the max -> pop-up with the user's wording; Schedule Anyway keeps both.
{
  const { browser, page, db } = await launch(seed());
  try {
    await copyAndType(page, db, 4);
    r.check('pop-up shown', await page.locator('text=⚠ Scheduling Conflict').count() > 0);
    r.check('wording: "Ian has 7.5hrs max per day, these additional hours will create a conflict, Schedule anyway?"', await page.locator('text=/Ian has 7\\.5hrs max per day, these additional hours will create a conflict, Schedule anyway\\?/').count() > 0);
    r.check('note: reducing Laundry W leaves it short, consider the next day', await page.locator('text=/if you reduce Laundry W to make room, Laundry W will be short of its hours - consider adding those hours to the next day/').count() > 0);
    await button(page, 'Schedule Anyway').click();
    await settle(db, 3000);
    r.check('Catch-up saved at 4h', Number(catchup(db)?.hours) === 4 && catchup(db)?.is_catch_up === true, catchup(db));
    r.check('Ian\'s Laundry NOT shrunk - still 7h', Number(laundry(db)?.hours) === 7, laundry(db));
    r.check('both entries show red Conflict', (await cellText(page, 'Ian', D(5), 0)).includes('Conflict') && (await cellText(page, 'Ian', D(5), 1)).includes('Conflict'));
    await drag(page, db, await block(page, 'David', D(5), 0), await cell(page, 'David', D(6), 0), { dispatch: true });
    await settle(db, 3000);
    r.check('still 7h + 4h after a later grid action', Number(laundry(db)?.hours) === 7 && Number(catchup(db)?.hours) === 4, rows(db, e => e.staff_id === 's2'));
  } catch (e) { r.error(e); }
  await browser.close();
}
// 2. Go Back -> nothing saved from the edit; back on the form.
{
  const { browser, page, db } = await launch(seed());
  try {
    await copyAndType(page, db, 4);
    const before = snap(db);
    await button(page, 'Go Back').click();
    await settle(db, 2000);
    r.check('Go Back: nothing saved', eq(snap(db), before), snap(db));
    r.check('Go Back: still on the form', await input(page, 'Hours').count() > 0);
  } catch (e) { r.error(e); }
  await browser.close();
}
// 3. An edit that still fits saves straight away, nothing shrunk.
{
  const { browser, page, db } = await launch(seed());
  try {
    await copyAndType(page, db, 0.5);
    await settle(db, 3000);
    r.check('fits: no pop-up', await page.locator('text=⚠ Scheduling Conflict').count() === 0);
    r.check('fits: Laundry still 7h, Catch-up 0.5h', Number(laundry(db)?.hours) === 7 && Number(catchup(db)?.hours) === 0.5, rows(db, e => e.staff_id === 's2'));
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
