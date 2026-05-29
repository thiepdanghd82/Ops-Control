/**
 * LangFlagToggle — compact EN ↔ VN flag pill, used as a per-tab quick
 * language switch on tabs that mix Vietnamese + English content
 * (Hardware Devices, Connection Mode). Sits at the top-right of the
 * section header, aligned with the title line.
 *
 * The global preference also lives in Settings → Appearance; this
 * toggle just makes the same `useI18n.setLocale` accessible inline so
 * operators don't have to navigate away to read the tab in their
 * preferred language.
 */
import React from 'react';
import { useI18n } from '../../utils/useI18n';
import './LangFlagToggle.css';

export default function LangFlagToggle({ className = '' }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={`lang-flag-toggle ${className}`.trim()}
      role="group"
      aria-label={t('common.lang_toggle_aria')}
    >
      <button
        type="button"
        className={`lang-flag-btn ${locale === 'en' ? 'is-active' : ''}`}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        aria-label="English"
        title="English"
      >
        <span className="lang-flag-emoji" aria-hidden="true">
          🇬🇧
        </span>
        <span className="lang-flag-code">EN</span>
      </button>
      <button
        type="button"
        className={`lang-flag-btn ${locale === 'vi' ? 'is-active' : ''}`}
        onClick={() => setLocale('vi')}
        aria-pressed={locale === 'vi'}
        aria-label="Tiếng Việt"
        title="Tiếng Việt"
      >
        <span className="lang-flag-emoji" aria-hidden="true">
          🇻🇳
        </span>
        <span className="lang-flag-code">VN</span>
      </button>
    </div>
  );
}
