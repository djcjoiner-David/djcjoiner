// PR #52 (Batch 1, TESTING_NOTES 2F #1, #2, #4):
// - the grid opens on 4 Weeks, not 2;
// - Add Job's default colour walks the even presets then the odd ones
//   (red, lime, yellow, blue, fuchsia, orange, green, ...) instead of
//   strictly in order, so consecutive jobs look clearly different;
// - the Users button's icon is an SVG in the button's own text colour
//   (the 👥 emoji ignored CSS colour).
import { launch, settle, input, button, staff, job, reporter } from './harness.mjs';

const r = reporter('Batch 1: 4-week default, colour order, Users icon');
const seed = { staff: [staff('s1', 'Mark', 8, 0)], jobs: [job('j1', '101', 'Smith')], sub_items: [], entries: [] };
const { browser, page, db } = await launch(seed, { weeks: null });
try {
  const dayCols = await page.locator('table thead tr').last().locator('th').count() - 1;
  r.check('opens on 4 weeks (24 day columns)', dayCols === 24, dayCols);
  // 1 existing job -> next colour should be lime (index 2), then yellow (4).
  const posted = [];
  for (const [no, name] of [['102', 'Jones'], ['103', 'Brown']]) {
    await button(page, '+ Add Job').click();
    await input(page, 'Job Number').fill(no);
    await input(page, 'Job Name').fill(name);
    await button(page, 'Save Job').click();
    await settle(db);
    posted.push(db.tables.jobs.find(j => j.job_no === no)?.bg_color);
  }
  r.check('2nd job gets lime (skips orange)', posted[0] === '#F2FDD9', posted);
  r.check('3rd job gets yellow (skips green)', posted[1] === '#FEFBD6', posted);
  const users = page.locator('button', { hasText: 'Users' }).first();
  r.check('Users button has no emoji', !(await users.innerText()).includes('👥'), await users.innerText());
  r.check('Users icon is an SVG filled with currentColor', (await users.locator('svg[fill="currentColor"]').count()) === 1);
} catch (e) { r.error(e); }
await browser.close();
r.done();
