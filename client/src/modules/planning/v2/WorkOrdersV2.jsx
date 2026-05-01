/**
 * MES-1.5 — Top-level v2 Work Orders router (in-tab state, no URL).
 *
 * TODO(router-migration): the app currently has no router (D2). Detail
 * navigation is in-tab state — clicking a row sets `selectedWoId`,
 * the tab swaps to detail view. URL doesn't change for detail; back-
 * button doesn't return to list. When a real router lands, replace
 * this with route-based navigation `/planning/work-orders/:id`.
 *
 * List filters DO sync to URL search params (see useUrlFilters.js) so
 * a refresh on the list page preserves the filter set.
 */
import { useState } from 'react';
import WorkOrderList from './WorkOrderList';
import WorkOrderDetail from './WorkOrderDetail';

export default function WorkOrdersV2() {
  const [selectedWoId, setSelectedWoId] = useState(null);

  if (selectedWoId !== null) {
    return <WorkOrderDetail id={selectedWoId} onBack={() => setSelectedWoId(null)} />;
  }
  return <WorkOrderList onSelect={setSelectedWoId} />;
}
