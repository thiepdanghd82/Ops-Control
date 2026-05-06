// OpDetail.test.jsx — Sprint MES-3-V2 KIOSK-004.
// Asserts the 6 status-driven button branches + optimistic dispatch
// behaviour. Heavy mocking — api, queue, session — so each test
// exercises just the render+click logic.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';

vi.mock('../lib/api.js', () => ({
  newIdemKey: vi.fn(() => 'idem-test-1'),
  getDispatch: vi.fn(),
  // Pause flow mounts <ReasonPicker> which calls getReasonCodes —
  // stub it here to avoid the unhandled-promise crash inside the
  // child component's useEffect.
  getReasonCodes: vi.fn().mockResolvedValue({ ok: true, body: { items: [] } }),
  postStart: vi.fn(),
  postPause: vi.fn(),
  postResume: vi.fn(),
  postComplete: vi.fn(),
  postScan: vi.fn(),
}));
vi.mock('../lib/queue.js', () => ({
  enqueue: vi.fn().mockResolvedValue(1),
}));
vi.mock('../lib/session.js', () => ({
  load: vi.fn(() => ({ machine_code: 'M-01' })),
}));
vi.mock('../../i18n/kiosk.js', () => ({
  t: (key) =>
    ({
      'kiosk.op.start': 'Start',
      'kiosk.op.begin_run': 'Begin run',
      'kiosk.op.pause': 'Pause',
      'kiosk.op.resume': 'Resume',
      'kiosk.op.complete': 'Complete',
      'kiosk.op.complete_confirm': 'Confirm complete',
      'kiosk.op.scan_prompt': 'Scan',
      'kiosk.op.scan_send': 'Send scan',
      'kiosk.op.qty_done': 'Quantity done',
      'kiosk.op.scrap_count': 'Scrap',
      'kiosk.op.notes_opt': 'Notes',
      'kiosk.op.awaiting_accept': 'Awaiting planner acceptance',
      'kiosk.op.back': 'Back',
      'kiosk.reason.title': 'Why pause?',
      'kiosk.reason.cancel': 'Cancel',
    })[key] || key,
  getLang: () => 'en',
}));

import OpDetail from './OpDetail.jsx';
import * as api from '../lib/api.js';
import * as queue from '../lib/queue.js';

function opFixture(status) {
  return {
    id: 7,
    wo_code: 'WO-7',
    customer: 'Acme',
    qty_planned: 100,
    due_date: '2026-12-31',
    status,
  };
}

async function renderWithStatus(status) {
  api.getDispatch.mockResolvedValue({ ok: true, body: { items: [opFixture(status)] } });
  let utils;
  await act(async () => {
    utils = render(<OpDetail opId="7" />);
  });
  // Allow refresh() to settle.
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  api.postStart.mockResolvedValue({ ok: true, body: { op: { ...opFixture('SETUP'), id: 7 } } });
  api.postPause.mockResolvedValue({ ok: true, body: { op: { ...opFixture('PAUSED'), id: 7 } } });
  api.postResume.mockResolvedValue({ ok: true, body: { op: { ...opFixture('RUNNING'), id: 7 } } });
  api.postComplete.mockResolvedValue({ ok: true, body: { op: { ...opFixture('DONE'), id: 7 } } });
});

describe('OpDetail — status-driven CTA mapping', () => {
  test('PENDING → no primary CTA (planner dispatches; kiosk waits)', async () => {
    await renderWithStatus('PENDING');
    expect(screen.queryByTestId('op-btn-start')).toBeNull();
    expect(screen.queryByTestId('op-btn-begin-run')).toBeNull();
    expect(screen.queryByTestId('op-btn-pause')).toBeNull();
  });

  test('DISPATCHED → "Start" button visible + enabled', async () => {
    await renderWithStatus('DISPATCHED');
    const btn = screen.getByTestId('op-btn-start');
    expect(btn).toBeInTheDocument();
    expect(btn).toBeEnabled();
  });

  test('SETUP → "Begin run" button visible', async () => {
    await renderWithStatus('SETUP');
    expect(screen.getByTestId('op-btn-begin-run')).toBeInTheDocument();
  });

  test('RUNNING → "Pause" + "Complete" both visible', async () => {
    await renderWithStatus('RUNNING');
    expect(screen.getByTestId('op-btn-pause')).toBeInTheDocument();
    expect(screen.getByTestId('op-btn-complete')).toBeInTheDocument();
  });

  test('PAUSED → "Resume" + "Complete" both visible', async () => {
    await renderWithStatus('PAUSED');
    expect(screen.getByTestId('op-btn-resume')).toBeInTheDocument();
    expect(screen.getByTestId('op-btn-complete')).toBeInTheDocument();
  });

  test('DONE → awaiting-accept message instead of buttons', async () => {
    await renderWithStatus('DONE');
    expect(screen.getByText(/Awaiting planner acceptance/i)).toBeInTheDocument();
    expect(screen.queryByTestId('op-btn-start')).toBeNull();
    expect(screen.queryByTestId('op-btn-pause')).toBeNull();
  });
});

describe('OpDetail — optimistic dispatch', () => {
  test('clicking Start optimistically flips status badge to SETUP', async () => {
    await renderWithStatus('DISPATCHED');
    // Stall the API so the optimistic flip is visible.
    let resolveApi;
    api.postStart.mockReturnValue(
      new Promise((r) => {
        resolveApi = r;
      })
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('op-btn-start'));
    });
    // After click, before API resolves, badge should show SETUP optimistically.
    expect(screen.getByTestId('op-status').textContent).toBe('SETUP');
    // Settle API.
    await act(async () => {
      resolveApi({ ok: true, body: { op: { ...opFixture('SETUP'), id: 7 } } });
    });
    expect(api.postStart).toHaveBeenCalledTimes(1);
  });

  test('offline path → enqueue is called instead of api.postStart', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await renderWithStatus('DISPATCHED');
    await act(async () => {
      fireEvent.click(screen.getByTestId('op-btn-start'));
    });
    await act(async () => {});
    expect(queue.enqueue).toHaveBeenCalled();
    expect(api.postStart).not.toHaveBeenCalled();
  });
});

describe('OpDetail — pause flow', () => {
  test('clicking Pause opens the ReasonPicker dialog', async () => {
    await renderWithStatus('RUNNING');
    await act(async () => {
      fireEvent.click(screen.getByTestId('op-btn-pause'));
    });
    // ReasonPicker renders a role="dialog" with the title key.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
