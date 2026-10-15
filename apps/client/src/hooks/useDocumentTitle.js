/**
 * useDocumentTitle — sets `document.title` on mount + on title change.
 * Restores previous title on unmount (prevents nested-route titles
 * leaking between top-level tab switches).
 *
 * Usage:
 *   useDocumentTitle('Quote History');         // → "Quote History · Quoted Module"
 *   useDocumentTitle('Quote #42', 'Pricing');  // → "Quote #42 · Pricing · Quoted Module"
 *
 * The app suffix is appended automatically; pass `null` as the second arg
 * if you want a custom title without it. Used to give browser-history
 * entries meaningful labels (otherwise every tab shows just the app name,
 * so Cmd+Shift+T re-opens are unrecognisable).
 */

import { useEffect } from 'react';

const APP_SUFFIX = 'Quoted Module';

export function useDocumentTitle(label, scope = '') {
  useEffect(() => {
    const previous = document.title;
    const parts = [label, scope, APP_SUFFIX].filter(Boolean);
    document.title = parts.join(' · ');
    return () => {
      document.title = previous;
    };
  }, [label, scope]);
}

export default useDocumentTitle;
