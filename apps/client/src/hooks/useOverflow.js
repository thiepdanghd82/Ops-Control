/**
 * useOverflow — detect horizontal overflow + scroll state on any ref'd
 * element. Returns flags used by <TabBarOverflow> to show/hide arrow
 * buttons and fade gradients.
 *
 * Outputs:
 *   hasOverflow      — scrollWidth > clientWidth (content doesn't fit)
 *   canScrollLeft    — scrollLeft > 0 (there is content to the left)
 *   canScrollRight   — scrollLeft + clientWidth < scrollWidth (more to the right)
 *
 * Implementation:
 *   - ResizeObserver watches the element's clientWidth (fires when the
 *     container, sidebar, or window resize)
 *   - scroll listener updates left/right flags as user scrolls
 *   - Initial read via requestAnimationFrame so layout is ready
 *
 * The hook is write-once / read-many and safe to call even when the
 * ref is null (common during first render).
 */
import { useEffect, useState, useCallback } from 'react';

export function useOverflow(ref) {
  const [state, setState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1-px tolerance absorbs sub-pixel rounding that can otherwise leave
    // an arrow visible on a fully-scrolled element.
    const hasOverflow = el.scrollWidth - el.clientWidth > 1;
    const canScrollLeft = el.scrollLeft > 1;
    const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setState((prev) => {
      if (
        prev.hasOverflow === hasOverflow &&
        prev.canScrollLeft === canScrollLeft &&
        prev.canScrollRight === canScrollRight
      )
        return prev;
      return { hasOverflow, canScrollLeft, canScrollRight };
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    // Window resize catches cases where a parent (e.g. sidebar collapse)
    // changes size without its own ResizeObserver trigger.
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [ref, measure]);

  // Convenience helpers for scroll-by-button interaction. Amount is
  // proportional to the container's client width — feels natural at
  // any breakpoint.
  const scrollBy = useCallback(
    (direction) => {
      const el = ref.current;
      if (!el) return;
      const amount =
        Math.max(120, Math.floor(el.clientWidth * 0.7)) * (direction === 'left' ? -1 : 1);
      el.scrollBy({ left: amount, behavior: 'smooth' });
    },
    [ref]
  );

  return { ...state, scrollBy, remeasure: measure };
}
