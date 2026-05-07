import { lazy, Suspense } from 'react';
import SkeletonTable from '../../components/Shared/SkeletonTable';
import ErrorBoundary from '../../components/Shared/ErrorBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import ModuleLanding from '../../components/Layout/ModuleLanding.jsx';
import HomePage from '../home/HomePage.jsx';
import {
  PLANNING_SECTIONS,
  isLanding,
  landingSectionId,
} from '../../components/Layout/sectionDefs.js';
import './PlanningModule.css';

// Phase 9I — lazy-load each planning tab. Most users hit Order Entry
// daily and the other tabs rarely; shipping WorkOrders + WIPTracker
// code in the initial bundle for a sales user who never visits
// Planning is pure waste.
const OrderEntry      = lazy(() => import('./tabs/OrderEntry'));
const BOMExplosion    = lazy(() => import('./tabs/BOMExplosion'));
const MaterialCheck   = lazy(() => import('./tabs/MaterialCheck'));
const CapacityPlanning = lazy(() => import('./tabs/CapacityPlanning'));
const WorkOrders      = lazy(() => import('./tabs/WorkOrders'));
const WIPTracker      = lazy(() => import('./tabs/WIPTracker'));

const TAB_COMPONENTS = {
  'order-entry': OrderEntry,
  'bom-explosion': BOMExplosion,
  'material-check': MaterialCheck,
  'capacity': CapacityPlanning,
  'work-orders': WorkOrders,
  'wip-tracker': WIPTracker,
};

const TAB_TITLES = {
  'order-entry': 'Order Entry',
  'bom-explosion': 'BOM Explosion',
  'material-check': 'Material Check',
  'capacity': 'Capacity Planning',
  'work-orders': 'Work Orders',
  'wip-tracker': 'WIP Tracker',
};

// Preload helper lives in utils/tabPreload.js (Fast Refresh constraint).

function TabLoadingFallback() {
  return (
    <div style={{ padding: 24 }}>
      <SkeletonTable rows={6} cols={4} />
    </div>
  );
}

export default function PlanningModule({ activeTab, onTabChange }) {
  useDocumentTitle(TAB_TITLES[activeTab] || activeTab, 'Planning');

  // Sprint S-HOME — operator dashboard at activeTab='home'.
  if (activeTab === 'home') {
    return (
      <div className="planning-module">
        <ErrorBoundary label="Planning → home" resetKey="home">
          <HomePage onTabChange={onTabChange} />
        </ErrorBoundary>
      </div>
    );
  }

  // Sprint S-LANDING — `landing:<sectionId>` renders the feature grid
  // for the section instead of a specific tab. See ModuleLanding.jsx.
  if (isLanding(activeTab)) {
    const sid = landingSectionId(activeTab);
    const section = PLANNING_SECTIONS.find((s) => s.id === sid);
    if (!section) {
      return (
        <div className="tab-placeholder">
          <p>Unknown section: <b>{sid}</b></p>
        </div>
      );
    }
    return (
      <div className="planning-module">
        <ErrorBoundary label={`Planning → landing/${sid}`} resetKey={activeTab}>
          <ModuleLanding section={section} onTabChange={onTabChange} />
        </ErrorBoundary>
      </div>
    );
  }

  const TabComponent = TAB_COMPONENTS[activeTab];

  if (!TabComponent) {
    return (
      <div className="tab-placeholder">
        <p>Select a tab from the sidebar</p>
      </div>
    );
  }

  return (
    <div className="planning-module">
      <ErrorBoundary label={`Planning → ${activeTab}`} resetKey={activeTab}>
        <Suspense fallback={<TabLoadingFallback />}>
          <TabComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
