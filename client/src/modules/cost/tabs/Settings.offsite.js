/**
 * One line of text for the off-site mirror on the Backup card.
 *
 * Pure so it can be tested without a React renderer (this repo has none).
 * The server decides the verdict in offsiteStatus.js; this only words it.
 */

/** "3 giờ" / "2 ngày" — coarse on purpose, nobody needs minutes here. */
export function fmtAge(hours) {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 1) return '<1h';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * @param {object|null} offsite  the `offsite` block from getStatus()
 * @param {(k:string)=>string} t
 * @returns {{tone:string, text:string, title:string}}
 */
export function offsiteLine(offsite, t) {
  const o = offsite || { tone: 'none', reason: 'not_configured' };
  const dest = o.dest ? `\n${o.dest}` : '';
  const detail = o.detail ? `\n${o.detail}` : '';

  let text;
  switch (o.reason) {
    case 'ok':
      text = `${t('set.offsite.ok')} · ${fmtAge(o.ageHours)} ${t('set.offsite.ago')}`;
      break;
    case 'stale':
      text = `${t('set.offsite.stale')} ${fmtAge(o.ageHours)}`;
      break;
    case 'never_succeeded':
      text = t('set.offsite.never');
      break;
    case 'last_run_failed':
      text = t('set.offsite.last_failed');
      break;
    case 'unreadable_timestamp':
      text = t('set.offsite.bad_time');
      break;
    default:
      text = t('set.offsite.none');
  }
  return {
    tone: o.tone || 'none',
    text: `${t('set.offsite')}: ${text}`,
    title: `${text}${dest}${detail}`.trim(),
  };
}
