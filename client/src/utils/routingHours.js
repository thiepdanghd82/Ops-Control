// PP-08: routing-operation hours calculator.
//
// routing_operations.factor_unit distinguishes UPH (units/hour) from
// fixed-hours runtime — typical setup-heavy or batch ops report a
// fixed run time in hours, while continuous-rate ops report UPH.
// Treating all rows as UPH (the v1.4 default) over-counts hours for
// fixed-hour ops by a factor of (qty / runFactor), which can be 1000×
// for high-volume jobs.
//
// IFS exports use "Hours" / "Units/Hour" (capitalized words); the
// reference Production-Plan-Tool used the shorthand 'h' / 'u'. We
// accept either by checking the leading letter case-insensitively —
// any string starting with H/h is treated as fixed-hours; everything
// else (including null/undefined/empty) defaults to UPH mode.
//
// Reference: Production-Plan-Tool.html lines 23167-23185.

export function computeOpHours({ setupTime, runFactor, factorUnit, quantity }) {
  const setupHrs = Number.isFinite(setupTime) && setupTime > 0 ? setupTime : 0;
  const rf = Number.isFinite(runFactor) && runFactor > 0 ? runFactor : 0;
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const isFixedHours =
    typeof factorUnit === 'string' && factorUnit.trim().toLowerCase().startsWith('h');
  let runHrs;
  if (rf === 0) {
    runHrs = 0;
  } else if (isFixedHours) {
    runHrs = rf;
  } else {
    runHrs = qty / rf;
  }
  return {
    setupHrs,
    runHrs,
    totalHrs: setupHrs + runHrs,
    isFixedHours,
  };
}
