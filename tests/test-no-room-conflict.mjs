// TESTING_NOTES 2E #12: putting work onto a day where the person has NO
// hours left always shows the "⚠ Scheduling Conflict" pop-up, all 5 ways:
// 1 new manual entry, 2 drag, 3 ctrl-copy, 4 group move, 5 group copy.
// Go Back = nothing changes. Schedule Anyway = lands at full hours, locked;
// both of that day's entries show red "⚠ Conflict"; nothing shrinks or
// deletes them, even after later grid actions. A day with SOME room keeps
// today's behaviour (cut to fit, rest added at the end) - no pop-up.
import { launch, settle, cell, block, drag, newEntry, input, button, rows, at, snap, eq, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('no hours left -> Scheduling Conflict pop-up (all 5 ways)');
const D = n => businessDayStr(n);
const FULL = D(2), ROOM = D(3);
const seed = () => ({
  staff: [staff('s1', 'David', 7, 0), staff('s2', 'Ian', 7.5, 1), staff('s3', 'Jeff', 8, 2)],
  jobs: [job('j1', '246', 'Kerrigan'), job('j2', '309', 'Harries')],
  sub_items: [item('i1', 'j1', 'Laundry W', 12), item('i2', 'j2', 'Mudroom W', 15, 1), item('i3', 'j2', 'WIR W', 8, 2), item('i4', 'j2', 'Pantry W', 20, 3)],
  entries: [
    entry('k1', 's1', 'i1', FULL, 0, 7), entry('k2', 's1', 'i1', ROOM, 0, 5),   // David: full on FULL, 2h left on ROOM
    entry('h1', 's2', 'i2', D(6), 0, 7.5, { job_id: 'j2' }), entry('h2', 's2', 'i2', D(7), 0, 7.5, { job_id: 'j2' }),
    entry('x1', 's3', 'i3', D(9), 0, 8, { job_id: 'j2' }),
  ],
});
const popup = page => page.locator('text=⚠ Scheduling Conflict');
const david = (db, ds) => at(db, 's1', ds, 1)[0];
const isRed = async (page, ds, slot) => (await (await cell(page, 'David', ds, slot)).locator('text=⚠ Conflict').count()) > 0;

async function scenario(name, act, { group = false, copy = false } = {}) {
  // Go Back
  {
    const { browser, page, db } = await launch(seed());
    try {
      const s0 = snap(db);
      await act(page, db);
      r.check(`${name}: pop-up shown`, await popup(page).count() > 0);
      r.check(`${name}: names David's full day`, await page.locator('text=/David has no hours left on .* \\(7h of 7h used\\)/').count() > 0);
      await button(page, 'Go Back').click();
      await settle(db, 2500);
      r.check(`${name}: Go Back changes nothing`, eq(snap(db), s0), snap(db));
    } catch (e) { r.error(e); }
    await browser.close();
  }
  // Schedule Anyway
  {
    const { browser, page, db } = await launch(seed());
    try {
      await act(page, db);
      await button(page, 'Schedule Anyway').click();
      await settle(db, 3000);
      // A Catch-up copy (its item's budget was already full) correctly opens
      // the entry form for checking - close it before carrying on.
      const cancel = page.locator('button', { hasText: /^\s*Cancel\s*$/ });
      if (await cancel.count()) { await cancel.last().click(); await settle(db, 1500); }
      const d = david(db, FULL);
      r.check(`${name}: lands on David's full day at full hours`, d && Number(d.hours) === (name.startsWith('1') ? 4 : 7.5), d);
      r.check(`${name}: locked so nothing shrinks it`, d && d.hours_locked === true, d);
      r.check(`${name}: David's 7h Laundry untouched`, Number(rows(db, e => e.id === 'k1')[0]?.hours) === 7);
      r.check(`${name}: both entries show red Conflict`, (await isRed(page, FULL, 0)) && (await isRed(page, FULL, 1)));
      // The group's second entry lands on David's ROOM day (2h left): cut to
      // fit, rest added at the end - but it still moved/copied with the group.
      if (group && !copy) r.check(`${name}: whole group moved (no split)`, ['h1', 'h2'].every(id => rows(db, e => e.id === id)[0]?.staff_id === 's1'), rows(db, e => e.sub_item_id === 'i2'));
      if (group && copy) r.check(`${name}: whole group copied (no split)`, at(db, 's1', FULL, 1).length === 1 && at(db, 's1', ROOM, 1).length === 1, rows(db, e => e.staff_id === 's1'));
      // a later, unrelated grid action must not shrink or delete either one
      await drag(page, db, await block(page, 'Jeff', D(9), 0), await cell(page, 'Jeff', D(10), 0));
      await settle(db, 3000);
      const d2 = david(db, FULL);
      r.check(`${name}: still there at full hours after a later grid action`, d2 && Number(d2.hours) === Number(d.hours), d2);
      r.check(`${name}: Laundry still 7h after a later grid action`, Number(rows(db, e => e.id === 'k1')[0]?.hours) === 7);
    } catch (e) { r.error(e); }
    await browser.close();
  }
}

await scenario('1 new manual entry', async (page) => {
  await newEntry(page, 'David', FULL, 1, { jobId: 'j2', itemId: 'i4', autoFill: false });
  await input(page, 'Hours').fill('4');
  r.check('1 new manual entry: Hours box accepts 4', (await input(page, 'Hours').inputValue()) === '4');
  await button(page, 'Save').click();
});
await scenario('2 drag', async (page, db) => {
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'David', FULL, 1), { dispatch: true });
});
await scenario('3 ctrl-copy', async (page, db) => {
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'David', FULL, 1), { copy: true });
});
await scenario('4 group move', async (page, db) => {
  await button(page, 'Select').click();
  await (await block(page, 'Ian', D(6), 0)).click(); await (await block(page, 'Ian', D(7), 0)).click();
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'David', FULL, 1), { dispatch: true });
}, { group: true });
await scenario('5 group copy', async (page, db) => {
  await button(page, 'Select').click();
  await (await block(page, 'Ian', D(6), 0)).click(); await (await block(page, 'Ian', D(7), 0)).click();
  await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'David', FULL, 1), { copy: true });
}, { group: true, copy: true });

// Some room (2h left): no pop-up - cut to fit, rest added at the end.
{
  const { browser, page, db } = await launch(seed());
  try {
    await drag(page, db, await block(page, 'Ian', D(6), 0), await cell(page, 'David', ROOM, 1), { dispatch: true });
    await settle(db, 3000);
    r.check('some room: no pop-up', await popup(page).count() === 0);
    r.check('some room: cut to the 2h left', Number(david(db, ROOM)?.hours) === 2, david(db, ROOM));
    r.check('some room: item still totals 15h (rest added at the end)', itemTotal(db, 'i2') === 15, rows(db, e => e.sub_item_id === 'i2'));
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
