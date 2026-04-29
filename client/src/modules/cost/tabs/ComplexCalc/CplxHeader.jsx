/**
 * CplxHeader — RFQ Information card wrapper for the Complex Calculator.
 * Sprint 5.1 extracted the visual card into the shared RfqInfoCard
 * component; this file now just wires state + callbacks.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useCalc } from '../../../../context/CalcContext';
import { useCostLib } from '../../../../context/CostLibContext';
import { getDesignProcessList } from '../../../../utils/ddl';
import { genRfqNum } from '../../../../utils/rfqGen';
import { sharedApi } from '../../../../services/api';
import RfqInfoCard from '../../../../components/Shared/RfqInfoCard';

export default function CplxHeader() {
  const { stdState, cplxState, setCplxField } = useCalc();
  const { lib, setActiveSite } = useCostLib();
  const cs = cplxState;

  const handleField = useCallback((field, value, isNum = false) => {
    // Accept number (from DecimalInput in RfqInfoCard) or string (legacy).
    const v = isNum
      ? (typeof value === 'number' ? value : (parseFloat(value) || 0))
      : value;
    setCplxField(field, v);
    if (field === 'site') setActiveSite(v);
  }, [setCplxField, setActiveSite]);

  // Phase 9D.1 — sync CostLibContext.activeSite with the quote's own
  // site field so loading a saved quote picks up that site's rates
  // automatically. Parallel to the StandardCalc CalcHeader effect.
  useEffect(() => {
    if (cs.site) setActiveSite(cs.site);
  }, [cs.site, setActiveSite]);

  const npiOwners = useMemo(() => {
    const list = lib?.ddl?.npi_owner || [];
    return Array.isArray(list) ? list : [];
  }, [lib]);

  const designProcessOpts = useMemo(() => getDesignProcessList(lib), [lib]);

  const tradeModeOpts = useMemo(() => {
    const list = lib?.ddl?.trade_mode || [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }, [lib]);

  const generateRfqNumber = useCallback(async () => {
    const quotes = await sharedApi.getQuotes().catch(() => []);
    const num = genRfqNum('C', quotes, stdState, cplxState);
    setCplxField('rfq_number', num);
  }, [setCplxField, stdState, cplxState]);

  return (
    <RfqInfoCard
      state={cs}
      onChange={handleField}
      onGenerateRfq={generateRfqNumber}
      npiOwners={npiOwners}
      designProcessOpts={designProcessOpts}
      tradeModeOpts={tradeModeOpts}
      datalistId="cc-npi-owners-list"
    />
  );
}
