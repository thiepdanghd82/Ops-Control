/**
 * useI18n — Phase 9P i18n hook.
 *
 * API:
 *   const { locale, setLocale, t } = useI18n();
 *   t('dashboard.title')
 *   t('dashboard.kpi.won_lost', { won: 2, lost: 1 })
 *
 * Locale source priority:
 *   1. localStorage('ops_locale') — user's explicit choice
 *   2. navigator.language prefix — auto-detect for first visit
 *   3. DEFAULT_LOCALE (en) — fallback
 *
 * Storage key `ops_locale` is human-readable for support + bug reports.
 * The hook is INTENTIONALLY simple: no context, no subscription. Each
 * component that calls useI18n gets its own listener on the localStorage
 * `storage` event so cross-tab changes propagate. Not as efficient as a
 * context-based approach but with ~50 strings per screen the overhead
 * is invisible and this pattern stays refactor-friendly.
 */
import { useCallback, useEffect, useState } from 'react';
import { translate, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n/strings';

const STORAGE_KEY = 'ops_locale';

export function readStoredLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && SUPPORTED_LOCALES.includes(v)) return v;
  } catch {
    /* quota / private mode */
  }
  // Auto-detect from browser. navigator.language is like 'vi-VN' or 'en-US'.
  if (typeof navigator !== 'undefined' && navigator.language) {
    const prefix = String(navigator.language).toLowerCase().split('-')[0];
    if (SUPPORTED_LOCALES.includes(prefix)) return prefix;
  }
  return DEFAULT_LOCALE;
}

export function useI18n() {
  const [locale, setLocaleState] = useState(() => readStoredLocale());

  const setLocale = useCallback((next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* quota */
    }
    setLocaleState(next);
  }, []);

  // Cross-tab sync: if the user toggles locale in another tab, this
  // tab picks up the change too. `storage` fires on OTHER tabs, not
  // the one that wrote — so we don't double-dispatch.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY && e.newValue && SUPPORTED_LOCALES.includes(e.newValue)) {
        setLocaleState(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const t = useCallback((key, vars) => translate(key, locale, vars), [locale]);

  return { locale, setLocale, t };
}
