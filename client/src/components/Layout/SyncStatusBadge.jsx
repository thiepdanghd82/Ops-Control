import { useEffect, useState } from 'react';
import desktop from '../../services/desktopBridge';
import { useSyncStatus } from '../../services/smartCache';
import './SyncStatusBadge.css';

// Smart-mode sync indicator. Hidden when:
//  - Not running in Electron (web mode → there's no smart engine)
//  - Mode != 'smart' (embedded / thin don't run the engine, badge is noise)
//
// When visible, surfaces three pieces of state from the smart-client
// broadcast: connectivity, queued-write count, and time since last pull.
// Click → triggers a manual sync (push outbox + pull all tables).

function relativeTime(ts) {
  if (!ts) return 'never synced';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' min ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' hr ago';
  return Math.floor(diff / 86_400_000) + ' d ago';
}

export default function SyncStatusBadge() {
  const status = useSyncStatus();
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);

  // Read current mode once on mount (we don't need realtime — mode change
  // requires app restart anyway via Settings → Mode → Save & restart).
  useEffect(() => {
    let cancelled = false;
    if (!desktop.isAvailable) return undefined;
    desktop.app.getConfig().then((cfg) => {
      if (!cancelled) setMode(cfg?.mode || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!desktop.isAvailable) return null;
  if (mode !== 'smart') return null;

  const { online, pending = 0, lastSyncAt = 0 } = status;
  let cls = 'sync-badge';
  let icon = '●';
  let label;
  if (online === false) {
    cls += ' sync-offline';
    icon = '⚠';
    label = pending > 0 ? `Offline · ${pending} queued` : 'Offline';
  } else if (online === true) {
    cls += pending > 0 ? ' sync-pending' : ' sync-online';
    label = pending > 0
      ? `${pending} queued · ${relativeTime(lastSyncAt)}`
      : `Online · ${relativeTime(lastSyncAt)}`;
  } else {
    cls += ' sync-unknown';
    label = 'Connecting…';
  }

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try { await desktop.cache.triggerSync(); } catch { /* surfaced via broadcast */ }
    finally { setBusy(false); }
  };

  return (
    <button
      className={cls}
      onClick={handleClick}
      disabled={busy}
      title={busy ? 'Syncing…' : 'Click to sync now (push outbox + pull master data)'}
    >
      <span className="sync-badge-dot">{busy ? '↻' : icon}</span>
      <span className="sync-badge-label">{busy ? 'Syncing…' : label}</span>
    </button>
  );
}
