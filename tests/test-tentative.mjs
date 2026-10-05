// TESTING_NOTES 2F #9a: Tentative entries (user's rules).
// - Chosen per schedule by the "Tentative" switch on the entry form.
// - Shown faded, dashed border, "Tentative" label.
// - A tentative entry never limits the person's OTHER slot: confirmed work
//   books beside it as if it weren't there, and the tentative entry gives
//   way (shrinks; the rest moves to the end of its item).
// - Tentative work schedules around confirmed work, and only one tentative
//   slot per person per day.
// - Job Summary: row coloured + "Tentative" tag; "Confirm Booking" (or
//   unticking Tentative in the Edit form) confirms all of the item's
//   tentative entries, warning first if anyone would go over their max.
import { launch, settle, cell, block, drag, button, input, select, newEntry, rows, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('tentative entries');
const D = n => businessDayStr(n);
const hoursBox = page => page.locator('div:has(> div:text-is("Hours to Deduct from Budget")) input[type=number]');
const sum = list => list.reduce((a, e) => a + Number(e.hours), 0);

// ---- 1. Schedule tentative; confirmed work books beside it; Confirm Booking
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones', { bg_color: '#DBEAFE', border_color: '#3B82F6', text_color: '#1E3A8A' })],
    sub_items: [item('iV', 'j1', 'Vanity', 16), item('iL', 'j2', 'Laundry', 8, 1)],
    entries: [],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await newEntry(page, 'Mark', D(1), 0, { itemId: 'iV' });
    await button(page, 'Tentative').click();
    await hoursBox(page).fill('16');
    await page.locator('button', { hasText: /^Schedule \d+ days$/ }).click();
    await settle(db, 2500);
    let v = rows(db, e => e.sub_item_id === 'iV');
    r.check('tentative schedule saved: 2 days of 8h, all tentative', v.length === 2 && v.every(e => e.is_tentative === true && Number(e.hours) === 8), v);
    const b = await block(page, 'Mark', D(1), 0);
    const style = await b.getAttribute('style');
    r.check('grid: "Tentative" label, faded, dashed border', (await b.innerText()).includes('Tentative') && /opacity: 0\.45/.test(style) && /dashed/.test(style), style);

    // Confirmed Laundry 8h into Mark's other slot on day 1: books in full.
    await newEntry(page, 'Mark', D(1), 1, { jobId: 'j2', itemId: 'iL' });
    await hoursBox(page).fill('8');
    await page.locator('button', { hasText: /^Schedule \d+ days?$/ }).click();
    await settle(db, 4000);
    r.check('no "Scheduling Conflict" pop-up (tentative takes no room)', await page.locator('text=⚠ Scheduling Conflict').count() === 0);
    const l = rows(db, e => e.sub_item_id === 'iL');
    r.check('confirmed Laundry booked 8h on day 1, not tentative', l.length === 1 && l[0].date_str === D(1) && Number(l[0].hours) === 8 && !l[0].is_tentative, l);
    v = rows(db, e => e.sub_item_id === 'iV' && Number(e.hours) > 0.05);
    r.check('tentative Vanity gave way: still 16h, none on day 1, moved on to day 3', sum(v) === 16 && !v.some(e => e.date_str === D(1)) && v.some(e => e.date_str === D(3)) && v.every(e => e.is_tentative), v);

    // Job Summary: tag + Confirm Booking (no one over max -> no warning).
    await page.locator('text=Job Summary').first().click();
    const row = page.locator('tr', { hasText: 'Vanity' });
    r.check('Job Summary row tagged "Tentative"', (await row.innerText()).includes('Tentative'));
    await row.locator('button', { hasText: 'Confirm Booking' }).click();
    await settle(db, 2500);
    r.check('no warning when nobody goes over', await page.locator('text=⚠ Confirm Booking').count() === 0);
    v = rows(db, e => e.sub_item_id === 'iV');
    r.check('Confirm Booking: every Vanity entry now confirmed', v.length > 0 && v.every(e => !e.is_tentative), v);
    r.check('Job Summary tag gone', !(await page.locator('tr', { hasText: 'Vanity' }).innerText()).includes('Tentative'));
  } catch (e) { r.error(e); }
  await browser.close();
}

// ---- 2. Tentative works around confirmed work; one tentative per day
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
    sub_items: [item('iV', 'j1', 'Vanity', 16), item('iL', 'j2', 'Laundry', 5, 1), item('iK', 'j2', 'Kitchen', 8, 2)],
    entries: [
      entry('L1', 's1', 'iL', D(1), 0, 5, { job_id: 'j2', hours_locked: true }),          // confirmed 5h, day 1
      entry('K2', 's1', 'iK', D(2), 0, 8, { job_id: 'j2', is_tentative: true }),          // another tentative, day 2
    ],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await newEntry(page, 'Mark', D(1), 1, { itemId: 'iV' });
    await button(page, 'Tentative').click();
    await hoursBox(page).fill('16');
    await page.locator('button', { hasText: /^Schedule \d+ days$/ }).click();
    await settle(db, 2500);
    const gap = page.locator('text=⚠ Break in schedule');
    if (await gap.count()) await button(page, 'Schedule Anyway').click();
    await settle(db, 2500);
    const v = rows(db, e => e.sub_item_id === 'iV').sort((a, b) => a.date_str.localeCompare(b.date_str));
    const d1 = v.find(e => e.date_str === D(1));
    r.check('day 1: only the 3h confirmed work leaves', d1 && Number(d1.hours) === 3, v);
    r.check('day 2 skipped (Mark already has a tentative entry there)', !v.some(e => e.date_str === D(2)), v);
    r.check('total 16h, all tentative', sum(v) === 16 && v.every(e => e.is_tentative), v);
  } catch (e) { r.error(e); }
  await browser.close();
}

// ---- 3. Confirming over someone's max: warning, Cancel, then Edit-form untick
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
    sub_items: [item('iV', 'j1', 'Vanity', 8), item('iL', 'j2', 'Laundry', 5, 1)],
    entries: [
      entry('L1', 's1', 'iL', D(1), 0, 5, { job_id: 'j2', hours_locked: true }),                 // confirmed 5h
      entry('V1', 's1', 'iV', D(1), 1, 8, { hours_locked: true, is_tentative: true }),           // tentative 8h, typed in
    ],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    r.check('before confirming: no red Conflict (tentative never puts the day over)', (await (await cell(page, 'Mark', D(1), 0)).locator('text=⚠ Conflict').count()) === 0);
    await (await block(page, 'Mark', D(1), 1)).click();
    await button(page, '✓ Tentative').click();
    r.check('Edit form says saving confirms the item', await page.locator('text=Saving confirms every tentative entry for Vanity.').count() === 1);
    await button(page, 'Save').click();
    const msg = page.locator('text=/^Confirming Vanity puts Mark over the 8hrs daily max on \\w{3} \\d{2} \\w{3}\\. Those days will show a conflict\\. Consider moving hours to the next day\\. Confirm anyway\\?$/');
    r.check('warning names the person, max and day', await msg.count() === 1);
    await button(page, 'Cancel').click();
    await settle(db, 1500);
    r.check('Cancel: nothing changed', rows(db, e => e.id === 'V1')[0].is_tentative === true);
    await button(page, 'Save').click();
    await button(page, 'Confirm Anyway').click();
    await settle(db, 3000);
    const v1 = rows(db, e => e.id === 'V1')[0], l1 = rows(db, e => e.id === 'L1')[0];
    r.check('Confirm Anyway: Vanity confirmed, both keep their hours, locked', !v1.is_tentative && Number(v1.hours) === 8 && Number(l1.hours) === 5 && v1.hours_locked && l1.hours_locked, [v1, l1]);
    r.check('red Conflict shows on that day', (await (await cell(page, 'Mark', D(1), 0)).locator('text=⚠ Conflict').count()) >= 1);
  } catch (e) { r.error(e); }
  await browser.close();
}
// ---- 4. Undo after Confirm Booking puts it back to tentative
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith')],
    sub_items: [item('iV', 'j1', 'Vanity', 8)],
    entries: [entry('V1', 's1', 'iV', D(1), 0, 8, { is_tentative: true })],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await page.locator('text=Job Summary').first().click();
    await page.locator('tr', { hasText: 'Vanity' }).locator('button', { hasText: 'Confirm Booking' }).click();
    await settle(db, 2000);
    r.check('confirmed', rows(db, e => e.sub_item_id === 'iV').every(e => !e.is_tentative));
    await page.locator('button', { hasText: /📅\s*Schedule/ }).first().click();
    await page.locator('button', { hasText: 'Undo' }).first().click();
    await settle(db, 2500);
    const v = rows(db, e => e.sub_item_id === 'iV');
    r.check('Undo: tentative again', v.length === 1 && v[0].is_tentative === true, v);
  } catch (e) { r.error(e); }
  await browser.close();
}

// ---- 5. Dragging confirmed work beside a tentative entry
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones', { bg_color: '#DBEAFE', border_color: '#3B82F6', text_color: '#1E3A8A' })],
    sub_items: [item('iV', 'j1', 'Vanity', 8), item('iL', 'j2', 'Laundry', 8, 1)],
    entries: [
      entry('V1', 's1', 'iV', D(1), 0, 8, { is_tentative: true }),
      entry('L3', 's1', 'iL', D(3), 1, 8, { job_id: 'j2' }),
    ],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await drag(page, db, await block(page, 'Mark', D(3), 1), await cell(page, 'Mark', D(1), 1), { dispatch: true });
    await settle(db, 4000);
    r.check('no "Scheduling Conflict" pop-up on the drag', await page.locator('text=⚠ Scheduling Conflict').count() === 0);
    const l = rows(db, e => e.id === 'L3')[0];
    r.check('Laundry moved beside it with its full 8h', l.date_str === D(1) && Number(l.hours) === 8, l);
    const v = rows(db, e => e.sub_item_id === 'iV' && Number(e.hours) > 0.05);
    r.check('tentative Vanity gave way: 8h kept, moved off day 1, still tentative', sum(v) === 8 && !v.some(e => e.date_str === D(1)) && v.every(e => e.is_tentative), v);
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
