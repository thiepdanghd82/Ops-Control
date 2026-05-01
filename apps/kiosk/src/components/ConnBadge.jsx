// Connectivity badge — Sprint MES-2.6b. Top-right, 3 states.
import { useEffect, useState } from 'react';
import * as queue from '../lib/queue.js';
import { t } from '../../i18n/kiosk.js';

export default function ConnBadge() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [c, setC] = useState({ pending: 0, permanent: 0 });
  const [open, setOpen] = useState(false);

  const refresh = async () => setC(await queue.counts());

  useEffect(() => {
    refresh();
    const off = queue.onQueueEvent(refresh);
    const onOn = () => {
      setOnline(true);
      refresh();
    };
    const onOff = () => {
      setOnline(false);
      refresh();
    };
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    return () => {
      off();
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
    };
  }, []);

  let state = 'green';
  if (c.permanent > 0) state = 'red';
  else if (!online || c.pending > 0) state = 'amber';

  let label = t('kiosk.conn.online');
  if (state === 'red') label = t('kiosk.conn.failed', { n: c.permanent });
  else if (state === 'amber')
    label = !online ? t('kiosk.conn.offline') : t('kiosk.conn.queued', { n: c.pending });

  return (
    <div className={`kiosk-conn kiosk-conn-${state}`} data-testid="conn-badge" data-state={state}>
      <button type="button" className="kiosk-conn-pill" onClick={() => setOpen((v) => !v)}>
        <span className="kiosk-conn-dot" /> {label}
      </button>
      {open && (
        <div className="kiosk-conn-panel" role="dialog">
          <div>{t('kiosk.conn.queued', { n: c.pending })}</div>
          <div>{t('kiosk.conn.failed', { n: c.permanent })}</div>
          <button
            type="button"
            className="kiosk-btn kiosk-btn-secondary"
            onClick={() => queue.flushAll()}
          >
            {t('kiosk.conn.retry_all')}
          </button>
        </div>
      )}
    </div>
  );
}
