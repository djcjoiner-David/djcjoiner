// TESTING_NOTES 2E #8: the phone once showed different hours/labels from
// desktop for the same entries (Catch-up "2h" -> "Overrun", "4h" -> "0.5h",
// Catch-up -> the item's "46h"). Investigation: there is one drawing path
// for both, so today they can't disagree - the phone was most likely an
// old, never-refreshed copy. This guards it: the same entries drawn at
// desktop, phone-portrait and phone-landscape size must show identical
// labels (the staff name box is allowed to differ).
import { launch, settle, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('phone and desktop show the same labels');
const D = businessDayStr;
const seed = {
  staff: [staff('s1', 'Ian', 7.5, 0), staff('s2', 'Mary', 6, 1), staff('s3', 'TJ', 7.5, 2), staff('s4', 'Mark', 8, 3), staff('s5', 'Chris', 4.5, 4)],
  jobs: [job('j1', '8675', 'Jenny'), job('j2', '101214', 'Driscoll', { bg_color: '#DBEAFE', border_color: '#3B82F6', text_color: '#1E3A8A' })],
  sub_items: [item('iLW', 'j1', 'Living W', 46), item('iLa', 'j2', 'Laundry', 15, 1), item('iK', 'j2', 'Kitchen', 20, 2)],
  entries: [
    // Laundry 15h fully used by Ian days 1-2; then a Catch-up 2h in his slot 2 on day 2
    entry('a1', 's1', 'iLa', D(1), 0, 7.5, { job_id: 'j2' }), entry('a2', 's1', 'iLa', D(2), 0, 7.5, { job_id: 'j2' }),
    entry('a3', 's1', 'iLa', D(2), 1, 2, { job_id: 'j2', is_catch_up: true, hours_locked: true }),
    // Living W: Mary days 1-5 (6h, last day 4h + Catch-up 2h), TJ days 1-3 + Catch-up 1.5h day 3
    entry('m1', 's2', 'iLW', D(1), 0, 6), entry('m2', 's2', 'iLW', D(2), 0, 6), entry('m3', 's2', 'iLW', D(3), 0, 6),
    entry('m4', 's2', 'iLW', D(4), 0, 4), entry('m5', 's2', 'iLW', D(4), 1, 2, { is_catch_up: true, hours_locked: true }),
    entry('t1', 's3', 'iLW', D(1), 0, 7.5), entry('t2', 's3', 'iLW', D(2), 0, 7.5), entry('t3', 's3', 'iLW', D(3), 0, 3),
    entry('t4', 's3', 'iLW', D(3), 1, 1.5, { is_catch_up: true, hours_locked: true }),
    // Kitchen 20h: Mark tentative 8+8+4, a misc beside on day 3, an overcommitted locked entry on day 5
    entry('k1', 's4', 'iK', D(1), 0, 8, { job_id: 'j2', is_tentative: true }), entry('k2', 's4', 'iK', D(2), 0, 8, { job_id: 'j2', is_tentative: true }),
    entry('k3', 's4', 'iK', D(3), 0, 4, { job_id: 'j2', is_tentative: true }),
    entry('x1', 's4', null, D(3), 1, 2, { job_id: null, misc_note: 'Wash Cars', hours_locked: true }),
    entry('o1', 's5', 'iK', D(5), 0, 4.5, { job_id: 'j2' }), entry('o2', 's5', null, D(5), 1, 4.5, { job_id: null, misc_note: 'Study Leave', hours_locked: true }),
  ],
};
async function labels(width, height) {
  const { browser, page, db } = await launch(seed, { width, height, weeks: 0 });
  try {
    await settle(db, 2000);
    await sleep(300);
    return await page.evaluate(() => {
      const res = {};
      let name = null, slot = 0;
      for (const tr of document.querySelectorAll('table tbody tr')) {
        const first = tr.children[0];
        const hasName = first && first.rowSpan === 2;
        if (hasName) { name = first.innerText.split('\n').map(s => s.trim()).find(s => s && s !== '⠿' && s !== 'Edit'); slot = 1; } else slot = 2;
        const cells = [...tr.children].slice(hasName ? 1 : 0);
        res[`${name} slot ${slot}`] = cells.map(td => td.innerText.trim().replace(/\s+/g, ' ')).filter(t => t && t !== '+' && t !== 'Hours Available');
      }
      return res;
    });
  } finally { await browser.close(); }
}
try {
  const desk = await labels(1800, 1100);
  for (const [label, w, h] of [['phone (portrait)', 390, 844], ['phone (landscape)', 844, 390]]) {
    const other = await labels(w, h);
    for (const k of Object.keys(desk)) r.check(`${label}: ${k} matches desktop`, JSON.stringify(desk[k]) === JSON.stringify(other[k]), { desktop: desk[k], [label]: other[k] });
  }
} catch (e) { r.error(e); }
r.done();
