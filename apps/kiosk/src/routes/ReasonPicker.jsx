// Reason picker modal — Sprint MES-2.6b. 8 large tiles; cached for offline.
import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { t, getLang } from '../../i18n/kiosk.js';

const CACHE_KEY = 'opskiosk.reason_codes.v1';

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCache(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    /* private mode */
  }
}

export default function ReasonPicker({ onCancel, onPick }) {
  const [items, setItems] = useState(() => loadCache() || []);
  const lang = getLang();

  useEffect(() => {
    api.getReasonCodes().then((r) => {
      if (r.ok && Array.isArray(r.body?.items)) {
        setItems(r.body.items);
        saveCache(r.body.items);
      }
    });
  }, []);

  return (
    <div className="kiosk-modal-scrim" role="dialog" aria-label={t('kiosk.reason.title')}>
      <div className="kiosk-reason-panel">
        <h2>{t('kiosk.reason.title')}</h2>
        <div className="kiosk-reason-grid">
          {items.length === 0 && <p className="kiosk-subtle">…</p>}
          {items.map((c) => (
            <button
              key={c.code}
              type="button"
              data-testid={`reason-tile-${c.code}`}
              className="kiosk-reason-tile"
              onClick={() => onPick(c.code)}
            >
              <strong>{lang === 'vi' ? c.label_vn : c.label_en}</strong>
              <small>{c.category}</small>
            </button>
          ))}
        </div>
        <button type="button" className="kiosk-btn kiosk-btn-secondary" onClick={onCancel}>
          {t('kiosk.reason.cancel')}
        </button>
      </div>
    </div>
  );
}
