/**
 * TabBarOverflow — responsive wrapper for any horizontal tab bar.
 *
 * Usage:
 *   <TabBarOverflow>
 *     <button ...>Tab 1</button>
 *     <button ...>Tab 2</button>
 *     ...
 *   </TabBarOverflow>
 *
 * Provides (in this order, left to right):
 *   - Left chevron button (◀) — visible only when canScrollLeft
 *   - Left fade gradient (cue content continues to the left)
 *   - Scrollable tab container (children go here)
 *   - Right fade gradient + right chevron (▶)
 *
 * The component does NOT change the tabs' styling — it only provides
 * the overflow affordance shell. Existing CSS (.sc-subtab-btn, .cc-tab,
 * .ink-sub-btn, .pa-tab) keeps working unchanged.
 *
 * Keyboard: Left/Right arrow keys scroll while the tab bar is focused.
 *
 * The optional `rightSlot` prop renders at the right edge OUTSIDE the
 * scroll area — use for fixed toolbar items (Save button, dirty badge)
 * that should always stay visible regardless of scroll state.
 */
import { useRef } from 'react';
import { useOverflow } from '../../hooks/useOverflow';
import './TabBarOverflow.css';

export default function TabBarOverflow({ children, className = '', rightSlot = null, ariaLabel }) {
  const scrollRef = useRef(null);
  const { hasOverflow, canScrollLeft, canScrollRight, scrollBy } = useOverflow(scrollRef);

  return (
    <div
      className={`tbo-root ${className} ${hasOverflow ? 'tbo-has-overflow' : ''}`}
      role="region"
      aria-label={ariaLabel || 'Tab navigation'}
    >
      <button
        type="button"
        className={`tbo-arrow tbo-arrow-left ${canScrollLeft ? 'visible' : ''}`}
        onClick={() => scrollBy('left')}
        tabIndex={canScrollLeft ? 0 : -1}
        aria-label="Scroll tabs left"
        aria-hidden={!canScrollLeft}
      >
        <span aria-hidden="true">◀</span>
      </button>

      <div
        ref={scrollRef}
        className={`tbo-scroll ${canScrollLeft ? 'fade-l' : ''} ${canScrollRight ? 'fade-r' : ''}`}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          // Left/Right arrow: scroll the container (tab-bar level nav).
          // Home/End: jump to first/last tab for keyboard power users.
          if (e.key === 'ArrowLeft')  { e.preventDefault(); scrollBy('left'); }
          if (e.key === 'ArrowRight') { e.preventDefault(); scrollBy('right'); }
          if (e.key === 'Home') {
            e.preventDefault();
            scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
          }
          if (e.key === 'End') {
            e.preventDefault();
            scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
          }
        }}
        tabIndex={-1}
      >
        {children}
      </div>

      <button
        type="button"
        className={`tbo-arrow tbo-arrow-right ${canScrollRight ? 'visible' : ''}`}
        onClick={() => scrollBy('right')}
        tabIndex={canScrollRight ? 0 : -1}
        aria-label="Scroll tabs right"
        aria-hidden={!canScrollRight}
      >
        <span aria-hidden="true">▶</span>
      </button>

      {rightSlot != null && <div className="tbo-right-slot">{rightSlot}</div>}
    </div>
  );
}
