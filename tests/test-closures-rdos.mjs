// TESTING_NOTES 2F #9c: Annual Closure and RDOs (user's rules).
// Closure: Settings, a date range for all staff, grey "Annual Closure";
// any day can be hidden from the grid on its own (still a day off);
// scheduling skips it. RDO: the entry form's RDO tab, ticked staff, one
// date; grey "RDO" for those staff only; clicking one asks to remove it;
// work already booked gets Move Forward.
import { launch, settle, cell, block, button, newEntry, rows, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('closures and RDOs');
const D = n => businessDayStr(n);
const hoursBox = page => page.locator('div:has(> div:text-is("Hours to Deduct from Budget")) input[type=number]');
const headerHas = (page, ds) => page.evaluate(ds => {
  const d = new Date(ds + 'T00:00:00');
  const label = `${d.toLocaleDateString('en-AU', { weekday: 'short' })} ${d.getDate()}`;
  return [...document.querySelectorAll('thead th')].some(th => th.innerText.split('\n').some(l => l.trim() === label));
}, ds);

// ---- 1. Annual Closure
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0)],
    jobs: [job('j1', '101', 'Smith')],
    sub_items: [item('iV', 'j1', 'Vanity', 16)],
    entries: [], app_settings: [{ id: 1 }], days_off: [],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await page.locator('button', { hasText: /^\s*Settings\s*$/ }).click();
    await sleep(300);
    const dates = page.locator('input[type="date"]');
    await page.locator('div:has(> div:text-is("From")) > input').fill(D(3));
    await page.locator('div:has(> div:text-is("To")) > input').fill(D(5));
    await button(page, 'Add Closure').click();
    await settle(db, 1000);
    const c = db.tables.days_off.filter(d => d.kind === 'closure');
    r.check('closure saved for every working day in the range', [D(3), D(4), D(5)].every(ds => c.some(d => d.date_str === ds)) && c.every(d => !d.staff_ids), c.map(d => d.date_str));
    // Hide just the middle day
    await page.locator('label', { hasText: new RegExp(`^\\s*${await page.evaluate(ds => new Date(ds + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short' }).replace(',', ''), D(4))}\\s*Hide`) }).locator('input').check();
    await settle(db, 1000);
    r.check('Hide ticked for that day only', db.tables.days_off.filter(d => d.hidden).map(d => d.date_str).join() === D(4), db.tables.days_off.filter(d => d.hidden));
    await button(page, '×').click();
    await sleep(300);
    r.check('hidden day gone from the grid; first and last still showing', !(await headerHas(page, D(4))) && await headerHas(page, D(3)) && await headerHas(page, D(5)));
    r.check('grid shows "Annual Closure"', (await (await cell(page, 'Mark', D(3), 0)).innerText()).trim() === 'Annual Closure');
    // Scheduling skips it (hidden day included)
    await newEntry(page, 'Mark', D(2), 0, { itemId: 'iV' });
    await hoursBox(page).fill('16');
    await page.locator('button', { hasText: /^Schedule \d+ days$/ }).click();
    await settle(db, 2500);
    const v = rows(db, e => e.sub_item_id === 'iV').map(e => e.date_str).sort();
    r.check('auto-fill skips the closure (hidden day too): days 2 and 6', JSON.stringify(v) === JSON.stringify([D(2), D(6)]), v);
    r.check('no "Break in schedule" across the closure', await page.locator('text=⚠ Break in schedule').count() === 0);
    // Show All, then Remove
    await page.locator('button', { hasText: /^\s*Settings\s*$/ }).click();
    await sleep(300);
    await button(page, 'Show All').click();
    await settle(db, 1000);
    r.check('Show All: nothing hidden', !db.tables.days_off.some(d => d.hidden));
    await page.locator('button', { hasText: /^Remove$/ }).first().click();
    await settle(db, 1000);
    r.check('Remove: the whole closure removed', db.tables.days_off.filter(d => d.kind === 'closure').every(d => d.removed));
  } catch (e) { r.error(e); }
  await browser.close();
}

// ---- 2. RDOs
{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
    jobs: [job('j1', '101', 'Smith')],
    sub_items: [item('iV', 'j1', 'Vanity', 8)],
    entries: [entry('i1', 's2', 'iV', D(2), 0, 8)],
    app_settings: [{ id: 1 }], days_off: [],
  };
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    await (await cell(page, 'Mark', D(2), 0)).click();
    await page.locator('button', { hasText: /^RDO$/ }).click();
    await page.locator('label', { hasText: /^\s*Ian\s*$/ }).locator('input').check();
    await button(page, 'Save RDO').click();
    await settle(db, 2000);
    const rdo = db.tables.days_off.filter(d => d.kind === 'rdo');
    r.check('RDO saved for Mark and Ian on that date', rdo.length === 1 && rdo[0].date_str === D(2) && rdo[0].staff_ids.split(',').sort().join() === 's1,s2', rdo);
    r.check('Ian had work there: Move Forward pop-up', await page.locator('text=⚠ Work booked on a day off').count() === 1 && await page.locator('text=/Ian - \\w{3} \\d{2} \\w{3} \\(RDO\\)/').count() === 1);
    await button(page, 'Move Forward').click();
    await settle(db, 2500);
    r.check('Ian\'s work moved to the next working day', rows(db, e => e.staff_id === 's2')[0].date_str === D(3), rows(db, e => e.staff_id === 's2'));
    r.check('grid: Mark shows "RDO"', (await (await cell(page, 'Mark', D(2), 0)).innerText()).trim() === 'RDO');
    r.check('RDO is only for those staff (header not shaded for everyone)', !(await page.evaluate(() => [...document.querySelectorAll('thead th')].some(th => th.style.background.includes('226, 232, 240')))));
    await (await cell(page, 'Mark', D(2), 0)).locator('div').first().click();
    r.check('clicking it asks "Remove this RDO for Mark..."', await page.locator('text=/^Remove this RDO for Mark on \\w{3} \\d{2} \\w{3}\\?$/').count() === 1);
    await button(page, 'Remove RDO').click();
    await settle(db, 1500);
    const after = db.tables.days_off.filter(d => d.kind === 'rdo')[0];
    r.check('removed for Mark only; Ian keeps it', after.staff_ids === 's2' && !after.removed, after);
    r.check('Mark\'s day is clear again', !(await (await cell(page, 'Mark', D(2), 0)).innerText()).includes('RDO'));
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
