// ConnBadge.test.jsx — Sprint MES-3-V2 KIOSK-004.
// Asserts the 3-state colour mapping (green/amber/red) the badge picks
// from {navigator.onLine, queue.counts}. Mock the queue module so we
// don't need fake-indexeddb here.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';

// Mocks must declare BEFORE the component import; vi.mock is hoisted.
vi.mock('../lib/queue.js', () => ({
  counts: vi.fn(),
  onQueueEvent: vi.fn(() => () => {}),
  flushAll: vi.fn(),
}));
vi.mock('../../i18n/kiosk.js', () => ({
  // Static-text fallback so we can assertion-match without locale fetches.
  t: (key, vars) =>
    ({
      'kiosk.conn.online': 'Online',
      'kiosk.conn.offline': 'Offline',
      'kiosk.conn.queued': vars ? `${vars.n} pending` : '0 pending',
      'kiosk.conn.failed': vars ? `${vars.n} failed` : '0 failed',
      'kiosk.conn.retry_all': 'Retry all',
    })[key] || key,
}));

import ConnBadge from './ConnBadge.jsx';
import * as queue from '../lib/queue.js';

beforeEach(() => {
  // Default: counts resolves to all-zero. Tests override per-case.
  queue.counts.mockResolvedValue({ pending: 0, permanent: 0, total: 0 });
  // jsdom's navigator.onLine defaults true.
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

async function renderAndSettle() {
  let utils;
  await act(async () => {
    utils = render(<ConnBadge />);
  });
  return utils;
}

describe('ConnBadge — visual state mapping', () => {
  test('online + zero queue → state="green", label "Online"', async () => {
    await renderAndSettle();
    const root = screen.getByTestId('conn-badge');
    expect(root).toHaveAttribute('data-state', 'green');
    expect(root.textContent).toContain('Online');
  });

  test('offline → state="amber", label "Offline"', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    queue.counts.mockResolvedValue({ pending: 0, permanent: 0, total: 0 });
    await renderAndSettle();
    const root = screen.getByTestId('conn-badge');
    expect(root).toHaveAttribute('data-state', 'amber');
    expect(root.textContent).toContain('Offline');
  });

  test('online + pending > 0 → state="amber", label "{n} pending"', async () => {
    queue.counts.mockResolvedValue({ pending: 3, permanent: 0, total: 3 });
    await renderAndSettle();
    const root = screen.getByTestId('conn-badge');
    expect(root).toHaveAttribute('data-state', 'amber');
    expect(root.textContent).toContain('3 pending');
  });

  test('permanent failures > 0 → state="red", label "{n} failed"', async () => {
    queue.counts.mockResolvedValue({ pending: 0, permanent: 2, total: 2 });
    await renderAndSettle();
    const root = screen.getByTestId('conn-badge');
    expect(root).toHaveAttribute('data-state', 'red');
    expect(root.textContent).toContain('2 failed');
  });

  test('permanent failures dominate over pending in red state', async () => {
    queue.counts.mockResolvedValue({ pending: 5, permanent: 1, total: 6 });
    await renderAndSettle();
    const root = screen.getByTestId('conn-badge');
    // permanent>0 wins regardless of pending
    expect(root).toHaveAttribute('data-state', 'red');
  });
});

describe('ConnBadge — pop-out panel', () => {
  test('clicking the pill toggles the panel open', async () => {
    queue.counts.mockResolvedValue({ pending: 2, permanent: 1, total: 3 });
    await renderAndSettle();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /pending|failed|Online/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('Retry-all button calls queue.flushAll', async () => {
    queue.counts.mockResolvedValue({ pending: 1, permanent: 0, total: 1 });
    await renderAndSettle();
    fireEvent.click(screen.getByRole('button', { name: /pending|Online/ }));
    fireEvent.click(screen.getByRole('button', { name: /Retry all/ }));
    expect(queue.flushAll).toHaveBeenCalledTimes(1);
  });
});
