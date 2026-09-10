/**
 * WindowLayer — the desktop host. Renders one <Window> per open window
 * (minimized ones stay MOUNTED, hidden via CSS, to preserve scroll +
 * in-progress edits), plus the taskbar dock. Owns the document title,
 * which follows the focused window.
 *
 * Lazily imported by the App shell only when the window_manager flag is
 * ON, so react-rnd + all window chrome stay out of the classic bundle.
 */
import { useI18n } from '../utils/useI18n';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { tabTitle } from '../modules/cost/CostModule.jsx';
import { useWindowManager } from './WindowManagerContext.jsx';
import Window from './Window.jsx';
import Taskbar from './Taskbar.jsx';
import './WindowLayer.css';

export default function WindowLayer() {
  const { t } = useI18n();
  const {
    windows,
    focusedTabId,
    openWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    closeWindow,
    moveWindow,
    resizeWindow,
  } = useWindowManager();

  useDocumentTitle(focusedTabId ? tabTitle(focusedTabId) : 'Windows', 'Cost');

  // The focused window = highest-z non-minimized. Compute the id here so
  // Window + Taskbar agree on the highlight.
  let focusedId = null;
  let topZ = -Infinity;
  for (const w of windows) {
    if (w.state === 'min') continue;
    if (w.z > topZ) {
      topZ = w.z;
      focusedId = w.id;
    }
  }

  return (
    <div className="opswin-root">
      {/* Desktop = positioned parent react-rnd clamps drag/resize to.
          The taskbar is a sibling (flex row) so a maximized window fills
          the desktop only, never under the dock. */}
      <div className="opswin-desktop">
        {windows.length === 0 && (
          <div className="opswin-empty">
            <p>{t('window.empty')}</p>
          </div>
        )}
        {/* Minimized windows stay MOUNTED (hidden via a class on the Rnd
            node) to preserve scroll + in-progress edits. */}
        {windows.map((w) => (
          <Window
            key={w.id}
            win={w}
            isFocused={w.id === focusedId}
            onOpen={openWindow}
            onFocus={focusWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
            onRestore={restoreWindow}
            onClose={closeWindow}
            onMove={moveWindow}
            onResize={resizeWindow}
          />
        ))}
      </div>
      <Taskbar
        windows={windows}
        focusedId={focusedId}
        onFocus={focusWindow}
        onRestore={restoreWindow}
      />
    </div>
  );
}
