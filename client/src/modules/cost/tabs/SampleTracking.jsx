/**
 * SampleTracking — SAP-style 6-stage sample pipeline.
 *
 * Stages:  Request → Prep → Run → QC → Customer → Spec
 * Feature parity with RFQTracker:
 *   - Append-only audit log (server-enforced)
 *   - Required-field + required-checklist gates before advance
 *   - Standardized reason codes (NG N01-N99, Blocked R01-R99)
 *   - Immutable per-stage signatures + ⟲ Reopen
 *   - My Inbox filter (active-stage owner = current user)
 *   - Document Flow: RFQ → Sample → Production Order
 *   - Server-side attachments (photos, customer emails, feedback PDFs)
 *   - 6-month trend chart (OK Rate + avg cycle)
 *   - Saved filter variants (localStorage)
 *   - Bulk ops in List view
 *
 * Reuses the `rfq2-*` CSS class tree for drawer chrome, KPI tiles,
 * audit timeline, etc. Sample-specific surfaces use `st2-*`.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { sharedApi, costApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import { parseLocaleNumber } from '../../../utils/format';
import { showToast } from '../../../utils/toast';
import useEscapeToClose from '../../../hooks/useEscapeToClose';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useAutoRefresh } from '../../../utils/useAutoRefresh';
import { subscribeDataEvents } from '../../../services/dataEventBus';
import './SampleTracking.css';
// Reuse the SAP drawer / audit / flow / attachments styling from RFQ Tracker.
import TrackerLegendModal from './TrackerLegendModal';
import './RFQTracker.css';

// ── pipeline ────────────────────────────────────────────────────

const PIPELINE = [
  {
    key: 'request',
    label: 'Request (Intake)',
    short: 'Request',
    color: '#2563eb',
    bg: '#dbeafe',
    role: 'Sales',
    purpose: 'Receive sample request from customer; capture specs, quantity, due date',
    sla_days: 1,
    required_fields: ['customer', 'submit_date', 'due_date', 'qty'],
    default_checklist: [
      { text: 'Design file received (AI / PDF)', required: true },
      { text: 'Specs confirmed (size, material)', required: true },
      { text: 'Sample qty stated', required: true },
      { text: 'Due date agreed with customer', required: true },
      { text: 'Linked RFQ (if any) captured', required: false },
    ],
  },
  {
    key: 'prep',
    label: 'Prep (Material + Film + Cutter)',
    short: 'Prep',
    color: '#7c3aed',
    bg: '#ede9fe',
    role: 'NPI Owner',
    purpose: 'Procure substrate, film/plate, and cutter; all three must be ready before Run',
    sla_days: 3,
    required_fields: ['specs.material_spec'],
    default_checklist: [
      { text: 'Material requested from supplier', required: true },
      { text: 'Material received', required: true },
      { text: 'Film / plate prepared', required: true },
      { text: 'Cutter prepared', required: true },
      { text: 'Prep kit staged at machine', required: false },
    ],
  },
  {
    key: 'run',
    label: 'Run (Sample Production)',
    short: 'Run',
    color: '#0891b2',
    bg: '#cffafe',
    role: 'Production',
    purpose: 'Run the sample on the scheduled line and produce the physical batch',
    sla_days: 2,
    required_fields: [],
    default_checklist: [
      { text: 'YCM request issued', required: true },
      { text: 'Machine / operator allocated', required: true },
      { text: 'Run started', required: true },
      { text: 'Run finished', required: true },
      { text: 'Sample batch handed to QC', required: true },
    ],
  },
  {
    key: 'qc',
    label: 'QC (Internal Inspection)',
    short: 'QC',
    color: '#059669',
    bg: '#d1fae5',
    role: 'QC',
    purpose: 'Visual + dimensional + functional check before shipping to customer',
    sla_days: 1,
    required_fields: [],
    default_checklist: [
      { text: 'Visual inspection', required: true },
      { text: 'Dimensional check', required: true },
      { text: 'Functional / performance test', required: false },
      { text: 'QC report signed', required: true },
    ],
  },
  {
    key: 'customer',
    label: 'Customer Feedback',
    short: 'Customer',
    color: '#d97706',
    bg: '#fef3c7',
    role: 'Sales',
    purpose: 'Ship sample to customer; record feedback OK/NG + issues; coordinate any rework',
    sla_days: 5,
    required_fields: [],
    default_checklist: [
      { text: 'Sample shipped to customer', required: true },
      { text: 'Shipment tracking logged', required: false },
      { text: 'Customer feedback received', required: true },
      { text: 'Issues logged (if any)', required: false },
      { text: 'Improvement action agreed', required: false },
    ],
  },
  {
    key: 'spec',
    label: 'Spec Released',
    short: 'Spec',
    color: '#15803d',
    bg: '#dcfce7',
    role: 'NPI Owner',
    purpose: 'Release spec document + hand off to Production; unlock quote finalisation',
    sla_days: 1,
    required_fields: [],
    default_checklist: [
      { text: 'Spec document released', required: true },
      { text: 'Linked quote updated', required: false },
      { text: 'Production order triggered', required: true },
      { text: 'Handover meeting done', required: false },
    ],
  },
];
const PIPELINE_KEYS = PIPELINE.map((p) => p.key);

const STATUS_OPTS = ['pending', 'active', 'done', 'blocked'];
const STATUS_LABEL = { pending: 'Pending', active: 'Active', done: 'Done', blocked: 'Blocked' };
const STATUS_COLOR = { pending: '#9ca3af', active: '#2563eb', done: '#22c55e', blocked: '#ef4444' };

const RESULT_OPTS = ['PENDING', 'OK', 'NG', 'PARTIAL'];
const RESULT_COLORS = { OK: '#22c55e', NG: '#ef4444', PENDING: '#f59e0b', PARTIAL: '#3b82f6' };

const SAMPLE_TYPES = [
  '',
  '1st article',
  'Colour match',
  'Engineering',
  'Limit sample',
  'Pre-production',
  'Other',
];
const PRODUCT_TYPES = ['', 'HP', 'Flexo', 'Offset', 'Silk Screen', 'Digital', 'Gallus', 'Hybrid'];

// Reason codes for NG results (L-style reportability — see RFQ Tracker).
const REASON_CODES = {
  blocked: [
    { code: 'R01', label: 'Material not available' },
    { code: 'R02', label: 'Film / plate defective' },
    { code: 'R03', label: 'Cutter unavailable' },
    { code: 'R04', label: 'Machine conflict / capacity' },
    { code: 'R05', label: 'Awaiting customer input' },
    { code: 'R06', label: 'Design file defective' },
    { code: 'R99', label: 'Other — see notes' },
  ],
  ng: [
    { code: 'N01', label: 'Colour mismatch' },
    { code: 'N02', label: 'Dimension out of spec' },
    { code: 'N03', label: 'Ink adhesion failure' },
    { code: 'N04', label: 'Die-cut defect' },
    { code: 'N05', label: 'Substrate defect' },
    { code: 'N06', label: 'Artwork error' },
    { code: 'N07', label: 'Registration / alignment' },
    { code: 'N99', label: 'Other — see notes' },
  ],
  ok: [
    { code: 'A01', label: 'Accepted as is' },
    { code: 'A02', label: 'Accepted with minor notes' },
  ],
};

// ── shape helpers ───────────────────────────────────────────────

function defaultStageBlock(cfg) {
  return {
    status: 'pending',
    owner: '',
    start: '',
    done: '',
    sla_days: cfg.sla_days,
    notes: '',
    reason_code: '',
    signed_by: '',
    signed_at: '',
    checklist: cfg.default_checklist.map((it) =>
      typeof it === 'string'
        ? { text: it, checked: false, required: false }
        : { text: it.text, checked: false, required: !!it.required }
    ),
  };
}
function defaultPipeline() {
  return Object.fromEntries(PIPELINE.map((cfg) => [cfg.key, defaultStageBlock(cfg)]));
}
function defaultSpecs() {
  return {
    sample_type: '',
    product_type: '',
    width_mm: 0,
    height_mm: 0,
    material_spec: '',
    film_plate: '',
    cutter_name: '',
    ink_spec: '',
    substrate: '',
    // parallel Prep sub-tracks — each has requested / eta / status (pending|in-progress|done|blocked)
    material_req_date: '',
    material_eta: '',
    material_status: 'pending',
    film_eta: '',
    film_status: 'pending',
    cutter_eta: '',
    cutter_status: 'pending',
  };
}

function ensureShape(r) {
  if (!r || typeof r !== 'object') return null;
  const pipeline = { ...defaultPipeline(), ...(r.pipeline || {}) };
  for (const cfg of PIPELINE) {
    const s = pipeline[cfg.key] || {};
    const defaults = defaultStageBlock(cfg);
    const existingCL = Array.isArray(s.checklist) ? s.checklist : [];
    // Index-based merge — see RFQTracker.jsx ensureShape for full
    // rationale. Earlier `find-by-text` clobbered user text edits AND
    // backported the missing required-flag preservation per PR #16.
    const merged = defaults.checklist.map((d, i) => {
      const found = existingCL[i];
      if (found && typeof found === 'object') {
        return {
          text: typeof found.text === 'string' && found.text ? found.text : d.text,
          required: typeof found.required === 'boolean' ? found.required : d.required,
          checked: !!found.checked,
        };
      }
      if (typeof found === 'string') return { text: d.text, required: d.required, checked: false };
      return d;
    });
    // Preserve ad-hoc items beyond defaults length. Items inside
    // [0..defaults.length-1] are produced above; pushing them here
    // would duplicate.
    for (let i = defaults.checklist.length; i < existingCL.length; i++) {
      const e = existingCL[i];
      if (!e || typeof e !== 'object') continue;
      merged.push({
        text: typeof e.text === 'string' ? e.text : '',
        checked: !!e.checked,
        required: !!e.required,
      });
    }
    pipeline[cfg.key] = { ...defaults, ...s, checklist: merged };
  }
  return {
    ...r,
    pipeline,
    specs: { ...defaultSpecs(), ...(r.specs || {}) },
    pipeline_stage: r.pipeline_stage || deriveCurrentStage(pipeline, r.result),
    linked_quotes: Array.isArray(r.linked_quotes) ? r.linked_quotes : [],
    ok_count: Number(r.ok_count) || 0,
    ng_count: Number(r.ng_count) || 0,
    reason_code: r.reason_code || '',
    linked_rfq: r.linked_rfq || '',
    linked_production_order: r.linked_production_order || '',
  };
}

function deriveCurrentStage(pipeline, result) {
  if (result === 'OK' || result === 'NG') {
    // NG stays at 'customer' until operator decides; OK auto-promotes to spec.
    if (result === 'OK') {
      // Land on whichever stage hasn't signed yet from spec end.
      if (pipeline.spec?.status !== 'done') return 'spec';
      return 'spec';
    }
    return 'customer';
  }
  for (const cfg of PIPELINE) {
    const s = pipeline[cfg.key];
    if (!s) continue;
    if (s.status === 'blocked') return cfg.key;
    if (s.status !== 'done') return cfg.key;
  }
  return 'spec';
}

function daysBetween(a, b) {
  if (!a) return null;
  const d1 = new Date(a);
  const d2 = b ? new Date(b) : new Date();
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

function fmtInt(n) {
  return (Number(n) || 0).toLocaleString();
}

function stageAdvanceBlocker(row, stageKey) {
  const cfg = PIPELINE.find((p) => p.key === stageKey);
  if (!cfg) return 'Unknown stage';
  for (const fieldPath of cfg.required_fields) {
    const val = fieldPath.split('.').reduce((o, k) => (o ? o[k] : undefined), row);
    if (val === undefined || val === null || val === '' || val === 0) {
      return `Required: ${fieldPath}`;
    }
  }
  const stage = row.pipeline[stageKey];
  const unchecked = (stage.checklist || []).filter((it) => it.required && !it.checked);
  if (unchecked.length) return `${unchecked.length} required task(s) unticked`;
  return null;
}

// Saved-view key (distinct from RFQ variants).
const VARIANT_KEY = 'ops-sample-variants-v1';
function loadVariants() {
  try {
    return JSON.parse(localStorage.getItem(VARIANT_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveVariants(list) {
  try {
    localStorage.setItem(VARIANT_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

// ── component ───────────────────────────────────────────────────

export default function SampleTracking() {
  const [filter, setFilter] = useState({
    text: '',
    result: 'all',
    cs: 'all',
    npi: 'all',
    stage: 'all',
    myInbox: false,
  });
  const [view, setView] = useState('kanban');
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [variants, setVariants] = useState(() => loadVariants());
  const [legendOpen, setLegendOpen] = useState(false);

  const { user } = useAuth();
  const myUsername = user?.username || '';
  useEscapeToClose(detailId != null ? () => setDetailId(null) : null);

  const {
    data: rawData,
    setData,
    loading,
    refresh,
  } = useAbortableFetch((signal) => sharedApi.getSampleTracking({ signal }), [], {
    onError: (err) => console.error('Failed to load sample tracking:', err),
  });
  // v1.3 P0 — auto-refresh every 60s khi tab visible
  useAutoRefresh(refresh, { intervalMs: 60000, pauseWhenHidden: true });
  // v1.3 Đợt 2 — instant refetch on SSE sample.updated push
  useEffect(() => {
    const unsub = subscribeDataEvents(['sample.updated'], () => {
      refresh();
    });
    return unsub;
  }, [refresh]);

  const data = useMemo(() => {
    const arr = Array.isArray(rawData) ? rawData : [];
    return arr.map(ensureShape).filter(Boolean);
  }, [rawData]);

  const csOpts = useMemo(() => [...new Set(data.map((r) => r.cs).filter(Boolean))].sort(), [data]);
  const npiOpts = useMemo(
    () => [...new Set(data.map((r) => r.npi_owner).filter(Boolean))].sort(),
    [data]
  );

  const filtered = useMemo(
    () =>
      data.filter((r) => {
        if (filter.myInbox && myUsername) {
          const activeOwner = r.pipeline?.[r.pipeline_stage]?.owner || '';
          if (
            ![activeOwner, r.cs, r.npi_owner].some(
              (v) => v && v.toLowerCase() === myUsername.toLowerCase()
            )
          )
            return false;
        }
        if (filter.result !== 'all' && r.result !== filter.result) return false;
        if (filter.cs !== 'all' && r.cs !== filter.cs) return false;
        if (filter.npi !== 'all' && r.npi_owner !== filter.npi) return false;
        if (filter.stage !== 'all' && r.pipeline_stage !== filter.stage) return false;
        if (filter.text) {
          const q = filter.text.toLowerCase();
          if (
            ![r.part_number, r.customer, r.cs, r.npi_owner, r.ifs_code, r.shop_order].some((f) =>
              (f || '').toLowerCase().includes(q)
            )
          )
            return false;
        }
        return true;
      }),
    [data, filter, myUsername]
  );

  const kpis = useMemo(() => {
    const total = data.length;
    const ok = data.filter((r) => r.result === 'OK').length;
    const ng = data.filter((r) => r.result === 'NG').length;
    const partial = data.filter((r) => r.result === 'PARTIAL').length;
    const pending = total - ok - ng - partial;
    const judged = ok + ng + partial;
    const okRate = judged ? Math.round((ok / judged) * 100) : 0;
    const finishedRate = total ? Math.round(((total - pending) / total) * 100) : 0;
    const specReleased = data.filter((r) => r.pipeline?.spec?.status === 'done').length;
    const today = new Date();
    const breach = data.filter((r) => {
      if (r.result === 'OK' || r.result === 'NG') return false;
      if (r.due_date) {
        const d = new Date(r.due_date);
        if (!isNaN(d) && d < today) return true;
      }
      return PIPELINE_KEYS.some((k) => r.pipeline?.[k]?.status === 'blocked');
    }).length;
    return { total, ok, ng, partial, pending, okRate, finishedRate, specReleased, breach };
  }, [data]);

  const stageCounts = useMemo(() => {
    const m = Object.fromEntries(PIPELINE.map((p) => [p.key, 0]));
    m.done = 0;
    for (const r of filtered) {
      if ((r.result === 'OK' || r.result === 'NG') && r.pipeline_stage === 'spec') m.done++;
      else m[r.pipeline_stage] = (m[r.pipeline_stage] || 0) + 1;
    }
    return m;
  }, [filtered]);

  const detailRow = useMemo(
    () => (detailId != null ? data.find((r) => r.id === detailId) || null : null),
    [detailId, data]
  );

  const appendAudit = useCallback((id, entry) => {
    sharedApi
      .appendSampleAudit(id, entry)
      .catch((err) => console.warn('Audit append failed:', err?.message || err));
  }, []);

  const saveData = useCallback(
    async (newData, auditBatch) => {
      setSaving(true);
      try {
        await costApi.saveAll({ sampleTracker: newData });
        setData(newData);
        if (auditBatch?.length) for (const { id, entry } of auditBatch) appendAudit(id, entry);
      } catch (err) {
        console.error('Save failed:', err);
        showToast('Save failed: ' + (err.message || 'Unknown error'), 'err');
      } finally {
        setSaving(false);
      }
    },
    [setData, appendAudit]
  );

  const diffForAudit = useCallback((id, oldRow, newRow) => {
    const out = [];
    const tracked = [
      'cs',
      'npi_owner',
      'customer',
      'ifs_code',
      'part_number',
      'version',
      'std_lot',
      'shop_order',
      'qty',
      'submit_date',
      'due_date',
      'result',
      'reason_code',
      'ok_count',
      'ng_count',
      'remarks',
      'linked_rfq',
      'linked_production_order',
    ];
    for (const k of tracked) {
      if (String(oldRow?.[k] ?? '') !== String(newRow?.[k] ?? '')) {
        out.push({
          id,
          entry: { kind: 'field_change', field: k, from: oldRow?.[k] ?? '', to: newRow?.[k] ?? '' },
        });
      }
    }
    for (const k of Object.keys(defaultSpecs())) {
      const a = oldRow?.specs?.[k],
        b = newRow?.specs?.[k];
      if (String(a ?? '') !== String(b ?? '')) {
        out.push({
          id,
          entry: { kind: 'field_change', field: 'specs.' + k, from: a ?? '', to: b ?? '' },
        });
      }
    }
    return out;
  }, []);

  const upsertRow = useCallback(
    (row, extra = []) => {
      const next = ensureShape(row);
      next.pipeline_stage = deriveCurrentStage(next.pipeline, next.result);
      const prev = data.find((r) => r.id === next.id);
      const batch = [...diffForAudit(next.id, prev, next), ...extra];
      const exists = data.findIndex((r) => r.id === next.id);
      const newData = exists >= 0 ? data.map((r, i) => (i === exists ? next : r)) : [...data, next];
      return saveData(newData, batch);
    },
    [data, saveData, diffForAudit]
  );

  const handleAdd = useCallback(() => {
    const maxId = data.reduce((m, r) => Math.max(m, r.id || 0), 0);
    const now = new Date().toISOString();
    const fresh = ensureShape({
      id: maxId + 1,
      cs: myUsername,
      npi_owner: '',
      customer: '',
      ifs_code: '',
      part_number: '',
      version: '',
      std_lot: '',
      shop_order: '',
      qty: 0,
      submit_date: now.slice(0, 10),
      due_date: '',
      result: 'PENDING',
      reason_code: '',
      ok_count: 0,
      ng_count: 0,
      remarks: '',
      linked_rfq: '',
      linked_production_order: '',
      created_at: now,
    });
    fresh.pipeline.request.status = 'active';
    fresh.pipeline.request.start = now.slice(0, 10);
    fresh.pipeline.request.owner = myUsername;
    fresh.pipeline_stage = 'request';
    const newData = [...data, fresh];
    saveData(newData, [
      { id: fresh.id, entry: { kind: 'created', meta: { cs: myUsername } } },
    ]).then(() => setDetailId(fresh.id));
  }, [data, saveData, myUsername]);

  const handleDelete = useCallback(
    (id) => {
      if (!confirm('Delete this sample record?')) return;
      saveData(
        data.filter((r) => r.id !== id),
        [{ id, entry: { kind: 'deleted' } }]
      );
      if (detailId === id) setDetailId(null);
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    },
    [data, saveData, detailId]
  );

  const moveStage = useCallback(
    (id, direction) => {
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const idx = PIPELINE_KEYS.indexOf(r.pipeline_stage);
      if (idx < 0) return;
      const nextIdx =
        direction === 'next' ? Math.min(idx + 1, PIPELINE_KEYS.length - 1) : Math.max(idx - 1, 0);
      if (nextIdx === idx) return;
      const now = new Date().toISOString().slice(0, 10);
      const pipeline = { ...r.pipeline };
      const curKey = PIPELINE_KEYS[idx];
      const nxtKey = PIPELINE_KEYS[nextIdx];
      if (direction === 'next') {
        const blocker = stageAdvanceBlocker(r, curKey);
        if (blocker) {
          showToast('Cannot advance: ' + blocker, 'err');
          return;
        }
        pipeline[curKey] = {
          ...pipeline[curKey],
          status: 'done',
          done: pipeline[curKey].done || now,
          signed_by: myUsername || '-',
          signed_at: new Date().toISOString(),
        };
        pipeline[nxtKey] = {
          ...pipeline[nxtKey],
          status: 'active',
          start: pipeline[nxtKey].start || now,
        };
      } else {
        pipeline[curKey] = { ...pipeline[curKey], status: 'pending' };
        pipeline[nxtKey] = { ...pipeline[nxtKey], status: 'active' };
      }
      upsertRow({ ...r, pipeline, pipeline_stage: nxtKey }, [
        {
          id,
          entry: {
            kind: direction === 'next' ? 'stage_advanced' : 'stage_reverted',
            from: curKey,
            to: nxtKey,
          },
        },
      ]);
    },
    [data, upsertRow, myUsername]
  );

  const reopenStage = useCallback(
    (id, stageKey) => {
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      if (!stage || stage.status !== 'done') return;
      if (
        !confirm(
          `Reopen the "${stageKey}" stage? This clears the signature and logs a reopen event.`
        )
      )
        return;
      const pipeline = {
        ...r.pipeline,
        [stageKey]: { ...stage, status: 'active', signed_by: '', signed_at: '', done: '' },
      };
      upsertRow({ ...r, pipeline, pipeline_stage: stageKey }, [
        {
          id,
          entry: {
            kind: 'stage_reopened',
            field: stageKey,
            from: stage.signed_by || '?',
            to: myUsername,
          },
        },
      ]);
    },
    [data, upsertRow, myUsername]
  );

  const updateStageField = useCallback(
    (id, stageKey, field, value) => {
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      if (stage.status === 'done' && field === 'status' && value !== 'done') {
        showToast('Reopen the stage before changing its status', 'err');
        return;
      }
      const pipeline = { ...r.pipeline, [stageKey]: { ...stage, [field]: value } };
      upsertRow({ ...r, pipeline });
    },
    [data, upsertRow]
  );

  const updateChecklistItem = useCallback(
    (id, stageKey, idx, patch) => {
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      if (stage.status === 'done' && patch.checked !== undefined) {
        showToast('Reopen the stage before editing its checklist', 'err');
        return;
      }
      const checklist = stage.checklist.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      const pipeline = { ...r.pipeline, [stageKey]: { ...stage, checklist } };
      upsertRow(
        { ...r, pipeline },
        patch.checked !== undefined
          ? [
              {
                id,
                entry: {
                  kind: patch.checked ? 'checklist_checked' : 'checklist_unchecked',
                  field: stageKey,
                  to: stage.checklist[idx]?.text || '',
                },
              },
            ]
          : []
      );
    },
    [data, upsertRow]
  );

  const addChecklistItem = useCallback(
    (id, stageKey, text) => {
      if (!text?.trim()) return;
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      const checklist = [
        ...stage.checklist,
        { text: text.trim(), checked: false, required: false },
      ];
      upsertRow({ ...r, pipeline: { ...r.pipeline, [stageKey]: { ...stage, checklist } } });
    },
    [data, upsertRow]
  );

  const removeChecklistItem = useCallback(
    (id, stageKey, idx) => {
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      const checklist = stage.checklist.filter((_, i) => i !== idx);
      upsertRow({ ...r, pipeline: { ...r.pipeline, [stageKey]: { ...stage, checklist } } });
    },
    [data, upsertRow]
  );

  // Bulk ops
  const toggleSelect = useCallback((id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const bulkResult = useCallback(
    (result) => {
      if (!selected.size) return;
      if (!confirm(`Mark ${selected.size} sample(s) as ${result}?`)) return;
      const ids = [...selected];
      const newData = data.map((r) => (ids.includes(r.id) ? ensureShape({ ...r, result }) : r));
      saveData(
        newData,
        ids.map((id) => ({ id, entry: { kind: 'bulk_result_set', to: result } }))
      );
      setSelected(new Set());
    },
    [selected, data, saveData]
  );

  const bulkDelete = useCallback(() => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} sample(s)? This cannot be undone.`)) return;
    const ids = new Set(selected);
    saveData(
      data.filter((r) => !ids.has(r.id)),
      [...ids].map((id) => ({ id, entry: { kind: 'deleted' } }))
    );
    setSelected(new Set());
  }, [selected, data, saveData]);

  // Variants
  const saveCurrentVariant = useCallback(() => {
    const name = prompt('Save this filter as:');
    if (!name) return;
    const next = [...variants.filter((v) => v.name !== name), { name, filter }];
    setVariants(next);
    saveVariants(next);
    showToast(`Saved "${name}"`);
  }, [filter, variants]);
  const applyVariant = useCallback(
    (name) => {
      const v = variants.find((x) => x.name === name);
      if (v) setFilter(v.filter);
    },
    [variants]
  );
  const deleteVariant = useCallback(
    (name) => {
      const next = variants.filter((v) => v.name !== name);
      setVariants(next);
      saveVariants(next);
    },
    [variants]
  );

  // Initial-load only — see RFQTracker.jsx for the full rationale.
  // Showing the skeleton on every refresh tick unmounts the open
  // DetailDrawer and destroys its snapshot, re-creating the
  // "flashes and reverts at 60s" bug.
  if (loading && rawData == null)
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={10} cols={8} />
      </div>
    );

  return (
    <div className="sample-tracking rfq2">
      <KpiBar kpis={kpis} data={data} />

      {/* Per-NPI-Owner KPI strip (matches xlsx summary) */}
      <NpiBreakdown data={data} />

      <div className="rfq2-toolbar">
        <input
          type="search"
          className="rfq2-search"
          placeholder="Search part, customer, CS, IFS..."
          value={filter.text}
          onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
        />
        <button
          className={'rfq2-chip-btn' + (filter.myInbox ? ' active' : '')}
          onClick={() => setFilter((f) => ({ ...f, myInbox: !f.myInbox }))}
          disabled={!myUsername}
          title={myUsername ? `Show samples where ${myUsername} is active-stage owner` : 'Log in'}
        >
          📥 My Inbox
        </button>
        <select
          value={filter.stage}
          onChange={(e) => setFilter((f) => ({ ...f, stage: e.target.value }))}
          aria-label="Filter stage"
        >
          <option value="all">All Stages</option>
          {PIPELINE.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={filter.result}
          onChange={(e) => setFilter((f) => ({ ...f, result: e.target.value }))}
          aria-label="Filter result"
        >
          <option value="all">All Results</option>
          {RESULT_OPTS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={filter.cs}
          onChange={(e) => setFilter((f) => ({ ...f, cs: e.target.value }))}
          aria-label="Filter CS"
        >
          <option value="all">All CS</option>
          {csOpts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filter.npi}
          onChange={(e) => setFilter((f) => ({ ...f, npi: e.target.value }))}
          aria-label="Filter NPI"
        >
          <option value="all">All NPI</option>
          {npiOpts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <VariantMenu
          variants={variants}
          onApply={applyVariant}
          onSave={saveCurrentVariant}
          onDelete={deleteVariant}
        />

        <div className="rfq2-view-toggle" role="tablist" aria-label="View mode">
          <button
            role="tab"
            aria-selected={view === 'kanban'}
            className={view === 'kanban' ? 'active' : ''}
            onClick={() => setView('kanban')}
          >
            Kanban
          </button>
          <button
            role="tab"
            aria-selected={view === 'list'}
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>

        <button
          className="rfq2-chip-btn"
          onClick={() => setLegendOpen(true)}
          title="Field Legend / Chú giải trường"
        >
          📖 Legend
        </button>
        <button className="rfq2-btn rfq2-btn-primary" onClick={handleAdd} disabled={saving}>
          + New Sample
        </button>
      </div>

      {selected.size > 0 && (
        <div className="rfq2-bulk">
          <span>{selected.size} selected</span>
          <button onClick={() => bulkResult('OK')}>Mark OK</button>
          <button onClick={() => bulkResult('NG')}>Mark NG</button>
          <button onClick={() => bulkResult('PARTIAL')}>Mark PARTIAL</button>
          <button className="rfq2-btn-danger" onClick={bulkDelete}>
            Delete
          </button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {view === 'kanban' ? (
        <KanbanBoard
          data={filtered}
          stageCounts={stageCounts}
          onOpen={setDetailId}
          onMoveNext={(id) => moveStage(id, 'next')}
          onMoveBack={(id) => moveStage(id, 'back')}
        />
      ) : (
        <ListView
          data={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onOpen={setDetailId}
          onDelete={handleDelete}
        />
      )}

      {filtered.length === 0 && (
        <div style={{ padding: 0 }}>
          <EmptyState
            icon="☑"
            title="No sample records match the filters"
            hint="Clear the filters or add a new sample to get started."
          />
        </div>
      )}

      {detailRow && (
        <DetailDrawer
          key={detailRow.id}
          row={detailRow}
          saving={saving}
          myUsername={myUsername}
          onClose={() => setDetailId(null)}
          onChange={(patch) => upsertRow({ ...detailRow, ...patch })}
          onDelete={() => handleDelete(detailRow.id)}
          onMoveNext={() => moveStage(detailRow.id, 'next')}
          onMoveBack={() => moveStage(detailRow.id, 'back')}
          onReopen={(stageKey) => reopenStage(detailRow.id, stageKey)}
          onUpdateStage={(stageKey, field, value) =>
            updateStageField(detailRow.id, stageKey, field, value)
          }
          onToggleChecklist={(stageKey, idx, checked) =>
            updateChecklistItem(detailRow.id, stageKey, idx, { checked })
          }
          onEditChecklist={(stageKey, idx, text) =>
            updateChecklistItem(detailRow.id, stageKey, idx, { text })
          }
          onToggleRequired={(stageKey, idx, required) =>
            updateChecklistItem(detailRow.id, stageKey, idx, { required })
          }
          onAddChecklist={(stageKey, text) => addChecklistItem(detailRow.id, stageKey, text)}
          onRemoveChecklist={(stageKey, idx) => removeChecklistItem(detailRow.id, stageKey, idx)}
        />
      )}

      {legendOpen && <TrackerLegendModal kind="sample" onClose={() => setLegendOpen(false)} />}
    </div>
  );
}

// ── KPI bar + trend ─────────────────────────────────────────────

function Kpi({ label, value, sub, tone }) {
  const cls = 'rfq2-kpi' + (tone ? ' rfq2-kpi-' + tone : '');
  return (
    <div className={cls}>
      <span className="rfq2-kpi-val">{value}</span>
      <span className="rfq2-kpi-label">{label}</span>
      {sub && <span className="rfq2-kpi-sub">{sub}</span>}
    </div>
  );
}

function KpiBar({ kpis, data }) {
  const [trendOpen, setTrendOpen] = useState(false);
  return (
    <>
      <div className="rfq2-kpis" role="group" aria-label="Sample KPIs">
        <Kpi label="Total Samples" value={kpis.total} />
        <Kpi label="Pending" value={kpis.pending} tone="brand" />
        <Kpi label="SLA Breach" value={kpis.breach} tone="danger" />
        <Kpi
          label="OK Rate"
          value={kpis.okRate + '%'}
          tone="good"
          sub={`${kpis.ok} OK / ${kpis.ng} NG`}
        />
        <Kpi
          label="Finished"
          value={kpis.finishedRate + '%'}
          tone="info"
          sub={`${kpis.total - kpis.pending} / ${kpis.total}`}
        />
        <Kpi label="Spec Released" value={kpis.specReleased} tone="amber" />
        <button
          className="rfq2-trend-toggle"
          onClick={() => setTrendOpen((v) => !v)}
          aria-expanded={trendOpen}
        >
          {trendOpen ? '▲ Hide trend' : '▼ Show 6-mo trend'}
        </button>
      </div>
      {trendOpen && <TrendChart data={data} />}
    </>
  );
}

function TrendChart({ data }) {
  const buckets = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleString('en', { month: 'short' }),
        ok: 0,
        ng: 0,
        cycle_sum: 0,
        cycle_n: 0,
      });
    }
    for (const r of data) {
      const dateStr = r.pipeline?.spec?.done || r.submit_date;
      if (!dateStr) continue;
      const b = months.find((x) => x.key === dateStr.slice(0, 7));
      if (!b) continue;
      if (r.result === 'OK') b.ok++;
      if (r.result === 'NG') b.ng++;
      if (r.submit_date && r.pipeline?.spec?.done) {
        const d = daysBetween(r.submit_date, r.pipeline.spec.done);
        if (d != null && d >= 0) {
          b.cycle_sum += d;
          b.cycle_n++;
        }
      }
    }
    return months.map((b) => ({
      ...b,
      okRate: b.ok + b.ng ? Math.round((b.ok / (b.ok + b.ng)) * 100) : 0,
      cycle: b.cycle_n ? Math.round(b.cycle_sum / b.cycle_n) : 0,
    }));
  }, [data]);
  const maxCycle = Math.max(10, ...buckets.map((b) => b.cycle));
  const W = 560,
    H = 110,
    PAD = 24;
  const colW = (W - 2 * PAD) / buckets.length;

  return (
    <div className="rfq2-trend">
      <div className="rfq2-trend-head">
        OK Rate % (green) and Avg Cycle Days (amber) — last 6 months
      </div>
      <svg width={W} height={H} role="img" aria-label="6-month trend">
        {buckets.map((b, i) => {
          const x = PAD + colW * i + 4;
          const barW = colW / 2 - 4;
          const okH = (H - 2 * PAD) * (b.okRate / 100);
          const cyH = (H - 2 * PAD) * (b.cycle / maxCycle);
          return (
            <g key={b.key}>
              <rect x={x} y={H - PAD - okH} width={barW} height={okH} fill="#22c55e" />
              <rect x={x + barW + 2} y={H - PAD - cyH} width={barW} height={cyH} fill="#d97706" />
              <text x={x + barW} y={H - PAD + 12} textAnchor="middle" fontSize="10" fill="#475569">
                {b.label}
              </text>
              <text
                x={x + barW / 2}
                y={H - PAD - okH - 2}
                textAnchor="middle"
                fontSize="9"
                fill="#15803d"
              >
                {b.okRate}%
              </text>
              <text
                x={x + barW + 2 + barW / 2}
                y={H - PAD - cyH - 2}
                textAnchor="middle"
                fontSize="9"
                fill="#d97706"
              >
                {b.cycle}d
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Per-NPI-Owner mini KPI strip, mirroring the xlsx summary.
function NpiBreakdown({ data }) {
  const rows = useMemo(() => {
    const byOwner = new Map();
    for (const r of data) {
      const o = r.npi_owner || '(unassigned)';
      if (!byOwner.has(o))
        byOwner.set(o, { owner: o, parts: 0, finished: 0, ok: 0, ng: 0, spec: 0 });
      const b = byOwner.get(o);
      b.parts++;
      if (r.result !== 'PENDING') b.finished++;
      if (r.result === 'OK') b.ok++;
      if (r.result === 'NG') b.ng++;
      if (r.pipeline?.spec?.status === 'done') b.spec++;
    }
    return [...byOwner.values()].sort((a, b) => b.parts - a.parts).slice(0, 5);
  }, [data]);
  if (!rows.length) return null;
  return (
    <div className="st2-npi-strip">
      <div className="st2-npi-head">NPI OWNER SUMMARY</div>
      <table>
        <thead>
          <tr>
            <th>Owner</th>
            <th>Parts</th>
            <th>Finished</th>
            <th>OK</th>
            <th>NG</th>
            <th>OK Rate</th>
            <th>Spec Released</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const judged = r.ok + r.ng;
            const okR = judged ? Math.round((r.ok / judged) * 100) : 0;
            return (
              <tr key={r.owner}>
                <td>{r.owner}</td>
                <td className="rfq2-num">{r.parts}</td>
                <td className="rfq2-num">{r.finished}</td>
                <td className="rfq2-num" style={{ color: '#22c55e' }}>
                  {r.ok}
                </td>
                <td className="rfq2-num" style={{ color: '#ef4444' }}>
                  {r.ng}
                </td>
                <td className="rfq2-num">{okR}%</td>
                <td className="rfq2-num">{r.spec}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Variant menu ────────────────────────────────────────────────

function VariantMenu({ variants, onApply, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return (
    <div className="rfq2-variant" ref={ref}>
      <button className="rfq2-chip-btn" onClick={() => setOpen((v) => !v)} aria-haspopup>
        ⭐ Views ({variants.length})
      </button>
      {open && (
        <div className="rfq2-variant-menu">
          <button
            onClick={() => {
              onSave();
              setOpen(false);
            }}
          >
            + Save current
          </button>
          {variants.length > 0 && <div className="rfq2-variant-sep" />}
          {variants.map((v) => (
            <div key={v.name} className="rfq2-variant-item">
              <button
                onClick={() => {
                  onApply(v.name);
                  setOpen(false);
                }}
              >
                {v.name}
              </button>
              <button
                className="rfq2-variant-del"
                onClick={() => onDelete(v.name)}
                aria-label="Delete"
              >
                ×
              </button>
            </div>
          ))}
          {variants.length === 0 && <div className="rfq2-variant-empty">No saved views</div>}
        </div>
      )}
    </div>
  );
}

// ── Kanban ──────────────────────────────────────────────────────

function KanbanBoard({ data, stageCounts, onOpen, onMoveNext, onMoveBack }) {
  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(PIPELINE.map((p) => [p.key, []]));
    buckets.done = [];
    for (const r of data) {
      if ((r.result === 'OK' || r.result === 'NG') && r.pipeline_stage === 'spec')
        buckets.done.push(r);
      else (buckets[r.pipeline_stage] || (buckets[r.pipeline_stage] = [])).push(r);
    }
    return buckets;
  }, [data]);

  return (
    <div className="rfq2-board st2-board">
      {PIPELINE.map((cfg, i) => (
        <div className="rfq2-col" key={cfg.key}>
          <div className="rfq2-col-head" style={{ background: cfg.bg, color: cfg.color }}>
            <span className="rfq2-col-num">{i + 1}</span>
            <span className="rfq2-col-label">{cfg.label}</span>
            <span className="rfq2-col-count">{stageCounts[cfg.key] || 0}</span>
          </div>
          <div className="rfq2-col-body">
            {(grouped[cfg.key] || []).map((r) => (
              <KanbanCard
                key={r.id}
                row={r}
                stageCfg={cfg}
                onOpen={() => onOpen(r.id)}
                onMoveNext={i < PIPELINE.length - 1 ? () => onMoveNext(r.id) : null}
                onMoveBack={i > 0 ? () => onMoveBack(r.id) : null}
              />
            ))}
            {(grouped[cfg.key] || []).length === 0 && (
              <div className="rfq2-col-empty">No items</div>
            )}
          </div>
        </div>
      ))}
      <div className="rfq2-col rfq2-col-done">
        <div className="rfq2-col-head" style={{ background: '#f3f4f6', color: '#374151' }}>
          <span className="rfq2-col-num">✓</span>
          <span className="rfq2-col-label">Done</span>
          <span className="rfq2-col-count">{stageCounts.done || 0}</span>
        </div>
        <div className="rfq2-col-body">
          {(grouped.done || []).map((r) => (
            <KanbanCard
              key={r.id}
              row={r}
              stageCfg={PIPELINE[PIPELINE.length - 1]}
              done
              onOpen={() => onOpen(r.id)}
            />
          ))}
          {(grouped.done || []).length === 0 && <div className="rfq2-col-empty">No items</div>}
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ row, stageCfg, onOpen, onMoveNext, onMoveBack, done }) {
  const stage = row.pipeline?.[row.pipeline_stage] || {};
  const daysInStage = daysBetween(stage.start);
  const daysToDue = daysBetween(new Date().toISOString().slice(0, 10), row.due_date);
  const breached = daysToDue != null && daysToDue < 0 && !done;
  const checklistDone = (stage.checklist || []).filter((i) => i.checked).length;
  const checklistTotal = (stage.checklist || []).length;
  const pct = checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const blocker = !done ? stageAdvanceBlocker(row, row.pipeline_stage) : null;

  return (
    <div
      className={
        'rfq2-card' + (breached ? ' rfq2-card-breach' : '') + (done ? ' rfq2-card-done' : '')
      }
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      style={{ borderLeftColor: stageCfg.color }}
    >
      <div className="rfq2-card-head">
        <span className="rfq2-card-no">
          {row.part_number || row.ifs_code || 'S' + String(row.id).padStart(5, '0')}
        </span>
        {row.result && row.result !== 'PENDING' && (
          <span
            className="rfq2-chip"
            style={{
              background: RESULT_COLORS[row.result] + '20',
              color: RESULT_COLORS[row.result],
            }}
          >
            {row.result}
          </span>
        )}
      </div>
      <div className="rfq2-card-customer">{row.customer || '—'}</div>
      <div className="rfq2-card-product">
        {row.specs?.sample_type || ''}{' '}
        {row.specs?.product_type ? '· ' + row.specs.product_type : ''}
      </div>
      <div className="rfq2-card-meta">
        <span>Qty {fmtInt(row.qty)}</span>
        {row.npi_owner && <span className="rfq2-card-owner">{row.npi_owner}</span>}
      </div>
      {!done && (
        <>
          <div className="rfq2-card-bar">
            <div
              className="rfq2-card-bar-fill"
              style={{ width: pct + '%', background: stageCfg.color }}
            />
          </div>
          <div className="rfq2-card-foot">
            <span>
              {checklistDone}/{checklistTotal} tasks
            </span>
            {daysInStage != null && (
              <span className={daysInStage > stageCfg.sla_days ? 'rfq2-card-sla-bad' : ''}>
                {daysInStage}d in stage
              </span>
            )}
            {breached && <span className="rfq2-card-breach-tag">Past due</span>}
          </div>
          {(onMoveBack || onMoveNext) && (
            <div className="rfq2-card-nav" onClick={(e) => e.stopPropagation()}>
              {onMoveBack && (
                <button onClick={onMoveBack} title="Move back">
                  &larr;
                </button>
              )}
              {onMoveNext && (
                <button
                  onClick={onMoveNext}
                  disabled={!!blocker}
                  title={blocker || 'Advance stage'}
                >
                  Next →
                </button>
              )}
            </div>
          )}
        </>
      )}
      {done && (
        <div className="rfq2-card-foot">
          {row.reason_code && (
            <span className="rfq2-chip" style={{ background: '#f3f4f6', color: '#374151' }}>
              {row.reason_code}
            </span>
          )}
          {row.ok_count + row.ng_count > 0 && (
            <span>
              {row.ok_count} OK / {row.ng_count} NG
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────

function ListView({ data, selected, onToggleSelect, onOpen, onDelete }) {
  return (
    <div className="rfq2-list-wrap">
      <table className="rfq2-list">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th>Part No.</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Qty</th>
            <th>CS / NPI</th>
            <th>Stage</th>
            <th>Submit</th>
            <th>Due</th>
            <th>Result</th>
            <th>Reason</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const cfg = PIPELINE.find((p) => p.key === r.pipeline_stage) || PIPELINE[0];
            const stage = r.pipeline[r.pipeline_stage];
            const daysToDue = daysBetween(new Date().toISOString().slice(0, 10), r.due_date);
            return (
              <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => onToggleSelect(r.id)}
                    aria-label={`Select ${r.part_number}`}
                  />
                </td>
                <td className="rfq2-mono">{r.part_number || r.ifs_code}</td>
                <td>{r.customer}</td>
                <td className="rfq2-truncate">
                  {r.specs?.sample_type || ''}{' '}
                  {r.specs?.product_type ? '/ ' + r.specs.product_type : ''}
                </td>
                <td className="rfq2-num">{fmtInt(r.qty)}</td>
                <td>
                  {r.cs}
                  {r.npi_owner ? ' / ' + r.npi_owner : ''}
                </td>
                <td>
                  <span
                    className="rfq2-stage-pill"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.short} · {STATUS_LABEL[stage.status] || ''}
                  </span>
                </td>
                <td>{r.submit_date}</td>
                <td className={daysToDue != null && daysToDue < 0 ? 'rfq2-bad' : ''}>
                  {r.due_date || '—'}
                </td>
                <td>
                  <span
                    className="rfq2-chip"
                    style={{
                      color: RESULT_COLORS[r.result],
                      background: (RESULT_COLORS[r.result] || '#888') + '18',
                    }}
                  >
                    {r.result}
                  </span>
                </td>
                <td>{r.reason_code || ''}</td>
                <td onClick={(e) => e.stopPropagation()} className="rfq2-list-actions">
                  <button onClick={() => onDelete(r.id)} title="Delete">
                    &times;
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Detail drawer ───────────────────────────────────────────────

function DetailDrawer({
  row,
  saving,
  myUsername,
  onClose,
  onChange,
  onDelete,
  onMoveNext,
  onMoveBack,
  onReopen,
  onUpdateStage,
  onToggleChecklist,
  onEditChecklist,
  onToggleRequired,
  onAddChecklist,
  onRemoveChecklist,
}) {
  const [tab, setTab] = useState('detail');
  // Snapshot pattern (same as RFQTracker.DetailDrawer — see that file
  // for the full rationale). Insulates the pipeline section from the
  // 60s auto-refresh + SSE sample.updated push so the drawer doesn't
  // flash / revert mid-edit. Auto-refresh continues updating the
  // parent's `data` state (kanban list re-renders normally); only the
  // open drawer reads from `snapshot`.
  const [override, setOverride] = useState(null);
  const [snapshot, setSnapshot] = useState(() => structuredClone(row));
  const pendingResyncRef = useRef(false);
  useEffect(() => {
    if (pendingResyncRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshot(structuredClone(row));
      pendingResyncRef.current = false;
    }
  }, [row]);
  const openStage = override ?? snapshot.pipeline_stage ?? 'request';
  const setOpenStage = (k) => setOverride(k === (snapshot.pipeline_stage ?? 'request') ? null : k);

  const [draft, setDraft] = useState(() => pickEditable(row));
  function commit(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  function flush() {
    const patch = {};
    for (const k of Object.keys(draft)) {
      if (k === 'specs') patch.specs = { ...row.specs, ...draft.specs };
      else if (String(row[k] ?? '') !== String(draft[k] ?? '')) patch[k] = draft[k];
    }
    if (Object.keys(patch).length) onChange(patch);
  }

  // Wrapped pipeline edit handlers — see RFQTracker.DetailDrawer for
  // pattern documentation.
  const handleUpdateStage = (stageKey, field, value) => {
    setSnapshot((prev) => {
      const next = structuredClone(prev);
      next.pipeline[stageKey] = { ...next.pipeline[stageKey], [field]: value };
      return next;
    });
    onUpdateStage(stageKey, field, value);
  };
  const handleToggleCheck = (stageKey, idx, checked) => {
    setSnapshot((prev) => {
      const next = structuredClone(prev);
      const cl = next.pipeline[stageKey].checklist;
      if (cl[idx]) cl[idx].checked = checked;
      return next;
    });
    onToggleChecklist(stageKey, idx, checked);
  };
  const handleEditCheck = (stageKey, idx, text) => {
    setSnapshot((prev) => {
      const next = structuredClone(prev);
      const cl = next.pipeline[stageKey].checklist;
      if (cl[idx]) cl[idx].text = text;
      return next;
    });
    onEditChecklist(stageKey, idx, text);
  };
  const handleToggleRequired = (stageKey, idx, required) => {
    setSnapshot((prev) => {
      const next = structuredClone(prev);
      const cl = next.pipeline[stageKey].checklist;
      if (cl[idx]) cl[idx].required = required;
      return next;
    });
    onToggleRequired(stageKey, idx, required);
  };
  const handleAddCheck = (stageKey, text) => {
    setSnapshot((prev) => {
      const next = structuredClone(prev);
      next.pipeline[stageKey].checklist.push({
        text,
        checked: false,
        required: false,
      });
      return next;
    });
    onAddChecklist(stageKey, text);
  };
  const handleRemoveCheck = (stageKey, idx) => {
    setSnapshot((prev) => {
      const next = structuredClone(prev);
      next.pipeline[stageKey].checklist.splice(idx, 1);
      return next;
    });
    onRemoveChecklist(stageKey, idx);
  };
  const handleMoveNext = () => {
    pendingResyncRef.current = true;
    onMoveNext();
  };
  const handleMoveBack = () => {
    pendingResyncRef.current = true;
    onMoveBack();
  };
  const handleReopen = (stageKey) => {
    pendingResyncRef.current = true;
    onReopen(stageKey);
  };

  return (
    <>
      <div className="rfq2-drawer-scrim" onClick={onClose} />
      <aside
        className="rfq2-drawer"
        data-ops-draggable-card
        role="dialog"
        aria-label="Sample detail"
        onBlur={flush}
      >
        <header className="rfq2-drawer-head" data-ops-drag-handle>
          <div>
            <div className="rfq2-drawer-title">
              {row.part_number || row.ifs_code || 'S' + String(row.id).padStart(5, '0')}
            </div>
            <div className="rfq2-drawer-sub">
              {row.customer || ''} {row.specs?.sample_type ? '· ' + row.specs.sample_type : ''}
            </div>
          </div>
          <button className="rfq2-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <nav className="rfq2-drawer-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'detail'}
            className={tab === 'detail' ? 'active' : ''}
            onClick={() => setTab('detail')}
          >
            Detail
          </button>
          <button
            role="tab"
            aria-selected={tab === 'history'}
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
          >
            History
          </button>
          <button
            role="tab"
            aria-selected={tab === 'attachments'}
            className={tab === 'attachments' ? 'active' : ''}
            onClick={() => setTab('attachments')}
          >
            Attachments
          </button>
        </nav>

        {tab === 'detail' && (
          <div className="rfq2-drawer-scroll">
            <section className="rfq2-drawer-section">
              <h4>Identity</h4>
              <div className="rfq2-grid-2">
                <Field
                  label="Customer"
                  value={draft.customer}
                  onChange={(v) => commit('customer', v)}
                  onBlur={flush}
                />
                <Field
                  label="CS (Sales)"
                  value={draft.cs}
                  onChange={(v) => commit('cs', v)}
                  onBlur={flush}
                />
                <Field
                  label="NPI Owner"
                  value={draft.npi_owner}
                  onChange={(v) => commit('npi_owner', v)}
                  onBlur={flush}
                />
                <Field
                  label="IFS Code"
                  value={draft.ifs_code}
                  onChange={(v) => commit('ifs_code', v)}
                  onBlur={flush}
                />
                <Field
                  label="Part Number"
                  value={draft.part_number}
                  onChange={(v) => commit('part_number', v)}
                  onBlur={flush}
                />
                <Field
                  label="Version"
                  value={draft.version}
                  onChange={(v) => commit('version', v)}
                  onBlur={flush}
                />
                <Field
                  label="Std Lot Size"
                  value={draft.std_lot}
                  onChange={(v) => commit('std_lot', v)}
                  onBlur={flush}
                />
                <Field
                  label="Shop Order"
                  value={draft.shop_order}
                  onChange={(v) => commit('shop_order', v)}
                  onBlur={flush}
                />
                <Field
                  label="Qty"
                  type="number"
                  value={draft.qty}
                  onChange={(v) => commit('qty', v)}
                  onBlur={flush}
                />
                <Field
                  label="Submit Date"
                  type="date"
                  value={draft.submit_date}
                  onChange={(v) => commit('submit_date', v)}
                  onBlur={flush}
                />
                <Field
                  label="Due Date"
                  type="date"
                  value={draft.due_date}
                  onChange={(v) => commit('due_date', v)}
                  onBlur={flush}
                />
                <label className="rfq2-field">
                  <span>Result</span>
                  <select
                    value={draft.result || 'PENDING'}
                    onChange={(e) => {
                      commit('result', e.target.value);
                      setTimeout(flush, 0);
                    }}
                  >
                    {RESULT_OPTS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {(draft.result === 'OK' || draft.result === 'NG' || draft.result === 'PARTIAL') && (
                <div className="rfq2-grid-2" style={{ marginTop: 10 }}>
                  <Field
                    label="OK count"
                    type="number"
                    value={draft.ok_count}
                    onChange={(v) => commit('ok_count', v)}
                    onBlur={flush}
                  />
                  <Field
                    label="NG count"
                    type="number"
                    value={draft.ng_count}
                    onChange={(v) => commit('ng_count', v)}
                    onBlur={flush}
                  />
                </div>
              )}
              {(draft.result === 'NG' || draft.result === 'PARTIAL') && (
                <label className="rfq2-field rfq2-field-wide">
                  <span>NG Reason Code</span>
                  <select
                    value={draft.reason_code || ''}
                    onChange={(e) => {
                      commit('reason_code', e.target.value);
                      setTimeout(flush, 0);
                    }}
                  >
                    <option value="">(select)</option>
                    {REASON_CODES.ng.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="rfq2-grid-2" style={{ marginTop: 10 }}>
                <Field
                  label="Linked RFQ No."
                  value={draft.linked_rfq}
                  onChange={(v) => commit('linked_rfq', v)}
                  onBlur={flush}
                />
                <Field
                  label="Linked Production Order"
                  value={draft.linked_production_order}
                  onChange={(v) => commit('linked_production_order', v)}
                  onBlur={flush}
                />
              </div>
              <label className="rfq2-field rfq2-field-wide">
                <span>Remarks</span>
                <textarea
                  rows={2}
                  value={draft.remarks || ''}
                  onChange={(e) => commit('remarks', e.target.value)}
                  onBlur={flush}
                />
              </label>
            </section>

            <section className="rfq2-drawer-section">
              <h4>Specs</h4>
              <div className="rfq2-grid-2">
                <label className="rfq2-field">
                  <span>Sample Type</span>
                  <select
                    value={draft.specs?.sample_type || ''}
                    onChange={(e) => {
                      commit('specs', { ...draft.specs, sample_type: e.target.value });
                      setTimeout(flush, 0);
                    }}
                  >
                    {SAMPLE_TYPES.map((p) => (
                      <option key={p} value={p}>
                        {p || '(none)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rfq2-field">
                  <span>Product Type</span>
                  <select
                    value={draft.specs?.product_type || ''}
                    onChange={(e) => {
                      commit('specs', { ...draft.specs, product_type: e.target.value });
                      setTimeout(flush, 0);
                    }}
                  >
                    {PRODUCT_TYPES.map((p) => (
                      <option key={p} value={p}>
                        {p || '(none)'}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Width (mm)"
                  type="number"
                  value={draft.specs?.width_mm}
                  onChange={(v) => commit('specs', { ...draft.specs, width_mm: v })}
                  onBlur={flush}
                />
                <Field
                  label="Height (mm)"
                  type="number"
                  value={draft.specs?.height_mm}
                  onChange={(v) => commit('specs', { ...draft.specs, height_mm: v })}
                  onBlur={flush}
                />
                <Field
                  label="Material Spec"
                  value={draft.specs?.material_spec}
                  onChange={(v) => commit('specs', { ...draft.specs, material_spec: v })}
                  onBlur={flush}
                />
                <Field
                  label="Substrate"
                  value={draft.specs?.substrate}
                  onChange={(v) => commit('specs', { ...draft.specs, substrate: v })}
                  onBlur={flush}
                />
                <Field
                  label="Ink Spec"
                  value={draft.specs?.ink_spec}
                  onChange={(v) => commit('specs', { ...draft.specs, ink_spec: v })}
                  onBlur={flush}
                />
                <Field
                  label="Film / Plate"
                  value={draft.specs?.film_plate}
                  onChange={(v) => commit('specs', { ...draft.specs, film_plate: v })}
                  onBlur={flush}
                />
                <Field
                  label="Cutter"
                  value={draft.specs?.cutter_name}
                  onChange={(v) => commit('specs', { ...draft.specs, cutter_name: v })}
                  onBlur={flush}
                />
              </div>
            </section>

            <DocumentFlowStrip row={row} />

            <section className="rfq2-drawer-section">
              <div className="rfq2-drawer-sec-head">
                <h4>Pipeline</h4>
                <div className="rfq2-move">
                  <button
                    onClick={handleMoveBack}
                    disabled={snapshot.pipeline_stage === PIPELINE_KEYS[0]}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleMoveNext}
                    disabled={
                      snapshot.pipeline_stage === PIPELINE_KEYS[PIPELINE_KEYS.length - 1] ||
                      !!stageAdvanceBlocker(snapshot, snapshot.pipeline_stage)
                    }
                    title={
                      stageAdvanceBlocker(snapshot, snapshot.pipeline_stage) || 'Advance stage'
                    }
                  >
                    Next →
                  </button>
                </div>
              </div>
              {PIPELINE.map((cfg) => (
                <StageBlock
                  key={cfg.key}
                  cfg={cfg}
                  draft={draft}
                  commit={commit}
                  flush={flush}
                  open={openStage === cfg.key}
                  active={snapshot.pipeline_stage === cfg.key}
                  stage={snapshot.pipeline[cfg.key]}
                  onToggle={() => setOpenStage(openStage === cfg.key ? '' : cfg.key)}
                  onUpdate={(field, value) => handleUpdateStage(cfg.key, field, value)}
                  onReopen={() => handleReopen(cfg.key)}
                  onToggleCheck={(idx, checked) => handleToggleCheck(cfg.key, idx, checked)}
                  onEditCheck={(idx, text) => handleEditCheck(cfg.key, idx, text)}
                  onToggleRequired={(idx, required) => handleToggleRequired(cfg.key, idx, required)}
                  onAddCheck={(text) => handleAddCheck(cfg.key, text)}
                  onRemoveCheck={(idx) => handleRemoveCheck(cfg.key, idx)}
                />
              ))}
            </section>
          </div>
        )}

        {tab === 'history' && <HistoryTab sampleId={row.id} />}
        {tab === 'attachments' && <AttachmentsTab sampleId={row.id} myUsername={myUsername} />}

        <footer className="rfq2-drawer-foot">
          <button className="rfq2-btn rfq2-btn-danger" onClick={onDelete}>
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <span className="rfq2-save-status">{saving ? 'Saving…' : 'Saved'}</span>
        </footer>
      </aside>
    </>
  );
}

function pickEditable(r) {
  return {
    cs: r.cs || '',
    npi_owner: r.npi_owner || '',
    customer: r.customer || '',
    ifs_code: r.ifs_code || '',
    part_number: r.part_number || '',
    version: r.version || '',
    std_lot: r.std_lot || '',
    shop_order: r.shop_order || '',
    qty: r.qty || 0,
    submit_date: r.submit_date || '',
    due_date: r.due_date || '',
    result: r.result || 'PENDING',
    reason_code: r.reason_code || '',
    ok_count: r.ok_count || 0,
    ng_count: r.ng_count || 0,
    remarks: r.remarks || '',
    linked_rfq: r.linked_rfq || '',
    linked_production_order: r.linked_production_order || '',
    specs: { ...defaultSpecs(), ...(r.specs || {}) },
  };
}

function DocumentFlowStrip({ row }) {
  return (
    <section className="rfq2-drawer-section rfq2-flow">
      <h4>Document Flow</h4>
      <div className="rfq2-flow-strip">
        <div className={'rfq2-flow-node' + (row.linked_rfq ? ' linked' : ' empty')}>
          <span className="rfq2-flow-icon">📋</span>
          <span className="rfq2-flow-label">
            RFQ
            <br />
            {row.linked_rfq ? <b>{row.linked_rfq}</b> : <i>not linked</i>}
          </span>
        </div>
        <div className="rfq2-flow-arrow">→</div>
        <div className="rfq2-flow-node active">
          <span className="rfq2-flow-icon">🧪</span>
          <span className="rfq2-flow-label">
            Sample
            <br />
            <b>{row.part_number || row.ifs_code || '—'}</b>
          </span>
        </div>
        <div className="rfq2-flow-arrow">→</div>
        <div className={'rfq2-flow-node' + (row.linked_production_order ? ' linked' : ' empty')}>
          <span className="rfq2-flow-icon">🏭</span>
          <span className="rfq2-flow-label">
            Production Order
            <br />
            {row.linked_production_order ? <b>{row.linked_production_order}</b> : <i>not linked</i>}
          </span>
        </div>
        <div className="rfq2-flow-arrow">→</div>
        <div
          className={
            'rfq2-flow-node' + (row.pipeline?.spec?.status === 'done' ? ' linked' : ' empty')
          }
        >
          <span className="rfq2-flow-icon">📄</span>
          <span className="rfq2-flow-label">
            Spec Released
            <br />
            {row.pipeline?.spec?.status === 'done' ? (
              <b>{(row.pipeline.spec.done || '').slice(0, 10)}</b>
            ) : (
              <i>pending</i>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

function StageBlock({
  cfg,
  draft,
  commit,
  flush,
  open,
  active,
  stage,
  onToggle,
  onUpdate,
  onReopen,
  onToggleCheck,
  onEditCheck,
  onToggleRequired,
  onAddCheck,
  onRemoveCheck,
}) {
  const [newItem, setNewItem] = useState('');
  const checklistDone = (stage.checklist || []).filter((i) => i.checked).length;
  const checklistTotal = (stage.checklist || []).length;
  const missingReq = (stage.checklist || []).filter((i) => i.required && !i.checked).length;
  const isDone = stage.status === 'done';
  // Prep stage shows parallel sub-track progress (material / film / cutter).
  const isPrep = cfg.key === 'prep';

  return (
    <div
      className={
        'rfq2-stage' + (active ? ' rfq2-stage-active' : '') + (isDone ? ' rfq2-stage-signed' : '')
      }
    >
      <button
        className="rfq2-stage-head"
        onClick={onToggle}
        aria-expanded={open}
        style={{ borderLeftColor: cfg.color }}
      >
        <span className="rfq2-stage-badge" style={{ background: cfg.bg, color: cfg.color }}>
          {cfg.short}
        </span>
        <span className="rfq2-stage-label">{cfg.label}</span>
        <span className="rfq2-stage-status" style={{ color: STATUS_COLOR[stage.status] }}>
          ● {STATUS_LABEL[stage.status]}
        </span>
        {missingReq > 0 && !isDone && <span className="rfq2-stage-req">{missingReq} req</span>}
        <span className="rfq2-stage-progress">
          {checklistDone}/{checklistTotal}
        </span>
        <span className="rfq2-stage-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="rfq2-stage-body">
          <div className="rfq2-stage-purpose">{cfg.purpose}</div>

          {isDone && (
            <div className="rfq2-signature">
              <span className="rfq2-signature-stamp">✓ Signed</span>
              <span className="rfq2-signature-meta">
                by <b>{stage.signed_by || '—'}</b> on{' '}
                {(stage.signed_at || '').slice(0, 19).replace('T', ' ')}
              </span>
              <button className="rfq2-signature-reopen" onClick={onReopen}>
                ⟲ Reopen
              </button>
            </div>
          )}

          {/* Prep stage — parallel sub-track cards */}
          {isPrep && (
            <div className="st2-prep-tracks">
              <PrepTrack
                label="Material"
                statusField="material_status"
                etaField="material_eta"
                draft={draft}
                commit={commit}
                flush={flush}
                disabled={isDone}
              />
              <PrepTrack
                label="Film / Plate"
                statusField="film_status"
                etaField="film_eta"
                nameField="film_plate"
                draft={draft}
                commit={commit}
                flush={flush}
                disabled={isDone}
              />
              <PrepTrack
                label="Cutter"
                statusField="cutter_status"
                etaField="cutter_eta"
                nameField="cutter_name"
                draft={draft}
                commit={commit}
                flush={flush}
                disabled={isDone}
              />
            </div>
          )}

          <fieldset disabled={isDone} className="rfq2-stage-fields">
            <div className="rfq2-grid-2">
              <label className="rfq2-field">
                <span>Status</span>
                <select value={stage.status} onChange={(e) => onUpdate('status', e.target.value)}>
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rfq2-field">
                <span>Owner ({cfg.role})</span>
                <input
                  type="text"
                  value={stage.owner || ''}
                  onChange={(e) => onUpdate('owner', e.target.value)}
                />
              </label>
              <label className="rfq2-field">
                <span>Start</span>
                <input
                  type="date"
                  value={stage.start || ''}
                  onChange={(e) => onUpdate('start', e.target.value)}
                />
              </label>
              <label className="rfq2-field">
                <span>Done</span>
                <input
                  type="date"
                  value={stage.done || ''}
                  onChange={(e) => onUpdate('done', e.target.value)}
                />
              </label>
              <label className="rfq2-field">
                <span>SLA (days)</span>
                <input
                  type="number"
                  value={stage.sla_days || 0}
                  onChange={(e) => onUpdate('sla_days', Number(e.target.value) || 0)}
                />
              </label>
            </div>

            {stage.status === 'blocked' && (
              <label className="rfq2-field rfq2-field-wide">
                <span>Blocked reason</span>
                <select
                  value={stage.reason_code || ''}
                  onChange={(e) => onUpdate('reason_code', e.target.value)}
                >
                  <option value="">(select)</option>
                  {REASON_CODES.blocked.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="rfq2-field rfq2-field-wide">
              <span>Notes</span>
              <textarea
                rows={2}
                value={stage.notes || ''}
                onChange={(e) => onUpdate('notes', e.target.value)}
              />
            </label>

            <div className="rfq2-checklist">
              <div className="rfq2-checklist-title">Checklist</div>
              {(stage.checklist || []).map((it, i) => (
                <div key={i} className={'rfq2-checklist-item' + (it.required ? ' required' : '')}>
                  <input
                    type="checkbox"
                    checked={!!it.checked}
                    onChange={(e) => onToggleCheck(i, e.target.checked)}
                  />
                  <input
                    type="text"
                    value={it.text}
                    onChange={(e) => onEditCheck(i, e.target.value)}
                    className={it.checked ? 'rfq2-check-done' : ''}
                  />
                  <label className="rfq2-checklist-req" title="Mark as required to advance">
                    <input
                      type="checkbox"
                      checked={!!it.required}
                      onChange={(e) => onToggleRequired(i, e.target.checked)}
                    />
                    <span>req</span>
                  </label>
                  <button
                    className="rfq2-checklist-del"
                    onClick={() => onRemoveCheck(i)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="rfq2-checklist-add">
                <input
                  type="text"
                  placeholder="+ Add task"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newItem.trim()) {
                      onAddCheck(newItem);
                      setNewItem('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newItem.trim()) {
                      onAddCheck(newItem);
                      setNewItem('');
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

// Prep-stage parallel sub-track (Material / Film / Cutter).
function PrepTrack({ label, statusField, etaField, nameField, draft, commit, flush, disabled }) {
  const status = draft.specs?.[statusField] || 'pending';
  const eta = draft.specs?.[etaField] || '';
  const name = nameField ? draft.specs?.[nameField] || '' : null;
  function setField(field, value) {
    commit('specs', { ...draft.specs, [field]: value });
    setTimeout(flush, 0);
  }
  return (
    <div className={'st2-prep-track st2-prep-' + status}>
      <div className="st2-prep-head">
        <span className="st2-prep-label">{label}</span>
        <span className="st2-prep-status" style={{ color: STATUS_COLOR[status] }}>
          ● {STATUS_LABEL[status]}
        </span>
      </div>
      {nameField && (
        <input
          type="text"
          placeholder="Name"
          value={name}
          disabled={disabled}
          onChange={(e) => setField(nameField, e.target.value)}
        />
      )}
      <input
        type="date"
        value={eta}
        disabled={disabled}
        onChange={(e) => setField(etaField, e.target.value)}
      />
      <select
        value={status}
        disabled={disabled}
        onChange={(e) => setField(statusField, e.target.value)}
      >
        {STATUS_OPTS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

function Field({ label, value, onChange, onBlur, type = 'text' }) {
  return (
    <label className="rfq2-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) =>
          onChange(type === 'number' ? parseLocaleNumber(e.target.value) || 0 : e.target.value)
        }
        onBlur={onBlur}
      />
    </label>
  );
}

// ── History tab ─────────────────────────────────────────────────

function HistoryTab({ sampleId }) {
  // See RFQTracker.HistoryTab for the no-in-effect-reset rationale —
  // the parent DetailDrawer already remounts on row change.
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancelled = false;
    sharedApi
      .getSampleAudit(sampleId)
      .then((list) => {
        if (!cancelled) setEntries(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e?.message || 'Load failed');
          setEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sampleId]);

  if (entries === null)
    return (
      <div className="rfq2-drawer-scroll" style={{ padding: 20 }}>
        Loading…
      </div>
    );
  if (err)
    return (
      <div className="rfq2-drawer-scroll" style={{ padding: 20, color: '#ef4444' }}>
        Error: {err}
      </div>
    );

  return (
    <div className="rfq2-drawer-scroll">
      <section className="rfq2-drawer-section">
        <h4>Audit Trail ({entries.length} events)</h4>
        {entries.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 12 }}>No events recorded yet.</div>
        ) : (
          <ol className="rfq2-audit">
            {[...entries].reverse().map((e, i) => (
              <li key={i} className={'rfq2-audit-item kind-' + (e.kind || '')}>
                <div className="rfq2-audit-ts">{(e.ts || '').slice(0, 19).replace('T', ' ')}</div>
                <div className="rfq2-audit-body">
                  <b>{e.user || '—'}</b> <span className="rfq2-audit-kind">{e.kind || ''}</span>
                  {e.field && (
                    <>
                      {' '}
                      · <span className="rfq2-audit-field">{e.field}</span>
                    </>
                  )}
                  {(e.from !== undefined || e.to !== undefined) && (
                    <div className="rfq2-audit-delta">
                      {e.from !== undefined && (
                        <span className="rfq2-audit-from">
                          {String(e.from).slice(0, 80) || '∅'}
                        </span>
                      )}
                      {e.from !== undefined && e.to !== undefined && <span> → </span>}
                      {e.to !== undefined && (
                        <span className="rfq2-audit-to">{String(e.to).slice(0, 80) || '∅'}</span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// ── Attachments ─────────────────────────────────────────────────

function AttachmentsTab({ sampleId, myUsername }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setList(null);
    sharedApi
      .listSampleAttachments(sampleId)
      .then((arr) => setList(Array.isArray(arr) ? arr : []))
      .catch(() => setList([]));
  }, [sampleId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const handleUpload = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      try {
        await sharedApi.uploadSampleAttachment(sampleId, file);
        showToast('Uploaded ' + file.name);
        reload();
      } catch (e) {
        showToast('Upload failed: ' + (e.message || 'Unknown error'), 'err');
      } finally {
        setBusy(false);
      }
    },
    [sampleId, reload]
  );

  const handleDelete = useCallback(
    async (attId, name) => {
      if (!confirm(`Remove attachment "${name}"?`)) return;
      try {
        await sharedApi.deleteSampleAttachment(sampleId, attId);
        reload();
      } catch (e) {
        showToast('Delete failed: ' + (e.message || 'Unknown error'), 'err');
      }
    },
    [sampleId, reload]
  );

  return (
    <div className="rfq2-drawer-scroll">
      <section className="rfq2-drawer-section">
        <h4>Attachments ({list?.length ?? 0})</h4>
        <div className="rfq2-attach-upload">
          <input
            type="file"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              e.target.value = '';
            }}
          />
          {busy && <span className="rfq2-save-status">Uploading…</span>}
          {myUsername && <span className="rfq2-save-status">as {myUsername}</span>}
        </div>
        {list === null ? (
          <div style={{ color: '#94a3b8' }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            No attachments yet — try the customer feedback email, sample photo, or QC report.
          </div>
        ) : (
          <table className="rfq2-attach-list">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded by</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a
                      href={sharedApi.sampleAttachmentUrl(sampleId, a.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.original}
                    </a>
                  </td>
                  <td className="rfq2-num">{fmtBytes(a.size)}</td>
                  <td>{a.uploaded_by}</td>
                  <td>{(a.uploaded_at || '').slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    <button
                      onClick={() => handleDelete(a.id, a.original)}
                      className="rfq2-checklist-del"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
