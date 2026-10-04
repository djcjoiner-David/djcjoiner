// PR #53 (Batch 2, 2F #5): admin can reset an existing user's password
// from the Users screen (it could only be set at creation before).
import { launch, settle, button, staff, reporter } from './harness.mjs';

const r = reporter('Batch 2: admin password reset');
const seed = {
  staff: [staff('s1', 'Mark', 8, 0)], jobs: [], sub_items: [], entries: [],
  user_roles: [
    { id: 'u1', email: 'admin@x', role: 'admin', name: 'Admin', created_at: '2026-01-01' },
    { id: 'u2', email: 'tj@x', role: 'manager', name: 'TJ', created_at: '2026-01-02' },
  ],
};
const { browser, page, db } = await launch(seed);
try {
  await page.locator('button', { hasText: 'Users' }).first().click();
  const row = page.locator('tr', { hasText: 'tj@x' });
  await row.locator('button', { hasText: 'Reset Password' }).click();
  await row.locator('input[placeholder="New password"]').fill('n3w-Pass!');
  await row.locator('button', { hasText: /^Save$/ }).click();
  await settle(db);
  const p = db.log.find(l => l.method === 'PATCH' && l.t === 'user_roles');
  r.check('PATCH sent for that user only', p && p.params.id === 'eq.u2', p);
  r.check('new password sent', p && p.body.password === 'n3w-Pass!', p);
  r.check('only the password changed', p && Object.keys(p.body).join() === 'password', p);
} catch (e) { r.error(e); }
await browser.close();
r.done();
