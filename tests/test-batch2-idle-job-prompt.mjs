// PR #53 (Batch 2, 2F #6): a job whose latest entry is over a month old
// prompts "Job {no}, {name} most recent scheduled date is {date}. Do you
// want to close this Job?" - Close Job marks it Completed; Not Yet leaves
// it alone (passive Archived bucket unchanged).
import { launch, settle, button, staff, job, item, entry, iso, today, reporter } from './harness.mjs';

const r = reporter('Batch 2: idle-job close prompt');
const old = d => { const x = today(); x.setDate(x.getDate() - d); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1); return iso(x); };
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)],
  jobs: [job('j1', '101', 'Smith'), job('j2', '202', 'Jones')],
  sub_items: [item('i1', 'j1', 'Kitchen', 8), item('i2', 'j2', 'Laundry', 8, 1)],
  entries: [entry('k1', 's1', 'i1', old(45), 0, 8), entry('l1', 's1', 'i2', old(60), 0, 8, { job_id: 'j2' })],
};
const { browser, page, db } = await launch(seed, { weeks: null });
try {
  await page.waitForSelector('text=Job idle a month', { timeout: 10000 });
  const msg = await page.locator('text=/most recent scheduled date is/').innerText();
  r.check('prompt wording', /^Job (101, Smith|202, Jones) most recent scheduled date is \d{1,2} \w{3}\. Do you want to close this Job\?$/.test(msg.trim()), msg);
  const firstIsSmith = msg.includes('101, Smith');
  await button(page, 'Close Job').click();
  await settle(db);
  const closedId = firstIsSmith ? 'j1' : 'j2', otherId = firstIsSmith ? 'j2' : 'j1';
  r.check('Close Job marks it Completed', db.tables.jobs.find(j => j.id === closedId).completed === true);
  await page.waitForSelector('text=Job idle a month', { timeout: 10000 });
  await button(page, 'Not Yet').click();
  await settle(db);
  r.check('Not Yet leaves the other job open', db.tables.jobs.find(j => j.id === otherId).completed === false);
  r.check('no further prompt this session', await page.locator('text=Job idle a month').count() === 0);
  r.check('no entries changed or deleted', db.tables.entries.length === 2);
} catch (e) { r.error(e); }
await browser.close();
r.done();
