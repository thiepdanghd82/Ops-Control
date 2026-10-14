/**
 * pickLang — picks ONE language for a bilingual content pair.
 *
 * Several screens keep Vietnamese copy inline beside the English rather
 * than in STRINGS, because the two halves are authored together and read
 * together: CalcLegend's formula manual (nameVi / noteVi / titleVi /
 * bodyVi / vi=) and the Help tab's content.js entries ({ en, vi }).
 * Rendering both at once was the "two languages on screen" defect; this
 * helper is the single place that decides which twin shows. English is
 * the fallback whenever the Vietnamese twin is missing, so an
 * untranslated block degrades to EN instead of vanishing.
 */
export function pickLang(locale, en, vi) {
  if (locale === 'vi' && vi != null && vi !== '') return vi;
  return en;
}
