/**
 * SystemControl — SYS-only "lean mode" panel (Sprint S-SYSCTRL).
 *
 * GLOBALLY shows/hides main-sidebar sections + tabs for ALL users. This is a
 * global VISIBILITY layer, distinct from per-user permission groups.
 *
 * HARD RULE (enforced in the Sidebar via applySidebarVisibility, not here):
 * it can only HIDE, never WIDEN — the global-hide is AND-ed AFTER the existing
 * minRole + permission-group access gates, so un-hiding a tab does NOT grant
 * anyone access they didn't already have. This panel just edits the hidden set.
 *
 * The catalog comes from the SAME React-free module the Sidebar renders
 * (sidebarSections.js) so the toggle list can never drift. The `system`
 * section (Settings / this panel) is excluded — it must stay reachable.
 */
import { useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { useSidebarVisibility } from '../../../context/useAppConfig';
import { toggleableSections } from '../../../components/Layout/sidebarSections.js';
import { costApi } from '../../../services/api';
import { showToast } from '../../../utils/toast';
import './SystemControl.css';

const setsEqual = (set, arr) => set.size === arr.length && arr.every((x) => set.has(x));

export default function SystemControl() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isSys = user?.role === 'sys';
  const { hiddenTabs, hiddenSections, setSidebarVisibility } = useSidebarVisibility();

  const [tabs, setTabs] = useState(() => new Set(hiddenTabs));
  const [secs, setSecs] = useState(() => new Set(hiddenSections));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  const sections = useMemo(() => toggleableSections(), []);
  const dirty = useMemo(
    () => !(setsEqual(tabs, hiddenTabs) && setsEqual(secs, hiddenSections)),
    [tabs, secs, hiddenTabs, hiddenSections]
  );

  // Defense-in-depth: the menu item is already minRole:'sys' gated, but a
  // direct route to this component must still refuse non-SYS.
  if (!isSys) {
    return (
      <div className="sysctl-forbidden">
        <div className="sysctl-forbidden-icon" aria-hidden="true">
          ⊘
        </div>
        <h2>{t('system_control.title')}</h2>
        <p>{t('system_control.forbidden')}</p>
      </div>
    );
  }

  const toggleSet = (setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSection = toggleSet(setSecs);
  const toggleTab = toggleSet(setTabs);
  const reset = () => {
    setTabs(new Set());
    setSecs(new Set());
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { hiddenTabs: [...tabs], hiddenSections: [...secs] };
      await costApi.updateSidebarVisibility(payload);
      // Optimistic — the SYS operator sees the sidebar badges update at once;
      // everyone else picks it up on their next load / runtime-config fetch.
      setSidebarVisibility(payload);
      setFlash(t('system_control.saved'));
      setTimeout(() => setFlash(''), 3000);
    } catch (e) {
      showToast(`${t('system_control.save_failed')}${e?.message ? `: ${e.message}` : ''}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sysctl">
      <div className="sysctl-head">
        <h2 className="sysctl-title">{t('system_control.title')}</h2>
        <p className="sysctl-note">{t('system_control.note')}</p>
      </div>

      <div className="sysctl-toolbar">
        <button type="button" className="op-btn" onClick={reset} disabled={saving}>
          {t('system_control.show_all')}
        </button>
        <span className="sysctl-toolbar-right">
          {flash && <span className="sysctl-flash">{flash}</span>}
          <button
            type="button"
            className="op-btn op-btn-primary"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? t('system_control.saving') : t('system_control.save')}
            {dirty && !saving ? ' •' : ''}
          </button>
        </span>
      </div>

      {sections.map((section) => {
        const sectionHidden = secs.has(section.id);
        return (
          <fieldset
            key={section.id}
            className={`sysctl-section ${sectionHidden ? 'is-hidden' : ''}`}
          >
            <legend className="sysctl-section-legend">
              <span className="sysctl-section-label">{t(section.labelKey)}</span>
              <button
                type="button"
                className={`sysctl-toggle sysctl-toggle-master ${sectionHidden ? 'is-off' : 'is-on'}`}
                onClick={() => toggleSection(section.id)}
                aria-pressed={!sectionHidden}
                title={t('system_control.master_hint')}
              >
                {sectionHidden ? t('system_control.hidden') : t('system_control.visible')}
              </button>
            </legend>
            <div className="sysctl-rows">
              {section.tabs.map((tab) => {
                const tabHidden = sectionHidden || tabs.has(tab.id);
                return (
                  <div key={tab.id} className="sysctl-row">
                    <span className="sysctl-row-label">{t(tab.labelKey)}</span>
                    <button
                      type="button"
                      className={`sysctl-toggle ${tabHidden ? 'is-off' : 'is-on'}`}
                      onClick={() => toggleTab(tab.id)}
                      disabled={sectionHidden}
                      aria-pressed={!tabHidden}
                      title={sectionHidden ? t('system_control.section_hidden_hint') : undefined}
                    >
                      {tabHidden ? t('system_control.hidden') : t('system_control.visible')}
                    </button>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
