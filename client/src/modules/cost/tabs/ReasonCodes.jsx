/**
 * ReasonCodes — Sprint MES-3-V2 (KIOSK-002) Library admin tab.
 *
 * Admin-only CRUD for the kiosk reason-code picker. Soft-delete only:
 * disable flips active=0; the row stays for audit-log resolution.
 *
 * Layout (top → bottom):
 *   - Header strip: title + [+ Add] button + Show-disabled toggle + search
 *   - Empty state OR table (Code / Label EN / Label VI / Category / Status / Actions)
 *
 * Modals (lazy via the shared <Modal> primitive):
 *   - ReasonCodeFormModal — create + edit (mode prop)
 *   - ReasonCodeDisableModal — confirm soft-delete
 *
 * AccessGate is wired in CostModule.jsx; viewers fall through to the
 * server's 403 anyway because every mutation hits requireRole(admin).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useI18n } from '../../../utils/useI18n';
import { useAuth } from '../../../context/AuthContext';
import {
  listReasonCodes,
  createReasonCode,
  updateReasonCode,
  disableReasonCode,
  enableReasonCode,
} from '../../../services/reasonCodesApi';
import EmptyState from '../../../components/Shared/EmptyState';
import ReasonCodeFormModal from './ReasonCodeFormModal';
import ReasonCodeDisableModal from './ReasonCodeDisableModal';
import './ReasonCodes.css';

export default function ReasonCodes() {
  const { t } = useI18n();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | { mode: 'create' } | { mode: 'edit', row }
  const [disabling, setDisabling] = useState(null); // null | row

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await listReasonCodes({ includeDisabled: true });
      setRows(Array.isArray(r.items) ? r.items : []);
    } catch (e) {
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showDisabled && r.active === 0) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        (r.label_en || '').toLowerCase().includes(q) ||
        (r.label_vn || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, showDisabled]);

  const onCreate = async (payload) => {
    await createReasonCode(payload);
    setEditing(null);
    await load();
  };
  const onUpdate = async (code, patch) => {
    await updateReasonCode(code, patch);
    setEditing(null);
    await load();
  };
  const onDisable = async (code) => {
    await disableReasonCode(code);
    setDisabling(null);
    await load();
  };
  const onEnable = async (code) => {
    await enableReasonCode(code);
    await load();
  };

  return (
    <div className="rc">
      <header className="rc-head">
        <div>
          <h2 className="rc-title">{t('library.reasonCodes.title')}</h2>
          <p className="rc-sub">{t('library.reasonCodes.subtitle')}</p>
        </div>
        <div className="rc-head-actions">
          <input
            type="search"
            className="rc-search"
            placeholder={t('library.reasonCodes.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('library.reasonCodes.searchPlaceholder')}
          />
          <label className="rc-toggle">
            <input
              type="checkbox"
              checked={showDisabled}
              onChange={(e) => setShowDisabled(e.target.checked)}
            />
            {t('library.reasonCodes.showDisabled')}
          </label>
          {canEdit && (
            <button
              type="button"
              className="op-btn op-btn-primary"
              onClick={() => setEditing({ mode: 'create' })}
            >
              + {t('library.reasonCodes.add')}
            </button>
          )}
        </div>
      </header>

      {err && <div className="rc-banner rc-banner-error">{err}</div>}

      {loading ? (
        <div className="rc-loading">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={t('library.reasonCodes.empty.title')}
          hint={t('library.reasonCodes.empty.hint')}
        />
      ) : (
        <table className="rc-table">
          <thead>
            <tr>
              <th className="rc-th-code">{t('library.reasonCodes.code')}</th>
              <th>{t('library.reasonCodes.labelEn')}</th>
              <th>{t('library.reasonCodes.labelVi')}</th>
              <th className="rc-th-cat">{t('library.reasonCodes.category')}</th>
              <th className="rc-th-sort">{t('library.reasonCodes.sortOrder')}</th>
              <th className="rc-th-status">{t('library.reasonCodes.status')}</th>
              {canEdit && <th className="rc-th-actions">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.code} className={r.active === 0 ? 'rc-row-disabled' : ''}>
                <td className="rc-td-code">{r.code}</td>
                <td>{r.label_en}</td>
                <td>{r.label_vn}</td>
                <td>
                  <span className={`rc-chip rc-chip-${r.category}`}>
                    {t(`library.reasonCodes.category.${r.category}`)}
                  </span>
                </td>
                <td className="rc-td-sort">{r.sort_order}</td>
                <td>
                  <span className={`rc-status rc-status-${r.active === 1 ? 'active' : 'disabled'}`}>
                    {t(
                      r.active === 1
                        ? 'library.reasonCodes.statusActive'
                        : 'library.reasonCodes.statusDisabled'
                    )}
                  </span>
                </td>
                {canEdit && (
                  <td className="rc-td-actions">
                    <button
                      type="button"
                      className="op-btn op-btn-secondary op-btn-sm"
                      onClick={() => setEditing({ mode: 'edit', row: r })}
                    >
                      {t('common.edit')}
                    </button>
                    {r.active === 1 ? (
                      <button
                        type="button"
                        className="op-btn op-btn-secondary op-btn-sm rc-btn-danger"
                        onClick={() => setDisabling(r)}
                      >
                        {t('library.reasonCodes.disable')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="op-btn op-btn-secondary op-btn-sm"
                        onClick={() => onEnable(r.code)}
                      >
                        {t('library.reasonCodes.enable')}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <ReasonCodeFormModal
          mode={editing.mode}
          row={editing.row}
          onCancel={() => setEditing(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
      {disabling && (
        <ReasonCodeDisableModal
          row={disabling}
          onCancel={() => setDisabling(null)}
          onConfirm={() => onDisable(disabling.code)}
        />
      )}
    </div>
  );
}
