// @ts-check
/**
 * MaterialActiveBadge — Quote History list view badge (Sprint S-ALT-MAT, PR #C).
 *
 * Surfaces which material set drives the quote's cost at a glance from
 * the Quote History row. Mirrors PR #A toggle visual language (radio
 * pills) but compact + read-only.
 *
 * Cases (per amendment B from PR #C task spec):
 *   - Std quote OR Cpx with 0 SPs → no badge
 *   - Cpx with 1 SP → 'Main' or 'Alt' single label (NOT 'Mixed (1/0)')
 *   - All SPs main → 'Main'
 *   - All SPs alt → 'Alt'
 *   - Cpx mixed → 'Mixed (N alt / M main)'
 *
 * The summary calculation is exposed as a pure helper so tests can lock
 * in the dispatch without rendering React.
 */
import './MaterialActiveBadge.css';
// Pure helper lives in a .js sibling (materialActiveBadgeSummary.js) so
// node:test can import it without JSX loader config. Callers should
// import the helper directly from that file — re-exporting it here
// would violate the react-refresh "only export components from .jsx"
// rule and break Fast Refresh during dev.

export default function MaterialActiveBadge({ summary, t }) {
  if (!summary) return null;
  const translate = typeof t === 'function' ? t : (key) => key;
  if (summary.kind === 'main') {
    return (
      <span className="mab mab-main" title={translate('pricing.materials.badge.tooltip')}>
        {translate('pricing.materials.badge.main')}
      </span>
    );
  }
  if (summary.kind === 'alt') {
    return (
      <span className="mab mab-alt" title={translate('pricing.materials.badge.tooltip')}>
        {translate('pricing.materials.badge.alt')}
      </span>
    );
  }
  // mixed
  const label = translate('pricing.materials.badge.mixed', {
    altCount: summary.altCount,
    mainCount: summary.mainCount,
  });
  return (
    <span className="mab mab-mixed" title={translate('pricing.materials.badge.tooltip')}>
      {label}
    </span>
  );
}
