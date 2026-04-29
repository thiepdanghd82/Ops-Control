/**
 * PermissionGroupsSection — SAP-style authorization profile manager.
 *
 * Lives inside Settings → Account Control as the third sub-tab. Owns:
 *   - Reading / refreshing /api/shared/permission-groups
 *   - Opening the PermissionGroupMatrixModal for create / edit
 *   - Delete (non-system groups only)
 *
 * The matrix modal shows a grid of every sidebar tab × 3 access modes
 * (Hidden / Read / Edit) as radio buttons so setting permissions is
 * obvious and symmetrical.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { sharedApi, authApi } from '../../../services/api';
import Modal from '../../../components/Shared/Modal';

const EMPTY_GROUP = {
  id: '',
  name: '',
  default_department: '',
  tab_permissions: {},   // { [tab_id]: 'hidden' | 'read' | 'edit' }
  notes: '',
};

const ACCESS_MODES = [
  { v: 'hidden', label: 'Hidden', color: '#ef4444', icon: '⊘' },
  { v: 'read',   label: 'Read',   color: '#d97706', icon: '👁' },
  { v: 'edit',   label: 'Edit',   color: '#22c55e', icon: '✎' },
];

export default function PermissionGroupsSection({ isAdminPlus, onFlash }) {
  const [groups, setGroups] = useState([]);
  const [tabCatalog, setTabCatalog] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | group object (new or copy)
  const [assignStats, setAssignStats] = useState({ total: 0, assigned: 0, unassigned: 0 });

  // onFlash can be a fresh inline fn each parent render — ref-guard it
  // so our reload callback stays stable (no blinking — same pattern we
  // needed for MachineProfileModal).
  const flashRef = useRef(onFlash);
  useEffect(() => { flashRef.current = onFlash; }, [onFlash]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [data, usersResp] = await Promise.all([
        sharedApi.getPermissionGroups(),
        authApi.getUsers().catch(() => ({ users: [] })),
      ]);
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
      setTabCatalog(Array.isArray(data?.tab_catalog) ? data.tab_catalog : []);
      setDepartments(Array.isArray(data?.departments) ? data.departments : []);

      // Pha 4 — migration status. Count how many users have been
      // assigned a permission_group_id vs how many still rely on the
      // role-only default (all-access fallback).
      const users = Array.isArray(usersResp?.users) ? usersResp.users
                  : Array.isArray(usersResp) ? usersResp : [];
      const assigned = users.filter(u => u.permission_group_id).length;
      setAssignStats({ total: users.length, assigned, unassigned: users.length - assigned });
    } catch (e) {
      flashRef.current?.('error', 'Failed to load permission groups: ' + (e.message || 'Unknown'));
    } finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const handleDelete = useCallback(async (g) => {
    if (g.is_system) { flashRef.current?.('error', 'System groups are protected.'); return; }
    if (!confirm(`Delete group "${g.name}"?\nUsers still assigned will fall back to default access.`)) return;
    try {
      await sharedApi.deletePermissionGroup(g.id);
      flashRef.current?.('success', `Group ${g.name} deleted`);
      reload();
    } catch (e) {
      flashRef.current?.('error', 'Delete failed: ' + (e.message || 'Unknown'));
    }
  }, [reload]);

  const handleDuplicate = useCallback((g) => {
    setEditing({
      ...g,
      id: g.id + '-copy',
      name: g.name + ' (copy)',
      is_system: false,
    });
  }, []);

  if (loading) return <div className="tab-loading">Loading permission groups…</div>;

  return (
    <div className="settings-card pg-section">
      <div className="pg-section-head">
        <div>
          <h4 style={{ margin: 0, fontSize: 13 }}>Permission Groups</h4>
          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
            {groups.length} groups · {tabCatalog.length} tabs in matrix · per-tab Hidden / Read / Edit
          </p>
        </div>
        {isAdminPlus && (
          <button className="btn btn-primary"
            onClick={() => setEditing({ ...EMPTY_GROUP, tab_permissions: {} })}>
            + Add Group
          </button>
        )}
      </div>

      {/* Pha 4 — user migration status banner. Unassigned users keep
          the legacy all-access behaviour (role-only gating) until an
          admin assigns them a group in the Users sub-tab. */}
      <div className={'pg-assign-status' + (assignStats.unassigned > 0 ? ' pg-assign-warn' : ' pg-assign-ok')}>
        <b>User coverage:</b>
        <span>{assignStats.assigned}/{assignStats.total} users have a permission group assigned</span>
        {assignStats.unassigned > 0 && (
          <span className="pg-assign-hint">
            · {assignStats.unassigned} using default all-access (role-only)
            — assign them in the <b>Users</b> sub-tab.
          </span>
        )}
      </div>

      <table className="pg-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Default Dept.</th>
            <th>Coverage</th>
            <th>Notes</th>
            <th style={{ width: 120 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const counts = countModes(g.tab_permissions, tabCatalog);
            return (
              <tr key={g.id}>
                <td className="pg-mono">
                  {g.id}
                  {g.is_system && <span className="pg-sys-badge" title="System — protected">sys</span>}
                </td>
                <td><b>{g.name}</b></td>
                <td>{g.default_department || '—'}</td>
                <td>
                  <div className="pg-coverage">
                    {ACCESS_MODES.map(m => (
                      <span key={m.v} className="pg-cov-chip" style={{ color: m.color, borderColor: m.color + '44' }}>
                        {m.icon} {counts[m.v] || 0}
                      </span>
                    ))}
                    <span className="pg-cov-chip pg-cov-unset">default {counts.unset || 0}</span>
                  </div>
                </td>
                <td className="pg-notes-cell" title={g.notes}>{(g.notes || '').slice(0, 60)}{g.notes?.length > 60 && '…'}</td>
                <td>
                  <div className="pg-row-actions">
                    <button onClick={() => setEditing({ ...g, tab_permissions: { ...g.tab_permissions } })} title="Edit">✎</button>
                    <button onClick={() => handleDuplicate(g)} title="Duplicate">⧉</button>
                    {!g.is_system && isAdminPlus && (
                      <button onClick={() => handleDelete(g)} className="pg-del" title="Delete">×</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <PermissionGroupMatrixModal
          group={editing}
          tabCatalog={tabCatalog}
          departments={departments}
          existingIds={groups.map(g => g.id)}
          isCreate={!groups.some(g => g.id === editing.id && !editing.id.endsWith('-copy'))}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onFlash={(type, text) => flashRef.current?.(type, text)}
        />
      )}
    </div>
  );
}

function countModes(perms, catalog) {
  const counts = { hidden: 0, read: 0, edit: 0, unset: 0 };
  for (const t of catalog) {
    const v = perms[t.id];
    if (v === 'hidden' || v === 'read' || v === 'edit') counts[v]++;
    else counts.unset++;
  }
  return counts;
}

// ── Matrix modal — edit a single group's tab_permissions grid ─────

function PermissionGroupMatrixModal({
  group, tabCatalog, departments, existingIds, isCreate,
  onClose, onSaved, onFlash,
}) {
  const [form, setForm] = useState({ ...group });
  const [saving, setSaving] = useState(false);

  function setTabPerm(tabId, mode) {
    setForm(f => {
      const next = { ...f.tab_permissions };
      if (mode === null) delete next[tabId];
      else next[tabId] = mode;
      return { ...f, tab_permissions: next };
    });
  }

  function bulkSet(mode) {
    if (!confirm(`Set ALL tabs to ${mode === null ? 'default' : mode}?`)) return;
    const next = {};
    if (mode !== null) for (const t of tabCatalog) next[t.id] = mode;
    setForm(f => ({ ...f, tab_permissions: next }));
  }

  async function handleSave() {
    const id = String(form.id || '').trim().replace(/\s+/g, '-').toLowerCase();
    if (!id) { onFlash('error', 'ID is required'); return; }
    if (!form.name?.trim()) { onFlash('error', 'Name is required'); return; }
    if (isCreate && existingIds.includes(id)) {
      onFlash('error', 'ID already exists — pick a different ID.');
      return;
    }
    const payload = {
      id,
      name: form.name.trim(),
      default_department: form.default_department || '',
      tab_permissions: form.tab_permissions || {},
      notes: form.notes || '',
    };
    setSaving(true);
    try {
      if (isCreate) {
        await sharedApi.createPermissionGroup(payload);
        onFlash('success', `Group ${payload.name} created`);
      } else {
        await sharedApi.updatePermissionGroup(group.id, payload);
        onFlash('success', `Group ${payload.name} updated`);
      }
      onSaved();
    } catch (e) {
      onFlash('error', 'Save failed: ' + (e.message || 'Unknown'));
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="xl" severity="info" ariaLabelledBy="pg-title">
      <Modal.Header
        id="pg-title"
        title={isCreate ? 'Add Permission Group' : `Edit — ${group.name}`}
        subtitle={group.is_system ? 'System group · read-only (duplicate to customise)' : 'Per-tab access matrix'}
        severity={group.is_system ? 'warning' : 'info'}
      />
      <Modal.Body>
        <div className="pg-modal-form">
          <div className="pg-form-grid">
            <label>
              <span>ID (slug)</span>
              <input type="text"
                disabled={!isCreate || group.is_system}
                value={form.id || ''}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
            </label>
            <label>
              <span>Name</span>
              <input type="text"
                value={form.name || ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </label>
            <label>
              <span>Default Department</span>
              <select
                value={form.default_department || ''}
                onChange={e => setForm(f => ({ ...f, default_department: e.target.value }))}>
                <option value="">(none)</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>
          <label className="pg-form-wide">
            <span>Notes</span>
            <textarea rows={2}
              value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </label>
        </div>

        <div className="pg-modal-matrix">
          <div className="pg-matrix-head">
            <span>Tab × Access Mode</span>
            <div className="pg-bulk">
              <span>Bulk:</span>
              <button onClick={() => bulkSet('hidden')} className="pg-bulk-btn pg-bulk-hidden">All Hidden</button>
              <button onClick={() => bulkSet('read')}   className="pg-bulk-btn pg-bulk-read">All Read</button>
              <button onClick={() => bulkSet('edit')}   className="pg-bulk-btn pg-bulk-edit">All Edit</button>
              <button onClick={() => bulkSet(null)}    className="pg-bulk-btn">Clear (default)</button>
            </div>
          </div>
          <table className="pg-matrix">
            <thead>
              <tr>
                <th>Tab ID</th>
                <th>Label</th>
                {ACCESS_MODES.map(m => (
                  <th key={m.v} style={{ color: m.color }}>{m.icon} {m.label}</th>
                ))}
                <th title="Clear / default">—</th>
              </tr>
            </thead>
            <tbody>
              {tabCatalog.map(t => {
                const current = form.tab_permissions?.[t.id];
                return (
                  <tr key={t.id} className={'pg-matrix-row' + (current ? ' pg-matrix-set' : '')}>
                    <td className="pg-mono">{t.id}</td>
                    <td><b>{t.label}</b></td>
                    {ACCESS_MODES.map(m => (
                      <td key={m.v} style={{ textAlign: 'center' }}>
                        <input type="radio"
                          name={`perm-${t.id}`}
                          checked={current === m.v}
                          onChange={() => setTabPerm(t.id, m.v)}
                          style={{ accentColor: m.color }}
                          disabled={group.is_system}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      <button className="pg-cell-clear"
                        onClick={() => setTabPerm(t.id, null)}
                        disabled={group.is_system || !current}
                        title="Unset (falls back to default = edit)"
                      >×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </Modal.Body>
      <Modal.Footer align="between">
        <span className="pg-sys-note">
          {group.is_system ? 'System group — read-only. Duplicate to customise.' : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn op-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="op-btn op-btn-primary" onClick={handleSave} disabled={saving || group.is_system}>
            {saving ? 'Saving…' : (isCreate ? 'Create Group' : 'Save Changes')}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
