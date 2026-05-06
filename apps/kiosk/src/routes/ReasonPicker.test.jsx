// ReasonPicker.test.jsx — Sprint MES-3-V2 KIOSK-004.
// Asserts: tile render from cache + fetched data, EN vs VI label
// switching from i18n.getLang(), onPick callback, onCancel callback.
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';

const SEED = [
  { code: 'MACHINE_DOWN', label_en: 'Machine down', label_vn: 'Máy hỏng', category: 'downtime' },
  {
    code: 'MATERIAL_SHORT',
    label_en: 'Material shortage',
    label_vn: 'Thiếu vật tư',
    category: 'downtime',
  },
  {
    code: 'OPERATOR_BREAK',
    label_en: 'Operator break',
    label_vn: 'Nghỉ giải lao',
    category: 'planned',
  },
  {
    code: 'QUALITY_HOLD',
    label_en: 'Quality hold',
    label_vn: 'Giữ kiểm tra CL',
    category: 'quality',
  },
  {
    code: 'SETUP_CHANGEOVER',
    label_en: 'Setup / changeover',
    label_vn: 'Setup / chuyển job',
    category: 'planned',
  },
  { code: 'SHIFT_END', label_en: 'Shift end', label_vn: 'Hết ca', category: 'planned' },
  {
    code: 'MAINTENANCE_PLANNED',
    label_en: 'Planned maintenance',
    label_vn: 'Bảo trì có kế hoạch',
    category: 'planned',
  },
  {
    code: 'OTHER',
    label_en: 'Other (note required)',
    label_vn: 'Khác (cần ghi chú)',
    category: 'other',
  },
];

vi.mock('../lib/api.js', () => ({
  getReasonCodes: vi.fn(),
}));

let langStub = 'en';
vi.mock('../../i18n/kiosk.js', () => ({
  t: (key) =>
    ({
      'kiosk.reason.title': 'Why pause?',
      'kiosk.reason.cancel': 'Cancel',
    })[key] || key,
  getLang: () => langStub,
}));

import ReasonPicker from './ReasonPicker.jsx';
import * as api from '../lib/api.js';

beforeEach(() => {
  langStub = 'en';
  api.getReasonCodes.mockResolvedValue({ ok: true, body: { items: SEED } });
});

async function renderPicker(props = {}) {
  let utils;
  await act(async () => {
    utils = render(<ReasonPicker onCancel={() => {}} onPick={() => {}} {...props} />);
  });
  // Allow the useEffect setItems to settle.
  await act(async () => {});
  return utils;
}

describe('ReasonPicker — render', () => {
  test('renders all 8 tiles after fetch resolves', async () => {
    await renderPicker();
    for (const r of SEED) {
      expect(screen.getByTestId(`reason-tile-${r.code}`)).toBeInTheDocument();
    }
  });

  test('shows EN labels when lang=en', async () => {
    langStub = 'en';
    await renderPicker();
    expect(screen.getByText('Material shortage')).toBeInTheDocument();
  });

  test('shows VI labels when lang=vi', async () => {
    langStub = 'vi';
    await renderPicker();
    expect(screen.getByText('Thiếu vật tư')).toBeInTheDocument();
    // EN label should NOT appear for the same code.
    expect(screen.queryByText('Material shortage')).toBeNull();
  });

  test('renders category as a small subtitle on each tile', async () => {
    await renderPicker();
    const tile = screen.getByTestId('reason-tile-OPERATOR_BREAK');
    expect(tile.textContent).toContain('planned');
  });
});

describe('ReasonPicker — interactions', () => {
  test('clicking a tile calls onPick with the code', async () => {
    const onPick = vi.fn();
    await renderPicker({ onPick });
    fireEvent.click(screen.getByTestId('reason-tile-QUALITY_HOLD'));
    expect(onPick).toHaveBeenCalledWith('QUALITY_HOLD');
  });

  test('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    await renderPicker({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ReasonPicker — offline cache', () => {
  test('renders from localStorage cache when fetch fails', async () => {
    localStorage.setItem('opskiosk.reason_codes.v1', JSON.stringify(SEED.slice(0, 3)));
    api.getReasonCodes.mockResolvedValue({ ok: false, networkError: true });
    await renderPicker();
    // 3 cached tiles render; nothing newer added.
    expect(screen.getByTestId('reason-tile-MACHINE_DOWN')).toBeInTheDocument();
    expect(screen.queryByTestId('reason-tile-OTHER')).toBeNull();
  });

  test('successful fetch overwrites the cache', async () => {
    localStorage.setItem('opskiosk.reason_codes.v1', JSON.stringify([SEED[0]]));
    await renderPicker();
    const cached = JSON.parse(localStorage.getItem('opskiosk.reason_codes.v1'));
    expect(cached.length).toBe(8);
  });
});
