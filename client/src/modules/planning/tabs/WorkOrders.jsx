/**
 * Work Orders tab — shell that toggles between the legacy generator UI
 * and the new MES-1.5 v2 lifecycle UI based on the server feature flag
 * `mes.workOrder.enabled`.
 *
 * Default behaviour (flag off / 404 on /v2/config probe) is the legacy
 * Order→WO generator that ships in v1.2 — preserves backwards-compat
 * for installs that haven't enabled the MES-1 sprint suite yet.
 */
import { lazy, Suspense } from 'react';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import { useMesWorkOrderFlag } from '../v2/useMesWorkOrderFlag';
import './WorkOrders.css';

const WorkOrdersV2 = lazy(() => import('../v2/WorkOrdersV2'));
const WorkOrdersLegacy = lazy(() => import('./WorkOrdersLegacy'));

export default function WorkOrders() {
  const { loading, enabled } = useMesWorkOrderFlag();
  if (loading) return <SkeletonTable rows={5} cols={6} />;

  return (
    <Suspense fallback={<SkeletonTable rows={5} cols={6} />}>
      {enabled ? <WorkOrdersV2 /> : <WorkOrdersLegacy />}
    </Suspense>
  );
}
