// MES-2.8 — kiosk offline e2e (AC-2.8.3 + Patch N4 ER4).
// Goes online, taps Start; goes offline, queues 3 mutations; goes back
// online, asserts they flush in order, server ends DONE, idempotency
// ledger has the right rows.
import {
  test,
  expect,
  preloadSession,
  readAuditEvents,
  readOpStatus,
  readIdempotencyLedgerCount,
  TEST_WO_CODE,
} from './_fixtures.js';

test('3 offline mutations flush in order on reconnect; server ends DONE', async ({
  page,
  context,
  seeded,
}) => {
  await preloadSession(page, seeded.machineCode, seeded.jwt, seeded.jti);
  await page.getByTestId(`op-row-${TEST_WO_CODE}`).click();
  await expect(page.getByTestId('op-btn-start')).toBeVisible();

  // Online: tap Start to land in SETUP.
  await page.getByTestId('op-btn-start').click();
  await expect(page.getByTestId('op-status')).toHaveText('SETUP');
  await page.getByTestId('op-btn-begin-run').click();
  await expect(page.getByTestId('op-status')).toHaveText('RUNNING');

  // Connectivity badge starts green.
  await expect(page.getByTestId('conn-badge')).toHaveAttribute('data-state', 'green');

  // Go offline. Optimistic transitions still flip status; queue grows.
  await context.setOffline(true);

  // Mutation 1: pause(reason)
  await page.getByTestId('op-btn-pause').click();
  await page.getByTestId('reason-tile-SHIFT_END').click();
  await expect(page.getByTestId('op-status')).toHaveText('PAUSED');

  // Mutation 2: resume
  await page.getByTestId('op-btn-resume').click();
  await expect(page.getByTestId('op-status')).toHaveText('RUNNING');

  // Mutation 3: complete
  await page.getByTestId('op-btn-complete').click();
  await page.getByTestId('op-btn-complete-confirm').click();
  await expect(page.getByTestId('op-status')).toHaveText('DONE');

  // Patch N4 ER4 — connectivity badge transitions to amber while
  // mutations are queued (still offline + pending entries).
  await expect(page.getByTestId('conn-badge')).toHaveAttribute('data-state', 'amber');

  // Reconnect. Queue driver fires on `online` event, flushes all 3
  // sequentially.
  await context.setOffline(false);

  // Wait until queue drains AND badge returns to green. The driver's
  // setInterval is 30s but the `online` event triggers a flush cycle
  // immediately, so this should resolve in well under that window.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="conn-badge"]');
      return el && el.getAttribute('data-state') === 'green';
    },
    null,
    { timeout: 30_000 }
  );

  // Server-side assertions.
  expect(readOpStatus(seeded.db, seeded.opId)).toBe('DONE');
  const events = readAuditEvents(seeded.db, seeded.opId);
  // Online: OP_START, OP_START_RUN-via-method = no second OP_START.
  // Wait — kiosk's begin-run button calls service.start with eventType
  // 'start_run' which audits as OP_START in our service map (no separate
  // audit type). So the chain online is: OP_START (DISPATCHED→SETUP),
  // OP_START (SETUP→RUNNING via start_run). Then offline-queued:
  // OP_PAUSE, OP_RESUME, OP_COMPLETE.
  expect(events).toEqual(['OP_START', 'OP_START', 'OP_PAUSE', 'OP_RESUME', 'OP_COMPLETE']);

  // Idempotency ledger has 1 row per UNIQUE Idempotency-Key. The 5
  // mutations above each generated a fresh UUID via api.newIdemKey(),
  // so 5 rows should be persisted.
  expect(readIdempotencyLedgerCount(seeded.db)).toBe(5);
});
