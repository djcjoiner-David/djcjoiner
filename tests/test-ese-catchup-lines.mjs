// TESTING_NOTES 2F #10 (user's live review of Ian / Laundry W, Mon 19 Oct):
// 1. Edit form's other-slot line: "Ian 7.5 has 7hrs assigned on Mon 19 Oct
//    leaving 0.5hrs available for scheduling".
// 2. The Catch-up line shows only when editing a Catch-up entry, with THAT
//    entry's hours - it used to add up every Catch-up entry on the item
//    (4h on another day + this 0.5h showed "4.5hrs") and showed on normal
//    entries too.
import { launch, settle, block, button, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('edit form: other-slot line and Catch-up line');
const D = n => businessDayStr(n);
const seed = {
  staff: [staff('s1', 'Ian 7.5', 7.5, 0)],
  jobs: [job('j1', '101214', 'Driscoll')],
  sub_items: [item('iW', 'j1', 'Laundry W', 41)],
  entries: [
    entry('n1', 's1', 'iW', D(2), 1, 7, { hours_locked: true }),                                // normal 7h, slot 2
    entry('c1', 's1', 'iW', D(2), 0, 0.5, { is_catch_up: true, hours_locked: true }),          // Catch-up 0.5h, slot 1
    entry('c2', 's1', 'iW', D(4), 0, 4, { is_catch_up: true, hours_locked: true }),            // Catch-up 4h, another day
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await settle(db);
  // SS1: the 0.5h Catch-up entry
  await (await block(page, 'Ian 7.5', D(2), 0)).click();
  r.check('first line: "has 7hrs assigned on ... leaving 0.5hrs available for scheduling"',
    await page.locator('text=/^Ian 7\\.5 has 7hrs assigned on \\w{3} \\d{2} \\w{3} leaving 0\\.5hrs available for scheduling$/').count() === 1);
  const cu = page.locator('text=/Catch-up logged for this/');
  r.check('Catch-up line shows this entry\'s 0.5hrs, not the item\'s 4.5hrs',
    (await cu.count()) === 1 && (await cu.innerText()).trim() === '0.5hrs Catch-up logged for this entry, not deducted from item total hrs.',
    (await cu.count()) ? await cu.innerText() : 'none');
  await button(page, 'Cancel').click();
  // SS2: the normal 7h entry, same day
  await (await block(page, 'Ian 7.5', D(2), 1)).click();
  r.check('normal entry: "has 0.5hrs assigned on ... leaving 7hrs available for scheduling"',
    await page.locator('text=/^Ian 7\\.5 has 0\\.5hrs assigned on \\w{3} \\d{2} \\w{3} leaving 7hrs available for scheduling$/').count() === 1);
  r.check('normal entry: no Catch-up line', await page.locator('text=/Catch-up logged for this/').count() === 0);
  await button(page, 'Cancel').click();
} catch (e) { r.error(e); }
await browser.close();
r.done();
