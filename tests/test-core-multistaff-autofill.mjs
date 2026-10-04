// Core multi-staff auto-fill (commits 1082d76, 842cf81, a036c8c): several
// staff auto-filled together work the item day by day TOGETHER (no one idle
// while another works), each at their own daily hours; and if their start
// dates end up more than 2 working days apart, a "Schedule Confirmation"
// pop-up asks first - Go Back saves nothing.
import { launch, settle, newEntry, button, rows, itemTotal, staff, job, item, entry, businessDayStr, reporter } from './harness.mjs';

const r = reporter('core: multi-staff auto-fill + stagger confirmation');
const D = n => businessDayStr(n);
const base = extra => ({
  staff: [staff('s1', 'Mark', 8, 0), staff('s2', 'Jenny', 6, 1)],
  jobs: [job('j1', '101', 'Smith')],
  sub_items: [item('i1', 'j1', 'Kitchen', 28), item('i2', 'j1', 'Pantry', 48, 1), item('i3', 'j1', 'Vanity', 60, 2)],
  entries: extra,
});
async function startBoth(page, itemId = 'i1') {
  await newEntry(page, 'Mark', D(2), 0, { itemId, autoFill: true });
  await page.locator('label', { hasText: /^\s*Jenny/ }).locator('input[type=checkbox]').check();
  await button(page, /^Schedule 2 staff$/).click();
}
{
  const { browser, page, db } = await launch(base([]));
  try {
    await startBoth(page);
    await settle(db, 3000);
    const k = rows(db, e => e.sub_item_id === 'i1');
    const h = (sid, d) => Number(k.find(e => e.staff_id === sid && e.date_str === d)?.hours);
    r.check('together: Mark 8h + Jenny 6h on day 2', h('s1', D(2)) === 8 && h('s2', D(2)) === 6, k);
    r.check('together: Mark 8h + Jenny 6h on day 3', h('s1', D(3)) === 8 && h('s2', D(3)) === 6, k);
    r.check('together: exactly 28h, finished in 2 days', itemTotal(db, 'i1') === 28 && k.every(e => e.date_str <= D(3)), k);
  } catch (e) { r.error(e); }
  await browser.close();
}
{
  // Jenny fully booked for days 2-5 (both slots) -> she can't start until
  // day 6. Vanity (60h) is big enough that she's still needed by then.
  const busy = [];
  for (let n = 2; n <= 5; n++) busy.push(entry(`p${n}a`, 's2', 'i2', D(n), 0, 3), entry(`p${n}b`, 's2', 'i2', D(n), 1, 3));
  const { browser, page, db } = await launch(base(busy));
  try {
    await startBoth(page, 'i3');
    r.check('stagger: confirmation pop-up shown', await page.locator('text=⚠ Schedule Confirmation').count() > 0);
    await button(page, 'Go Back').click();
    await settle(db, 2000);
    r.check('stagger: Go Back saves nothing', rows(db, e => e.sub_item_id === 'i3').length === 0);
  } catch (e) { r.error(e); }
  await browser.close();
}
r.done();
