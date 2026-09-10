/**
 * Taskbar — dock strip listing every open window. Click focuses (and
 * un-minimizes) a window; the focused one is highlighted. Augments the
 * sidebar (which stays the launcher) rather than replacing it.
 */
import { useI18n } from '../utils/useI18n';

export default function Taskbar({ windows, focusedId, onFocus, onRestore }) {
  const { t } = useI18n();
  if (!windows.length) return null;

  return (
    <div className="opswin-taskbar" role="toolbar" aria-label={t('window.taskbar')}>
      {windows.map((w) => {
        const active = w.id === focusedId && w.state !== 'min';
        return (
          <button
            key={w.id}
            type="button"
            className={`opswin-taskitem ${active ? 'active' : ''} ${w.state === 'min' ? 'minimized' : ''}`}
            onClick={() => (w.state === 'min' ? onRestore(w.id) : onFocus(w.id))}
            title={w.title}
          >
            <span className="opswin-taskdot" aria-hidden />
            <span className="opswin-tasklabel">{w.title}</span>
          </button>
        );
      })}
    </div>
  );
}
