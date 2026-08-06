/**
 * Window — a single floating panel: titlebar (title + minimize /
 * maximize|restore / close) + body hosting the shared <TabContent>.
 *
 * Drag + resize via react-rnd (loaded only in this chunk, so classic
 * flag-OFF users never download it). react-rnd drives live drag/resize
 * imperatively (transform on its own node — no per-move React commit,
 * Lesson 36); we dispatch MOVE/RESIZE only on the STOP callbacks. Chrome
 * styling is class-based (Lesson 6); the only dynamic style is the
 * z-index, passed as a variable (not an inline object literal).
 */
import { useMemo } from 'react';
import { Rnd } from 'react-rnd';
import { useI18n } from '../utils/useI18n';
import { TabContent } from '../modules/cost/CostModule.jsx';
import { MIN_WINDOW_W, MIN_WINDOW_H } from './windowLogic.js';

export default function Window({
  win,
  isFocused,
  onOpen,
  onFocus,
  onMinimize,
  onMaximize,
  onRestore,
  onClose,
  onMove,
  onResize,
}) {
  const { t } = useI18n();
  const isFixed = !!win.fixed;
  // Fixed (Home) behaves like a chrome-less pinned max: fills the desktop,
  // no drag/resize, no titlebar buttons, and sits behind the floats.
  const isMax = win.state === 'max' || isFixed;

  // z-index is the only per-render dynamic style. Passed as a variable
  // so the no-inline-style lint (which targets {{...}} literals) is happy.
  const zStyle = useMemo(() => ({ zIndex: win.z }), [win.z]);

  const size = isMax ? { width: '100%', height: '100%' } : { width: win.w, height: win.h };
  const position = isMax ? { x: 0, y: 0 } : { x: win.x, y: win.y };

  const focusIfNeeded = () => {
    if (!isFocused) onFocus(win.id);
  };

  // Buttons must not initiate a titlebar drag.
  const stop = (e) => e.stopPropagation();

  return (
    <Rnd
      className={`opswin ${isFocused ? 'opswin-focused' : ''} ${isMax ? 'opswin-max' : ''} ${isFixed ? 'opswin-fixed' : ''} ${win.state === 'min' ? 'opswin-hidden' : ''}`}
      style={zStyle}
      size={size}
      position={position}
      minWidth={MIN_WINDOW_W}
      minHeight={MIN_WINDOW_H}
      bounds="parent"
      dragHandleClassName="opswin-titlebar"
      cancel=".opswin-btn"
      disableDragging={isMax}
      enableResizing={!isMax}
      onMouseDown={focusIfNeeded}
      onDragStop={(e, d) => onMove(win.id, d.x, d.y)}
      onResizeStop={(e, dir, ref, delta, pos) =>
        onResize(win.id, ref.offsetWidth, ref.offsetHeight, pos.x, pos.y)
      }
    >
      <div className="opswin-frame" onMouseDownCapture={focusIfNeeded}>
        <div className="opswin-titlebar">
          <span className="opswin-title" title={win.title}>
            {win.title}
          </span>
          {/* Fixed (Home) is the base layer — no minimize/maximize/close. */}
          {!isFixed && (
            <div className="opswin-btns">
              <button
                type="button"
                className="opswin-btn opswin-btn-min"
                onMouseDown={stop}
                onClick={() => onMinimize(win.id)}
                aria-label={t('window.minimize')}
                title={t('window.minimize')}
              >
                &#8211;
              </button>
              <button
                type="button"
                className="opswin-btn opswin-btn-max"
                onMouseDown={stop}
                onClick={() => (isMax ? onRestore(win.id) : onMaximize(win.id))}
                aria-label={isMax ? t('window.restore') : t('window.maximize')}
                title={isMax ? t('window.restore') : t('window.maximize')}
              >
                {isMax ? '❐' : '□'}
              </button>
              <button
                type="button"
                className="opswin-btn opswin-btn-close"
                onMouseDown={stop}
                onClick={() => onClose(win.id)}
                aria-label={t('window.close')}
                title={t('window.close')}
              >
                &#10005;
              </button>
            </div>
          )}
        </div>
        <div className="opswin-body">
          <TabContent tabId={win.tabId} onTabChange={onOpen} resetKey={win.id} />
        </div>
      </div>
    </Rnd>
  );
}
