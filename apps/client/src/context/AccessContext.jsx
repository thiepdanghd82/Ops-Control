/**
 * AccessContext — client-side enforcement of SAP-style permission
 * groups (Sprint S2).
 *
 * Provides a single hook `useAccess()` returning:
 *   access(tabId) → 'hidden' | 'read' | 'edit'
 *
 * Resolution order per tab:
 *   1. user.role === 'sys'              → always 'edit' (god mode)
 *   2. user.role === 'admin' AND NO permission_group_id         → 'edit'
 *   3. user.permission_group_id resolves to a group in the lib:
 *      → group.tab_permissions[tabId] if set
 *      → else 'edit' (default — tab not listed in the matrix)
 *   4. No permission_group_id assigned → fallback 'edit' (legacy users)
 *
 * Hidden/read state is cross-cut through:
 *   - Sidebar.jsx (filter out 'hidden' tabs from the nav)
 *   - <AccessGate tabId=…> wrapper (renders forbidden placeholder on
 *     hidden / disables <input>/<button> on read)
 *
 * Defense-in-depth note: this layer is CLIENT-ONLY convenience. The
 * authoritative guard is the server's requireTabAccess middleware
 * (Pha 3). A curl user bypassing the UI still hits the server gate.
 */
import { createContext, useEffect, useMemo, useState, useCallback } from 'react';
import { sharedApi } from '../services/api';
import { useAuth } from './AuthContext';

// Exported so the sibling `useAccess.js` can subscribe to it. The
// fast-refresh-aware tooling prefers single-export-shape files, but
// the context object must live next to the Provider — disabling the
// rule here is intentional, not a smell.
// eslint-disable-next-line react-refresh/only-export-components
export const AccessContext = createContext(null);

export function AccessProvider({ children }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await sharedApi.getPermissionGroups();
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch {
      // No profile → fallback to 'edit' everywhere. Silent.
      setGroups([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (user) reload();
    else setLoaded(true);
  }, [user, reload]);

  // Listen for admin-triggered group updates so other tabs refresh.
  useEffect(() => {
    function onReload() {
      reload();
    }
    window.addEventListener('ops-permission-groups-changed', onReload);
    return () => window.removeEventListener('ops-permission-groups-changed', onReload);
  }, [reload]);

  const activeGroup = useMemo(() => {
    if (!user?.permission_group_id) return null;
    return groups.find((g) => g.id === user.permission_group_id) || null;
  }, [groups, user?.permission_group_id]);

  const access = useCallback(
    (tabId) => {
      // Sys is omnipotent. Admin with no explicit group assignment is
      // treated as all-access too (common for small teams).
      if (!user) return 'hidden'; // not logged in — nothing
      if (user.role === 'sys') return 'edit';
      if (!activeGroup) {
        // Admin users with no explicit group → edit all. Lower roles
        // fall back to edit too for backward compat (explicit hardening
        // via permission_group_id is opt-in until Pha 4 migration).
        return 'edit';
      }
      const perm = activeGroup.tab_permissions?.[tabId];
      return perm || 'edit'; // unlisted tabs default to edit
    },
    [user, activeGroup]
  );

  const value = useMemo(
    () => ({
      loaded,
      activeGroup,
      groups,
      access,
      // Short-hand queries used by AccessGate
      canView: (tabId) => access(tabId) !== 'hidden',
      canEdit: (tabId) => access(tabId) === 'edit',
      // Expose reload for admin modals that just mutated a group.
      reloadGroups: reload,
    }),
    [loaded, activeGroup, groups, access, reload]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
