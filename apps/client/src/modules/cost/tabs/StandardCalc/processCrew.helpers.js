/**
 * processCrew.helpers — pure helpers for the Process CREW column.
 *
 * CREW is the throughput / balancing lever. `proc.crew` overrides the Rate
 * Table crew when set; undefined/blank falls back to the rate value (BC for
 * quotes that never touched the column). Shared by Standard CalcProcesses and
 * Complex SubProductRow so the override-affordance logic can't drift.
 *
 * The MAN-UPH derivation + labor math live inside calcEngine.calcProcess
 * (single source of truth); the UI reads the derived value back from the
 * calcProcess result (`result.manualUph`). Here we only resolve the CREW
 * cell's display value + override flag, and detect manual-derived rows.
 */

/**
 * Resolve the effective crew + whether the CREW column overrides the rate.
 * @param {number|string|null|undefined} procCrew  value in the CREW column
 * @param {number|string|null|undefined} rateCrew  Rate Table crew baseline
 * @returns {{ value:number, isOverride:boolean, base:number }}
 */
export function crewOverrideState(procCrew, rateCrew) {
  const baseRaw = Number(rateCrew);
  const base = Number.isFinite(baseRaw) && baseRaw > 0 ? baseRaw : 1;
  const raw = Number(procCrew);
  const hasVal = Number.isFinite(raw) && raw > 0;
  return {
    value: hasVal ? raw : base,
    isOverride: hasVal && raw !== base,
    base,
  };
}

/**
 * Manual-derived row = no machine throughput (uph === 0) but a per-operator
 * speed is entered, so MAN UPH is derived from crew × eff × speed and shown
 * read-only. Machine rows + legacy typed-manual_uph rows keep the input.
 * @param {{uph:number}|null|undefined} result  calcProcess result for the row
 * @param {number|string|null|undefined} speed  proc.speed
 * @returns {boolean}
 */
export function isManualDerivedRow(result, speed) {
  return !!result && Number(result.uph) === 0 && Number(speed) > 0;
}
