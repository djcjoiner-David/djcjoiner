// TESTING_NOTES 2E #16: the entry form's budget figures use the SELECTED
// item's own budget. Live example: editing Ian's Driscoll Laundry W
// Catch-up showed "(not counted in its 12h budget)" - the job's first item
// (Laundry S) - while the dropdown said "Laundry W (41h budget)". Same
// mistake made "+ Schedule" from Job Summary (where the form's number is
// the hours LEFT) wrongly offer Catch-up for an entry that still fits.
import { launch, settle, block, input, button, select, rows, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('entry form uses the selected item\'s own budget');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Ian', 7.5, 0)],
  jobs: [job('j1', '101214', 'Driscoll')],
  sub_items: [item('iS', 'j1', 'Laundry S', 12), item('iW', 'j1', 'Laundry W', 41, 1)],
  entries: [
    entry('w1', 's1', 'iW', D(2), 0, 7.5), entry('w2', 's1', 'iW', D(3), 0, 7.5), entry('w3', 's1', 'iW', D(4), 0, 7.5),
    entry('w4', 's1', 'iW', D(5), 0, 7.5),                                    // Laundry W: 30h of 41h used
    entry('c1', 's1', 'iW', D(5), 1, 0, { is_catch_up: true, hours_locked: true }),
    entry('c2', 's1', 'iW', D(6), 1, 1, { is_catch_up: true, hours_locked: true }),   // 1h Catch-up logged
  ],
};
const { browser, page, db } = await launch(seed);
try {
  // 1. edit the Catch-up entry: the note must say Laundry W's 41h
  await (await block(page, 'Ian', D(6), 1)).click();
  // (Wording since the form tidy-up: no budget figure at all, so it can't
  // show the wrong item's number.)
  const note = await page.locator('text=/Catch-up logged for this item/').innerText();
  r.check('note reads "1hr Catch-up logged for this item, not deducted from item total hrs."', note.trim() === '1hr Catch-up logged for this item, not deducted from item total hrs.', note);
  await button(page, 'Cancel').click();
  // 2. Job Summary "+ Schedule" on Laundry W (11h left): a 4h manual entry still fits - no Catch-up prompt
  await page.locator('text=Job Summary').first().click();
  await page.locator('tr', { hasText: 'Laundry W' }).locator('button', { hasText: '+ Schedule' }).click();
  await page.locator('label', { hasText: /^\s*Ian/ }).locator('input[type=checkbox]').check();
  await page.locator('label', { hasText: 'Auto-fill consecutive days' }).locator('input').uncheck();
  await page.locator('input[type="date"]').fill(D(8));
  await input(page, 'Hours').fill('4');
  await button(page, 'Save').click();
  await settle(db, 2500);
  r.check('no "All hours allocated" prompt (30h + 4h fits in 41h)', await page.locator('text=All hours allocated').count() === 0);
  const n = rows(db, e => e.date_str === D(8))[0];
  r.check('saved as a normal 4h entry, not Catch-up', n && Number(n.hours) === 4 && !n.is_catch_up, n);
} catch (e) { r.error(e); }
await browser.close();
r.done();
