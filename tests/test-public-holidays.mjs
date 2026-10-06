// TESTING_NOTES 2F #9b: public holidays (user's rules).
// - Load themselves for the state chosen in Settings (here NSW) from the
//   online list - a stand-in list here. NSW Bank Holiday and other states'
//   days are left out.
// - Grey "Public Holiday" block on the grid (no holiday name).
// - Auto-fill skips them like a weekend; a gap across one isn't a "break".
// - Work put on one by hand asks first (Schedule Anyway / Go Back).
// - Work that was already booked on one: a pop-up, and Move Forward moves
//   that person's work from that day on by the working days lost.
// - Settings lists them; Remove / Add Day.
import { launch, settle, cell, block, drag, button, select, newEntry, rows, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('public holidays');
const D = n => businessDayStr(n);
const hoursBox = page => page.locator('div:has(> div:text-is("Hours")) input[type=number]');
const holidayList = [
  { date: D(2), localName: 'Test Day', name: 'Test Day', global: true, counties: null, types: ['Public'] },
  { date: D(4), localName: 'Bank Holiday', name: 'Bank Holiday', global: false, counties: ['AU-NSW'], types: ['Bank'] },
  { date: D(6), localName: 'Queensland Day', name: 'Queensland Day', global: false, counties: ['AU-QLD'], types: ['Public'] },
];
const nager = ['**/date.nager.at/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(holidayList) })];
const settings = [{ id: 1, holiday_region: 'AU-NSW' }];

// ---- 1. Loading, grid, auto-fill, manual warning, Settings list
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith')],
    sub_items: [item('iV', 'j1', 'Vanity', 24), item('iK', 'j1', 'Kitchen', 8, 1)],
    entries: [], app_settings: settings, days_off: [],
  };
  const { browser, page, db } = await launch(seed, { routes: [nager] });
  try {
    await settle(db, 2500);
    const off = db.tables.days_off.filter(d => !d.removed);
    r.check('loads the NSW public holiday only (no Bank Holiday, no QLD day)', off.length === 1 && off[0].date_str === D(2) && off[0].kind === 'public_holiday', off);
    const hcell = await cell(page, 'Mark', D(2), 0);
    r.check('grid shows "Public Holiday" (not the holiday name)', (await hcell.innerText()).trim() === 'Public Holiday', await hcell.innerText());

    await newEntry(page, 'Mark', D(1), 0, { itemId: 'iV' });
    await hoursBox(page).fill('24');
    await page.locator('button', { hasText: /^Schedule \d+ days$/ }).click();
    await settle(db, 2500);
    r.check('no "Break in schedule" across the holiday', await page.locator('text=⚠ Break in schedule').count() === 0);
    const v = rows(db, e => e.sub_item_id === 'iV').map(e => e.date_str).sort();
    r.check('auto-fill skips the holiday: days 1, 3, 4', JSON.stringify(v) === JSON.stringify([D(1), D(3), D(4)]), v);

    // By hand onto the holiday: asks first.
    await (await cell(page, 'Mark', D(2), 0)).locator('div').first().click();
    await page.locator('select').filter({ has: page.locator('option', { hasText: '— Select job —' }) }).selectOption('j1');
    await select(page, 'Joinery Item').selectOption('iK');
    await page.locator('label', { hasText: 'Auto-fill consecutive days' }).locator('input').uncheck();
    await button(page, 'Save').click();
    r.check('warning "⚠ Day Off" names Mark and the day', await page.locator('text=⚠ Day Off').count() === 1 && await page.locator('text=/Mark - \\w{3} \\d{2} \\w{3} \\(Public Holiday\\)/').count() === 1);
    await button(page, 'Go Back').click();
    await settle(db, 1000);
    r.check('Go Back: nothing saved', rows(db, e => e.date_str === D(2)).length === 0);
    await button(page, 'Save').click();
    await button(page, 'Schedule Anyway').click();
    await settle(db, 2500);
    r.check('Schedule Anyway: saved on the holiday', rows(db, e => e.date_str === D(2) && e.sub_item_id === 'iK').length === 1);
    r.check('no "Move Forward" pop-up for work put there on purpose', await page.locator('text=⚠ Work booked on a day off').count() === 0);

    // Settings: listed, Remove, Add Day
    await page.locator('button', { hasText: /^\s*Settings\s*$/ }).click();
    await sleep(400);
    r.check('Settings lists the holiday', await page.locator('text=Test Day').count() === 1);
    await page.locator('div', { hasText: /Test Day/ }).locator('button', { hasText: 'Remove' }).last().click();
    await settle(db, 1000);
    r.check('Remove: marked removed (not re-added later)', db.tables.days_off.find(d => d.date_str === D(2)).removed === true);
    await page.locator('input[type="date"]').last().fill(D(7));
    await button(page, 'Add Day').click();
    await settle(db, 1000);
    r.check('Add Day: saved', db.tables.days_off.some(d => d.date_str === D(7) && !d.removed && d.kind === 'public_holiday'));
    await button(page, '×').click();
    r.check('removed holiday no longer grey on the grid', !(await (await cell(page, 'Mark', D(3), 1)).innerText()).includes('Public Holiday'));
  } catch (e) { r.error(e); }
  await browser.close();
}

// ---- 2. Work already booked on the holiday: Move Forward
{
  const seed = {
    staff: [staff('s1', 'Ian', 8, 0), staff('s2', 'David', 8, 1)],
    jobs: [job('j1', '101', 'Driscoll'), job('j2', '202', 'Jones')],
    sub_items: [item('iV', 'j1', 'Vanity', 24), item('iL', 'j2', 'Laundry', 8, 1), item('iD', 'j2', 'Desk', 8, 2)],
    entries: [
      entry('a', 's1', 'iV', D(1), 0, 8), entry('b', 's1', 'iV', D(2), 0, 8), entry('c', 's1', 'iV', D(3), 0, 8),
      entry('d', 's1', 'iL', D(4), 0, 8, { job_id: 'j2' }),                      // Ian's next job
      entry('x', 's2', 'iD', D(3), 0, 8, { job_id: 'j2' }),                      // David: nothing on the holiday
    ],
    app_settings: settings, days_off: [],
  };
  // weeks: 0 - the pop-up opens straight away; the app already shows 4 weeks.
  const { browser, page, db } = await launch(seed, { routes: [nager], weeks: 0 });
  try {
    await settle(db, 2500);
    r.check('pop-up lists Ian on the holiday', await page.locator('text=⚠ Work booked on a day off').count() === 1 && await page.locator('text=/Ian - \\w{3} \\d{2} \\w{3} \\(Public Holiday\\)/').count() === 1);
    await button(page, 'Move Forward').click();
    await settle(db, 3000);
    const at = id => rows(db, e => e.id === id)[0].date_str;
    r.check('Ian: day 1 stays; holiday day -> 3, 3 -> 4, next job 4 -> 5', at('a') === D(1) && at('b') === D(3) && at('c') === D(4) && at('d') === D(5), ['a', 'b', 'c', 'd'].map(at));
    r.check('David (nothing on the holiday) does not move', at('x') === D(3));
    await page.locator('button', { hasText: 'Undo' }).first().click();
    await settle(db, 2500);
    // (Undo may recreate rows under new ids - check by item and date.)
    const ian = rows(db, e => e.staff_id === 's1').map(e => `${e.sub_item_id}@${e.date_str}`).sort();
    r.check('Undo puts them back', JSON.stringify(ian) === JSON.stringify([`iL@${D(4)}`, `iV@${D(1)}`, `iV@${D(2)}`, `iV@${D(3)}`].sort()), ian);
  } catch (e) { r.error(e); }
  await browser.close();
}
// ---- 3. Dragging work onto a holiday asks first
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith')],
    sub_items: [item('iK', 'j1', 'Kitchen', 8)],
    entries: [entry('k', 's1', 'iK', D(3), 0, 8)],
    app_settings: settings, days_off: [],
  };
  const { browser, page, db } = await launch(seed, { routes: [nager] });
  try {
    await settle(db, 2500);
    await drag(page, db, await block(page, 'Mark', D(3), 0), await cell(page, 'Mark', D(2), 0), { dispatch: true });
    r.check('drag onto the holiday: "⚠ Day Off" asks first', await page.locator('text=⚠ Day Off').count() === 1);
    await button(page, 'Go Back').click();
    await settle(db, 1500);
    r.check('Go Back: not moved', rows(db, e => e.id === 'k')[0].date_str === D(3));
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
