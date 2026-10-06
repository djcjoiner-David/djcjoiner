// TESTING_NOTES 2F #16: grid tidy-ups (user's choices after mock-ups).
// 1. "Week of ..." heading on one line, readable across its week's columns.
// 2. Quiet empty slots (mouse): blank until pointed at; Saturday stays blank
//    (nothing to click); "Hours Available" always shows; every slot shows
//    while an entry is being dragged.
// 3. Job Summary: clicking an item's name opens the Schedule at its first
//    day and briefly rings all of its entries.
import { launch, settle, cell, block, button, staff, job, item, entry, businessDayStr, reporter, sleep } from './harness.mjs';

const r = reporter('grid tidy-ups');
const D = n => businessDayStr(n);
const ring = el => el.evaluate(e => getComputedStyle(e).boxShadow);
const colour = loc => loc.evaluate(e => getComputedStyle(e).color);
const blankSlot = async (page, name, ds, slot) => (await cell(page, name, ds, slot)).locator('div').filter({ hasText: /^\+$/ }).first();

{
  const seed = {
    staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Ian', 8, 1)],
    jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones', { bg_color: '#DBEAFE', border_color: '#3B82F6', text_color: '#1E3A8A' })],
    sub_items: [item('iV', 'j1', 'Vanity', 6), item('iK', 'j2', 'Kitchen', 24, 1), item('iL', 'j2', 'Laundry', 10, 2)],
    entries: [
      entry('v1', 's1', 'iV', D(1), 0, 6, { hours_locked: true }),
      entry('k1', 's2', 'iK', D(8), 0, 8, { job_id: 'j2' }), entry('k2', 's2', 'iK', D(9), 0, 8, { job_id: 'j2' }), entry('k3', 's1', 'iK', D(9), 0, 8, { job_id: 'j2' }),
    ],
  };
  const { browser, page, db } = await launch(seed, { weeks: 4 });
  try {
    await settle(db);
    // 1. Week heading
    const banner = page.locator('thead th div', { hasText: /^Week of / }).nth(1);
    const box = await banner.boundingBox();
    r.check('"Week of ..." on one line', box.height <= 24, box);
    const onTop = await banner.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()]; const last = rects[rects.length - 1];
      const hit = document.elementFromPoint(last.right - 2, last.top + last.height / 2);
      return el.contains(hit) || hit === el;
    });
    r.check('its full text is visible (not hidden under the next day)', onTop);
    // the heading must not make its Monday wider than the rest of an empty week (week 4)
    const w = await page.evaluate(() => {
      const hdr = [...document.querySelectorAll('table thead tr')].pop();
      const ths = [...hdr.children].filter(th => /^\s*Week of /.test(th.innerText));
      const mon = ths[3]; const tue = mon.nextElementSibling;
      return [mon.getBoundingClientRect().width, tue.getBoundingClientRect().width];
    });
    r.check('the heading doesn\'t widen its Monday (empty week: Mon about the same as Tue)', w[0] < w[1] * 1.2, w);

    // 2. Quiet empty slots
    const slot = await blankSlot(page, 'Mark', D(3), 1);
    r.check('empty slot is blank at rest', await colour(slot) === 'rgba(0, 0, 0, 0)', await colour(slot));
    await slot.hover(); await sleep(200);
    r.check('pointing at it shows the "+"', await colour(slot) === 'rgb(148, 163, 184)', await colour(slot));
    await page.mouse.move(5, 5); await sleep(200);
    r.check('blank again when the pointer leaves', await colour(slot) === 'rgba(0, 0, 0, 0)');
    const sat = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const satSlot = await blankSlot(page, 'Mark', sat, 0);
    await satSlot.hover(); await sleep(200);
    r.check('Saturday stays blank on hover (nothing to click)', await colour(satSlot) === 'rgba(0, 0, 0, 0)');
    const avail = (await cell(page, 'Mark', D(1), 1)).locator('div', { hasText: /^Hours\s*Available$/ }).first();
    r.check('"Hours Available" still shows', await avail.count() === 1 && await colour(avail) !== 'rgba(0, 0, 0, 0)');
    // while dragging, every empty slot shows
    const src = await block(page, 'Mark', D(1), 0);
    await src.evaluate(el => { const dt = new DataTransfer(); el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); });
    await sleep(300);
    r.check('while dragging: empty slots show their "+"', await colour(slot) !== 'rgba(0, 0, 0, 0)', await colour(slot));
    await src.evaluate(el => el.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    await sleep(300);
    r.check('after the drag: blank again', await colour(slot) === 'rgba(0, 0, 0, 0)');

    // 3. Job Summary -> item
    await page.locator('button', { hasText: /^1 Week$/ }).click(); await sleep(300);
    r.check('Kitchen is not on screen to start with (1 week view)', await page.locator('[data-entry-id="k1"]').count() === 0);
    await page.locator('text=Job Summary').first().click(); await sleep(300);
    r.check('a scheduled item\'s name is clickable', await page.locator('tr', { hasText: 'Vanity' }).locator('span[role=button]', { hasText: 'Vanity' }).count() === 1);
    r.check('an unscheduled item\'s name is not', await page.locator('tr', { hasText: 'Laundry' }).locator('span[role=button]').count() === 0);
    await page.locator('tr', { hasText: 'Kitchen' }).locator('span[role=button]', { hasText: 'Kitchen' }).click();
    await sleep(700);
    r.check('Schedule tab shows Kitchen\'s first day', await page.locator('[data-entry-id="k1"]').count() === 1);
    const shown = page.locator('[data-entry-id^="k"]');
    const rings = await shown.evaluateAll(els => els.map(e => getComputedStyle(e).boxShadow));
    r.check('every Kitchen entry on screen is ringed', rings.length >= 1 && rings.every(s => /29, 78, 216/.test(s)), rings);
    await sleep(3000);
    const after = await shown.evaluateAll(els => els.map(e => getComputedStyle(e).boxShadow));
    r.check('the ring fades away by itself', after.every(s => s === 'none'), after);
    // already on screen: weeks don't move
    const range0 = await page.locator('table thead th').nth(1).innerText();
    await page.locator('text=Job Summary').first().click(); await sleep(300);
    await page.locator('tr', { hasText: 'Kitchen' }).locator('span[role=button]', { hasText: 'Kitchen' }).click(); await sleep(500);
    const range1 = await page.locator('table thead th').nth(1).innerText();
    r.check('if it is already on screen, the weeks don\'t move', range0 && range0 === range1, [range0, range1]);
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
