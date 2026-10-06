/**
 * ProcessLayoutCell — the Processes-table LAYOUT cell (2026-10-06). Shared by
 * Std (CalcProcesses) and Cpx (SubProductRow) so the two grids show the synced
 * cavity the same way (Lesson 48).
 *
 * A Print or Die_Cut row follows the Layout tab's cavity — Print Total/Shot,
 * or the cutter its tool type names (services/processLayoutSync.js). The
 * reducer writes that number into `proc.layout`; this cell only shows it:
 *   • follows nothing     → the plain input it always was.
 *   • follows the Layout  → blue number, tooltip naming the source.
 *   • typed over          → violet number + ↻ to follow the Layout again.
 * Typing goes through each grid's own parser (onChange gets the raw string).
 * Class-based styling only (Lesson 6); the cell owns its stylesheet (#309).
 */
import { useI18n } from '../../../utils/useI18n';
import { syncedLayoutFor } from '../../../services/processLayoutSync';
import './ProcessLayoutCell.css';

export default function ProcessLayoutCell({
  proc,
  state,
  onChange,
  onReset,
  inputClassName,
  title,
}) {
  const { t } = useI18n();
  const synced = syncedLayoutFor(proc, state);
  const value = proc.layout || '';
  const input = (cls, tip) => (
    <input
      type="number"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className={cls ? `${inputClassName} ${cls}` : inputClassName}
      title={tip}
    />
  );

  if (!synced) return input('', title);

  const n = synced.value;
  if (!proc.layout_ovr) {
    const tip =
      synced.kind === 'cutter'
        ? t('cgrid.proc.layout_sync_cutter', { i: synced.index + 1, type: synced.type, n })
        : t('cgrid.proc.layout_sync_print', { n });
    return input('plc-sync', tip);
  }

  return (
    <div className="plc-ovr-wrap">
      {input('plc-ovr', t('cgrid.proc.layout_ovr', { n }))}
      <button
        type="button"
        className="plc-reset"
        onClick={onReset}
        title={t('cgrid.proc.layout_reset', { n })}
        aria-label={t('cgrid.proc.layout_reset', { n })}
      >
        ↻
      </button>
    </div>
  );
}
