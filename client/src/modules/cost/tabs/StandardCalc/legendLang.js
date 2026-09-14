/**
 * legendLang — picks ONE language for a bilingual Legend pair.
 *
 * CalcLegend keeps its Vietnamese copy inline next to the English
 * (nameVi / noteVi / titleVi / bodyVi / vi=). Rendering both at once was
 * the "two languages on screen" defect; this helper is the single place
 * that decides which twin shows. English is the fallback whenever the
 * Vietnamese twin is missing, so an untranslated block degrades to EN
 * instead of vanishing.
 */
export function pickLang(locale, en, vi) {
  if (locale === 'vi' && vi != null && vi !== '') return vi;
  return en;
}
