// TESTING_NOTES 2F #14 (user's request): the app works on a phone held
// sideways - no "please rotate" screen, a slim header and toolbar, shorter
// rows so more people fit. Portrait phone and desktop are unchanged.
import { launch, settle, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('phone in landscape');
const D = businessDayStr;
const names = ['David 7', 'Mark 6.5', 'Ian 7.5', 'Mary 6', 'Chris 4.5', 'Jeff 5'];
const seed = { staff: names.map((n, i) => staff('s' + i, n, 7, i)), jobs: [job('j1', '101214', 'Driscoll')], sub_items: [item('i1', 'j1', 'Vanity W', 60)], entries: [] };
for (let s = 0; s < 6; s++) for (let d = 1; d <= 5; d++) seed.entries.push(entry(`e${s}_${d}`, 's' + s, 'i1', D(d), 0, 7));
async function look(width, height) {
  const { browser, page, db } = await launch(seed, { width, height, weeks: 0 });
  try {
    await settle(db);
    await sleep(300);
    return await page.evaluate(() => {
      const header = document.querySelector('img[alt="Logo"]').closest('div[style*="background"]');
      const staffCells = [...document.querySelectorAll('table tbody td')].filter(td => td.rowSpan === 2);
      return {
        rotate: document.body.innerText.includes('Please rotate'),
        headerH: Math.round(header.getBoundingClientRect().height),
        subtitle: document.body.innerText.includes('Production Schedule'),
        staffInView: staffCells.filter(td => td.getBoundingClientRect().top < innerHeight - 10).length,
      };
    });
  } finally { await browser.close(); }
}
try {
  const land = await look(844, 390);
  r.check('landscape: no "Please rotate" screen, grid shows', !land.rotate && land.staffInView > 0, land);
  r.check('landscape: header is slim (under 40px)', land.headerH < 40, land);
  r.check('landscape: tagline/subtitle hidden', !land.subtitle, land);
  r.check('landscape: at least 4 people on screen', land.staffInView >= 4, land);
  const port = await look(390, 844);
  r.check('portrait phone unchanged: normal header with "Production Schedule"', port.headerH >= 50 && port.subtitle, port);
} catch (e) { r.error(e); }
r.done();
