// TESTING_NOTES 2F #11: Settings button (admin only). Colour Theme and
// Company Branding moved here from User Management; Work Hours moved here
// from the header, now saved for everyone, in 15-minute steps, with an
// unpaid lunch (15m-2h) taken off; Public Holidays region (country/state).
import { launch, settle, button, select, staff, reporter, sleep } from './harness.mjs';

const r = reporter('Settings button');
const hdr = page => page.locator('button', { hasText: /^\s*Settings\s*$/ });
const seed = { staff: [staff('s1', 'Mark', 8, 0)], jobs: [], sub_items: [], entries: [], app_settings: [{ id: 1 }] };

{
  const { browser, page, db } = await launch(seed);
  try {
    await settle(db);
    r.check('admin sees a Settings button', await hdr(page).count() === 1);
    r.check('old 🕐 work-hours button gone from the header', await page.locator('button', { hasText: '🕐' }).count() === 0);
    await page.locator('button', { hasText: 'Users' }).first().click();
    await sleep(500);
    r.check('User Management no longer has Colour Theme / Company Branding',
      await page.locator('text=Colour Theme').count() === 0 && await page.locator('text=Company Branding').count() === 0);
    await button(page, '×').click();
    await hdr(page).click();
    await sleep(300);
    for (const t of ['Colour Theme', 'Company Branding', 'Work Hours', 'Public Holidays'])
      r.check(`Settings has "${t}"`, await page.locator(`text=${t}`).count() >= 1);
    r.check('defaults: 07:00-15:30, 30m lunch = 8hrs paid', await page.locator('text=07:00–15:30, 30m lunch = 8hrs paid').count() === 1);
    const startOpts = await select(page, 'Start').locator('option').allInnerTexts();
    r.check('start time in 15-minute steps', startOpts.includes('07:15') && startOpts.includes('07:45') && !startOpts.includes('07:10'), startOpts.slice(28, 32));
    const lunchOpts = await select(page, 'Unpaid Lunch').locator('option').allInnerTexts();
    r.check('lunch 15m to 2h in 15-minute steps', JSON.stringify(lunchOpts) === JSON.stringify(['15m', '30m', '45m', '1h', '1h 15m', '1h 30m', '1h 45m', '2h']), lunchOpts);
    await select(page, 'Start').selectOption('07:15');
    await select(page, 'Unpaid Lunch').selectOption('45');
    await select(page, 'State / Territory').selectOption('NSW');
    await settle(db, 1000);
    const row = db.tables.app_settings[0];
    r.check('saved: start 07:15, lunch 45, region AU-NSW', row.work_start === '07:15' && Number(row.lunch_minutes) === 45 && row.holiday_region === 'AU-NSW', row);
    r.check('shows 07:15-15:30, 45m lunch = 7.5hrs paid', await page.locator('text=07:15–15:30, 45m lunch = 7.5hrs paid').count() === 1);
  } catch (e) { r.error(e); }
  await browser.close();
}

// Saved values come back after a reload (they used to reset every time).
{
  const { browser, page, db } = await launch({ ...seed, app_settings: [{ id: 1, work_start: '06:30', work_end: '15:00', lunch_minutes: 60, holiday_region: 'AU-NSW' }] });
  try {
    await settle(db);
    await hdr(page).click();
    await sleep(300);
    r.check('loads saved hours: 06:30-15:00, 1h lunch = 7.5hrs paid', await page.locator('text=06:30–15:00, 1h lunch = 7.5hrs paid').count() === 1);
    r.check('loads saved state: NSW', (await select(page, 'State / Territory').inputValue()) === 'NSW');
  } catch (e) { r.error(e); }
  await browser.close();
}

// Not an admin: no Settings button.
{
  const { browser, page, db } = await launch(seed, { role: 'manager' });
  try {
    await settle(db);
    r.check('manager sees no Settings button', await hdr(page).count() === 0);
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
