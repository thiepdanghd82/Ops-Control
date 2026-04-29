/**
 * useAccess — separate file so AccessContext.jsx can stay component-only
 * (Vite Fast Refresh requires a single export shape per module). The
 * context itself is re-exported from AccessContext.jsx via a non-React
 * import; the consumer surface is unchanged.
 */
import { useContext } from 'react';
import { AccessContext } from './AccessContext.jsx';

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    // Graceful fallback when provider not mounted (e.g., early boot).
    return {
      loaded: false, activeGroup: null, groups: [],
      access: () => 'edit', canView: () => true, canEdit: () => true,
      reloadGroups: () => {},
    };
  }
  return ctx;
}
