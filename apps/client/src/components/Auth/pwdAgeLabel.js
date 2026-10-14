/**
 * Pure text resolution for PwdAgeBar.
 *
 * Extracted so the two rules below can be tested — this repo has no React
 * test renderer, so logic that needs pinning lives in a plain .js beside its
 * component (same as loginChangePwdDispatcher.js and covOvrState.js).
 *
 * Two rules, and the first one is a bug fix:
 *
 *   1. An expired password wins over a caller-supplied label. The component
 *      always meant to say so — `daysRemaining === 0 ? 'Password expired'
 *      : 'Password age'` was there from the start — but #288 translated the
 *      caption by having LoginPage pass `label={t('login.pwd_age_label')}`,
 *      and a truthy `label` short-circuited the expired branch. So the only
 *      caller silently made it unreachable: an operator whose password had
 *      expired read "Password age  0 / 90 days". Expired is a STATE, not a
 *      caption, so it now takes precedence; a caller's label still wins for
 *      every non-expired case, which is what the prop is for.
 *
 *   2. The unit is translated. It is rendered by the component, not passed
 *      in, so it stayed English in every locale even after #288.
 */

/**
 * @param {{daysRemaining: number, label?: string|false, t: (k: string) => string}} a
 * @returns {string} the caption to render
 */
export function resolvePwdAgeLabel({ daysRemaining, label, t }) {
  if (daysRemaining === 0) return t('login.pwd_age_expired');
  return label || t('login.pwd_age_label');
}

/**
 * Vietnamese has no plural inflection, so both keys resolve to "ngày"; the
 * split exists for English and keeps the call site free of locale logic.
 *
 * @param {{daysRemaining: number, t: (k: string) => string}} a
 * @returns {string} the unit beside the day count
 */
export function resolvePwdAgeUnit({ daysRemaining, t }) {
  return t(daysRemaining === 1 ? 'login.pwd_age_day' : 'login.pwd_age_days');
}
