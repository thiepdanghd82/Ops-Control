/**
 * RFQTracker — SAP-style 5-stage RFQ pipeline.
 *
 * Feature set (beyond the initial Kanban + drawer rewrite):
 *   T1.1 Append-only audit log per RFQ (server-enforced)
 *   T1.2 Required-field gates — cannot advance stage until required
 *        checklist items are ticked
 *   T1.3 Standardized reason codes for Blocked / WIN / LOSS
 *   T2.4 Signature blocks — a stage stamped done is immutable; an
 *        explicit Reopen action wipes the signature and logs it
 *   T2.5 My Inbox filter — auto-filter to RFQs where the current user
 *        is the owner of the active stage
 *   T2.6 Document-flow strip in the drawer — links out to Quote
 *        History for quotes Sync'd from this RFQ
 *   T3.7 Attachment manager — server-side file store (content-addressed)
 *   T3.8 KPI trend chart — 6-month rolling win rate + cycle time
 *   T3.9 Saved filter variants — localStorage-backed named views
 *   T3.10 Bulk ops — multi-select + close/delete in List view
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { sharedApi, costApi } from '../../../services/api';
import { useCalc } from '../../../context/CalcContext';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import { parseLocaleNumber } from '../../../utils/format';
import { showToast } from '../../../utils/toast';
import useEscapeToClose from '../../../hooks/useEscapeToClose';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useAutoRefresh } from '../../../utils/useAutoRefresh';
import { subscribeDataEvents } from '../../../services/dataEventBus';
import TrackerLegendModal from './TrackerLegendModal';
import './RFQTracker.css';

// ── pipeline config ─────────────────────────────────────────────
//
// Each stage has a `default_checklist` — an array of { text, required? }.
// `required: true` items BLOCK advancing to the next stage until ticked.
// Optional items are best-practice reminders but non-blocking.

const PIPELINE = [
  {
    key: 'sale',
    label: 'Sale (Input)',
    short: 'Sale',
    color: '#2563eb',
    bg: '#dbeafe',
    role: 'Sales',
    purpose: 'Collect design file, specs, quantity, special materials, deadline',
    sla_days: 1,
    // Required items that BLOCK advance until ticked:
    required_fields: ['rfq_no', 'customer', 'product', 'eau_qty', 'deadline'],
    default_checklist: [
      { text: 'Design file received (AI / PDF)', required: true },
      { text: 'Size and shape confirmed', required: true },
      { text: 'EAU and MOQ stated', required: true },
      { text: 'Special material / finish noted', required: false },
      { text: 'Deadline agreed with customer', required: true },
    ],
  },
  {
    key: 'feasibility',
    label: 'NPI Quote Specialist',
    short: 'Feasibility',
    color: '#7c3aed',
    bg: '#ede9fe',
    role: 'NPI Quote',
    purpose: 'Feasibility review, classify print type, approve for costing',
    sla_days: 1,
    required_fields: ['specs.print_type'],
    default_checklist: [
      { text: 'Feasibility reviewed', required: true },
      { text: 'Print type classified (Offset/Flexo/Digital)', required: true },
      { text: 'Risks logged (tolerance, ink, material)', required: false },
      { text: 'Approved for costing', required: true },
    ],
  },
  {
    key: 'design',
    label: 'NPI Design Process',
    short: 'Design',
    color: '#059669',
    bg: '#d1fae5',
    role: 'NPI Design',
    purpose: 'Imposition, dieline, wastage estimate',
    sla_days: 2,
    required_fields: ['specs.width_mm', 'specs.height_mm'],
    default_checklist: [
      { text: 'Imposition / layout done', required: true },
      { text: 'Dieline prepared', required: true },
      { text: 'Wastage estimated', required: false },
      { text: 'Layout approved by NPI', required: true },
    ],
  },
  {
    key: 'sourcing',
    label: 'Materials Sourcing',
    short: 'Sourcing',
    color: '#0891b2',
    bg: '#cffafe',
    role: 'Purchasing',
    purpose: 'Quote paper, ink, foil, die tooling from suppliers',
    sla_days: 3,
    required_fields: [],
    default_checklist: [
      { text: 'Paper / film priced', required: true },
      { text: 'Ink priced', required: true },
      { text: 'Foil / lamination priced', required: false },
      { text: 'Die / tooling priced', required: true },
      { text: 'Prices updated in Library', required: true },
    ],
  },
  {
    key: 'pricing',
    label: 'Pricing (Final)',
    short: 'Pricing',
    color: '#d97706',
    bg: '#fef3c7',
    role: 'Costing',
    purpose: 'Labour + depreciation + margin → final quotation',
    sla_days: 1,
    required_fields: [],
    default_checklist: [
      { text: 'Labour costs computed', required: true },
      { text: 'Machine depreciation applied', required: true },
      { text: 'Margin reviewed', required: true },
      { text: 'Quote released to customer', required: true },
    ],
  },
];

const PIPELINE_KEYS = PIPELINE.map((p) => p.key);

const STATUS_OPTS = ['pending', 'active', 'done', 'blocked'];
const STATUS_LABEL = { pending: 'Pending', active: 'Active', done: 'Done', blocked: 'Blocked' };
const STATUS_COLOR = { pending: '#9ca3af', active: '#2563eb', done: '#22c55e', blocked: '#ef4444' };

const RESULT_OPTS = ['PENDING', 'WIN', 'LOSS', 'NEGOTIATING'];
const RESULT_COLORS = {
  WIN: '#22c55e',
  LOSS: '#ef4444',
  PENDING: '#f59e0b',
  NEGOTIATING: '#3b82f6',
};

const PRINT_TYPES = ['', 'Offset', 'Flexo', 'Digital', 'Hybrid'];

// T1.3 Reason codes — standardised enums for Blocked / WIN / LOSS.
// Codes are short uppercase for reportability; labels are human.
const REASON_CODES = {
  blocked: [
    { code: 'R01', label: 'Tolerance not achievable' },
    { code: 'R02', label: 'Material unavailable' },
    { code: 'R03', label: 'Awaiting customer input' },
    { code: 'R04', label: 'Awaiting supplier quote' },
    { code: 'R05', label: 'Design file defective' },
    { code: 'R06', label: 'Capacity conflict' },
    { code: 'R99', label: 'Other — see notes' },
  ],
  loss: [
    { code: 'L01', label: 'Price too high' },
    { code: 'L02', label: 'Lead time too long' },
    { code: 'L03', label: 'Technology / capability gap' },
    { code: 'L04', label: 'Quality concern' },
    { code: 'L05', label: 'Customer cancelled project' },
    { code: 'L06', label: 'Relationship / commercial terms' },
    { code: 'L99', label: 'Other — see notes' },
  ],
  win: [
    { code: 'W01', label: 'Best price' },
    { code: 'W02', label: 'Best lead time' },
    { code: 'W03', label: 'Best technology match' },
    { code: 'W04', label: 'Existing-customer loyalty' },
    { code: 'W05', label: 'Sole qualified supplier' },
    { code: 'W99', label: 'Other — see notes' },
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
    // Signatures are set once the stage transitions to 'done' and are
    // immutable until a Reopen action explicitly clears them.
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
    print_type: '',
    width_mm: 0,
    height_mm: 0,
    material: '',
    ink_spec: '',
    foil: '',
    die_type: '',
    dieline_file: '',
    layout_file: '',
  };
}

function ensureShape(r) {
  if (!r || typeof r !== 'object') return null;
  const pipeline = { ...defaultPipeline(), ...(r.pipeline || {}) };
  for (const cfg of PIPELINE) {
    const s = pipeline[cfg.key] || {};
    const defaults = defaultStageBlock(cfg);
    // Merge checklist item-by-item so legacy strings / missing `required`
    // flags get upgraded without losing the saved `checked` state.
    const existingCL = Array.isArray(s.checklist) ? s.checklist : [];
    const merged = defaults.checklist.map((d, i) => {
      const found = existingCL.find((e) => e && (e.text || '') === d.text) || existingCL[i] || null;
      if (found && typeof found === 'object') {
        return {
          text: d.text,
          required: typeof found.required === 'boolean' ? found.required : d.required,
          checked: !!found.checked,
        };
      }
      if (typeof found === 'string') return { text: d.text, required: d.required, checked: false };
      return d;
    });
    // Preserve any ad-hoc items the operator added (not in defaults).
    for (const e of existingCL) {
      if (!e || typeof e !== 'object') continue;
      if (!merged.some((m) => m.text === e.text)) {
        merged.push({ text: e.text, checked: !!e.checked, required: !!e.required });
      }
    }
    pipeline[cfg.key] = {
      ...defaults,
      ...s,
      checklist: merged,
    };
  }
  return {
    ...r,
    pipeline,
    specs: { ...defaultSpecs(), ...(r.specs || {}) },
    pipeline_stage: r.pipeline_stage || deriveCurrentStage(pipeline, r.result),
    linked_quotes: Array.isArray(r.linked_quotes) ? r.linked_quotes : [],
    reason_code: r.reason_code || '',
  };
}

function deriveCurrentStage(pipeline, result) {
  if (result === 'WIN' || result === 'LOSS') return 'pricing';
  for (const cfg of PIPELINE) {
    const s = pipeline[cfg.key];
    if (!s) continue;
    if (s.status === 'blocked') return cfg.key;
    if (s.status !== 'done') return cfg.key;
  }
  return 'pricing';
}

function daysBetween(a, b) {
  if (!a) return null;
  const d1 = new Date(a);
  const d2 = b ? new Date(b) : new Date();
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

function fmtMoney(v) {
  if (!v) return '—';
  return '$' + Number(v).toLocaleString();
}

// Check if a stage can be advanced. Returns null if OK, or a string
// describing what's missing (shown in a tooltip on the disabled button).
function stageAdvanceBlocker(row, stageKey) {
  const cfg = PIPELINE.find((p) => p.key === stageKey);
  if (!cfg) return 'Unknown stage';
  // Missing top-level fields
  for (const fieldPath of cfg.required_fields) {
    const val = fieldPath.split('.').reduce((o, k) => (o ? o[k] : undefined), row);
    if (val === undefined || val === null || val === '' || val === 0) {
      return `Required: ${fieldPath}`;
    }
  }
  // Missing required checklist ticks
  const stage = row.pipeline[stageKey];
  const unchecked = (stage.checklist || []).filter((it) => it.required && !it.checked);
  if (unchecked.length) return `${unchecked.length} required task(s) unticked`;
  return null;
}

function buildPrefillPayload(r) {
  const sizes = r.specs || {};
  return {
    rfq_number: r.rfq_no || '',
    direct_cu: r.customer || '',
    project_name: r.product || '',
    description: r.product || '',
    annual_qty: Number(r.eau_qty) || 0,
    moq: Number(r.moq) || 0,
    npi_owner: r.npi_owner || r.owner || '',
    sale_owner: r.sale_owner || '',
    part_width: Number(sizes.width_mm) || 0,
    part_length_md: Number(sizes.height_mm) || 0,
  };
}

// T3.9 Saved filter variants — localStorage key.
const FILTER_VARIANT_KEY = 'ops-rfq-variants-v1';
function loadVariants() {
  try {
    return JSON.parse(localStorage.getItem(FILTER_VARIANT_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveVariants(list) {
  try {
    localStorage.setItem(FILTER_VARIANT_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

// ── component ───────────────────────────────────────────────────

export default function RFQTracker() {
  const { t } = useI18n();
  const [filter, setFilter] = useState({
    text: '',
    result: 'all',
    owner: 'all',
    stage: 'all',
    myInbox: false,
  });
  const [view, setView] = useState('kanban');
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [variants, setVariants] = useState(() => loadVariants());
  const [legendOpen, setLegendOpen] = useState(false);

  const { setPendingQuote } = useCalc();
  const { user } = useAuth();
  const myUsername = user?.username || '';

  useEscapeToClose(detailId != null ? () => setDetailId(null) : null);

  const {
    data: rawData,
    setData,
    loading,
    refresh,
  } = useAbortableFetch((signal) => sharedApi.getRFQTracker({ signal }), [], {
    onError: (err) => console.error('Failed to load RFQ data:', err),
  });
  // v1.3 P0 — auto-refresh every 60s khi tab visible
  useAutoRefresh(refresh, { intervalMs: 60000, pauseWhenHidden: true });
  // v1.3 Đợt 2 — instant refetch on SSE rfq.updated push
  useEffect(() => {
    const unsub = subscribeDataEvents(['rfq.updated'], () => {
      refresh();
    });
    return unsub;
  }, [refresh]);

  const data = useMemo(() => {
    const arr = Array.isArray(rawData) ? rawData : [];
    return arr.map(ensureShape).filter(Boolean);
  }, [rawData]);

  const owners = useMemo(() => {
    const set = new Set();
    for (const r of data) {
      if (r.owner) set.add(r.owner);
      if (r.sale_owner) set.add(r.sale_owner);
      if (r.npi_owner) set.add(r.npi_owner);
      for (const cfg of PIPELINE) {
        const o = r.pipeline?.[cfg.key]?.owner;
        if (o) set.add(o);
      }
    }
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (filter.myInbox && myUsername) {
        // "My Inbox" = I am the owner of the current active stage OR
        // any of the identity-level owner fields.
        const activeOwner = r.pipeline?.[r.pipeline_stage]?.owner || '';
        if (
          ![activeOwner, r.owner, r.sale_owner, r.npi_owner].some(
            (v) => v && v.toLowerCase() === myUsername.toLowerCase()
          )
        )
          return false;
      }
      if (filter.result !== 'all' && r.result !== filter.result) return false;
      if (filter.owner !== 'all' && ![r.owner, r.sale_owner, r.npi_owner].includes(filter.owner))
        return false;
      if (filter.stage !== 'all' && r.pipeline_stage !== filter.stage) return false;
      if (filter.text) {
        const q = filter.text.toLowerCase();
        if (
          ![r.rfq_no, r.customer, r.product, r.owner].some((f) =>
            (f || '').toLowerCase().includes(q)
          )
        )
          return false;
      }
      return true;
    });
  }, [data, filter, myUsername]);

  const kpis = useMemo(() => {
    const total = data.length;
    const wins = data.filter((r) => r.result === 'WIN').length;
    const losses = data.filter((r) => r.result === 'LOSS').length;
    const active = data.filter((r) => r.result !== 'WIN' && r.result !== 'LOSS').length;
    const nego = data.filter((r) => r.result === 'NEGOTIATING').length;
    const today = new Date();
    const breach = data.filter((r) => {
      if (r.result === 'WIN' || r.result === 'LOSS') return false;
      if (r.deadline) {
        const d = new Date(r.deadline);
        if (!isNaN(d) && d < today) return true;
      }
      return PIPELINE_KEYS.some((k) => r.pipeline?.[k]?.status === 'blocked');
    }).length;
    const value = data.reduce((s, r) => s + (Number(r.quote_value) || 0), 0);
    const closed = wins + losses;
    return {
      total,
      wins,
      losses,
      active,
      nego,
      breach,
      winRate: closed ? Math.round((wins / closed) * 100) : 0,
      value,
    };
  }, [data]);

  const stageCounts = useMemo(() => {
    const m = Object.fromEntries(PIPELINE.map((p) => [p.key, 0]));
    m.done = 0;
    for (const r of filtered) {
      if (r.result === 'WIN' || r.result === 'LOSS') m.done++;
      else m[r.pipeline_stage] = (m[r.pipeline_stage] || 0) + 1;
    }
    return m;
  }, [filtered]);

  const detailRow = useMemo(
    () => (detailId != null ? data.find((r) => r.id === detailId) || null : null),
    [detailId, data]
  );

  // T1.1 Audit helper. Fire-and-forget from the UI — if the network
  // call fails we log but don't block the save. The authoritative
  // effect of the audit is on the server file, not in React state.
  const appendAudit = useCallback((rfqId, entry) => {
    sharedApi.appendRFQAudit(rfqId, entry).catch((err) => {
      console.warn('Audit append failed:', err?.message || err);
    });
  }, []);

  const saveData = useCallback(
    async (newData, auditBatch) => {
      setSaving(true);
      try {
        await costApi.saveAll({ rfqTracker: newData });
        setData(newData);
        if (auditBatch && auditBatch.length) {
          for (const { rfqId, entry } of auditBatch) appendAudit(rfqId, entry);
        }
      } catch (err) {
        console.error('Save failed:', err);
        showToast('Save failed: ' + (err.message || 'Unknown error'), 'err');
      } finally {
        setSaving(false);
      }
    },
    [setData, appendAudit]
  );

  // Diff helper: compute a list of audit entries for what changed
  // between the current row and the next. Called from upsertRow so
  // every field change that flows through the UI gets a log entry.
  const diffForAudit = useCallback((rfqId, oldRow, newRow) => {
    const out = [];
    // Scalar top-level fields we track
    const tracked = [
      'rfq_no',
      'customer',
      'product',
      'eau_qty',
      'moq',
      'quote_value',
      'rfq_date',
      'deadline',
      'owner',
      'sale_owner',
      'npi_owner',
      'result',
      'remarks',
      'reason_code',
    ];
    for (const k of tracked) {
      if (String(oldRow?.[k] ?? '') !== String(newRow?.[k] ?? '')) {
        out.push({
          rfqId,
          entry: { kind: 'field_change', field: k, from: oldRow?.[k] ?? '', to: newRow?.[k] ?? '' },
        });
      }
    }
    // specs.*
    for (const k of Object.keys(defaultSpecs())) {
      const a = oldRow?.specs?.[k];
      const b = newRow?.specs?.[k];
      if (String(a ?? '') !== String(b ?? '')) {
        out.push({
          rfqId,
          entry: { kind: 'field_change', field: 'specs.' + k, from: a ?? '', to: b ?? '' },
        });
      }
    }
    return out;
  }, []);

  const upsertRow = useCallback(
    (row, extraAudit = []) => {
      const next = ensureShape(row);
      next.pipeline_stage = deriveCurrentStage(next.pipeline, next.result);
      const prev = data.find((r) => r.id === next.id);
      const auditBatch = [...diffForAudit(next.id, prev, next), ...extraAudit];
      const exists = data.findIndex((r) => r.id === next.id);
      const newData = exists >= 0 ? data.map((r, i) => (i === exists ? next : r)) : [...data, next];
      return saveData(newData, auditBatch);
    },
    [data, saveData, diffForAudit]
  );

  const handleAdd = useCallback(() => {
    const maxId = data.reduce((max, r) => Math.max(max, r.id || 0), 0);
    const now = new Date().toISOString();
    const fresh = ensureShape({
      id: maxId + 1,
      rfq_no: '',
      quotation_count: 1,
      customer: '',
      product: '',
      eau_qty: 0,
      moq: 0,
      rfq_date: now.slice(0, 10),
      deadline: '',
      owner: '',
      sale_owner: myUsername,
      npi_owner: '',
      quote_value: 0,
      result: 'PENDING',
      remarks: '',
      created_at: now,
    });
    // Activate the first stage immediately so the audit trail starts
    // with a clean "sale created + started" entry.
    fresh.pipeline.sale.status = 'active';
    fresh.pipeline.sale.start = now.slice(0, 10);
    fresh.pipeline.sale.owner = myUsername;
    fresh.pipeline_stage = 'sale';
    const newData = [...data, fresh];
    saveData(newData, [
      { rfqId: fresh.id, entry: { kind: 'created', meta: { sale_owner: myUsername } } },
    ]).then(() => setDetailId(fresh.id));
  }, [data, saveData, myUsername]);

  const handleDelete = useCallback(
    (id) => {
      if (!confirm('Delete this RFQ?')) return;
      saveData(
        data.filter((r) => r.id !== id),
        [{ rfqId: id, entry: { kind: 'deleted' } }]
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

  // T1.2 gated moveStage — refuses advance if requirements unmet.
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
        // Mark current done + stamp signature.
        pipeline[curKey] = {
          ...pipeline[curKey],
          status: 'done',
          done: pipeline[curKey].done || now,
          signed_by: myUsername || '-',
          signed_at: new Date().toISOString(),
        };
        // Activate next.
        pipeline[nxtKey] = {
          ...pipeline[nxtKey],
          status: 'active',
          start: pipeline[nxtKey].start || now,
        };
      } else {
        // Back = demote current to pending; activate previous.
        pipeline[curKey] = { ...pipeline[curKey], status: 'pending' };
        pipeline[nxtKey] = { ...pipeline[nxtKey], status: 'active' };
      }
      upsertRow({ ...r, pipeline, pipeline_stage: nxtKey }, [
        {
          rfqId: id,
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

  // T2.4 Reopen — clears signature on a 'done' stage, forces stage
  // back to 'active', and logs the reopen event.
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
          rfqId: id,
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
      // Block edits to a done stage's checklist / status without Reopen.
      if (stage.status === 'done' && (field === 'status' || field === 'notes')) {
        // Allow notes through (audit-safe), but status change requires reopen.
        if (field === 'status' && value !== 'done') {
          showToast('Reopen the stage before changing its status', 'err');
          return;
        }
      }
      const pipeline = {
        ...r.pipeline,
        [stageKey]: { ...stage, [field]: value },
      };
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
                rfqId: id,
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
      if (!text || !text.trim()) return;
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      const checklist = [
        ...stage.checklist,
        { text: text.trim(), checked: false, required: false },
      ];
      const pipeline = { ...r.pipeline, [stageKey]: { ...stage, checklist } };
      upsertRow({ ...r, pipeline });
    },
    [data, upsertRow]
  );

  const removeChecklistItem = useCallback(
    (id, stageKey, idx) => {
      const r = data.find((x) => x.id === id);
      if (!r) return;
      const stage = r.pipeline[stageKey];
      const checklist = stage.checklist.filter((_, i) => i !== idx);
      const pipeline = { ...r.pipeline, [stageKey]: { ...stage, checklist } };
      upsertRow({ ...r, pipeline });
    },
    [data, upsertRow]
  );

  const syncToPricing = useCallback(
    (row) => {
      const payload = buildPrefillPayload(row);
      setPendingQuote(row.id, 'rfq-sync', 'prefill', payload);
      // Add a linked_quotes entry so the document-flow strip can display
      // where this RFQ handed off. The Pricing save hook pushes the
      // real quote id back later (out of scope here).
      const linked_quotes = [
        ...(row.linked_quotes || []),
        { ts: new Date().toISOString(), action: 'sync', rfq_number: row.rfq_no, user: myUsername },
      ];
      upsertRow({ ...row, linked_quotes }, [
        { rfqId: row.id, entry: { kind: 'synced_to_pricing', meta: payload } },
      ]);
      window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: 'standard' }));
      setDetailId(null);
    },
    [setPendingQuote, upsertRow, myUsername]
  );

  // T3.10 Bulk ops
  const toggleSelect = useCallback((id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const bulkClose = useCallback(
    (result) => {
      if (!selected.size) return;
      if (!confirm(`Mark ${selected.size} RFQ(s) as ${result}?`)) return;
      const ids = [...selected];
      const newData = data.map((r) => (ids.includes(r.id) ? ensureShape({ ...r, result }) : r));
      saveData(
        newData,
        ids.map((id) => ({ rfqId: id, entry: { kind: 'bulk_result_set', to: result } }))
      );
      setSelected(new Set());
    },
    [selected, data, saveData]
  );

  const bulkDelete = useCallback(() => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} RFQ(s)? This cannot be undone.`)) return;
    const ids = new Set(selected);
    saveData(
      data.filter((r) => !ids.has(r.id)),
      [...ids].map((id) => ({ rfqId: id, entry: { kind: 'deleted' } }))
    );
    setSelected(new Set());
  }, [selected, data, saveData]);

  // T3.9 Filter variants
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

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={10} cols={8} />
      </div>
    );
  }

  return (
    <div className="rfq-tracker rfq2">
      {/* KPI bar with trend */}
      <KpiBar kpis={kpis} data={data} />

      {/* Toolbar */}
      <div className="rfq2-toolbar">
        <input
          type="search"
          className="rfq2-search"
          placeholder={t('rfq.search_placeholder')}
          value={filter.text}
          onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
        />
        <button
          className={'rfq2-chip-btn' + (filter.myInbox ? ' active' : '')}
          onClick={() => setFilter((f) => ({ ...f, myInbox: !f.myInbox }))}
          title={
            myUsername
              ? `Show RFQs where ${myUsername} is the active-stage owner`
              : 'Log in to enable'
          }
          disabled={!myUsername}
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
          value={filter.owner}
          onChange={(e) => setFilter((f) => ({ ...f, owner: e.target.value }))}
          aria-label="Filter owner"
        >
          <option value="all">All Owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
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
          + New RFQ
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="rfq2-bulk">
          <span>{selected.size} selected</span>
          <button onClick={() => bulkClose('WIN')}>{t('rfq.mark_win')}</button>
          <button onClick={() => bulkClose('LOSS')}>{t('rfq.mark_loss')}</button>
          <button onClick={() => bulkClose('NEGOTIATING')}>{t('rfq.mark_negotiating')}</button>
          <button className="rfq2-btn-danger" onClick={bulkDelete}>
            Delete
          </button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Body */}
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
            title="No RFQ records match the filters"
            hint="Clear the filters or add a new RFQ to get started."
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
          onSync={() => syncToPricing(detailRow)}
        />
      )}

      {legendOpen && <TrackerLegendModal kind="rfq" onClose={() => setLegendOpen(false)} />}
    </div>
  );
}

// ── KPI bar with sparkline trend ───────────────────────────────

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
      <div className="rfq2-kpis" role="group" aria-label="RFQ KPIs">
        <Kpi label="Total RFQ" value={kpis.total} />
        <Kpi label="Active" value={kpis.active} tone="brand" />
        <Kpi label="SLA Breach" value={kpis.breach} tone="danger" />
        <Kpi
          label="Win Rate"
          value={kpis.winRate + '%'}
          tone="good"
          sub={`${kpis.wins} win / ${kpis.losses} loss`}
        />
        <Kpi label="Negotiating" value={kpis.nego} tone="info" />
        <Kpi label="Pipeline Value" value={fmtMoney(kpis.value)} tone="amber" />
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

// T3.8 Rolling 6-month chart of Win Rate % + avg cycle time.
function TrendChart({ data }) {
  const buckets = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleString('en', { month: 'short' }),
        wins: 0,
        losses: 0,
        cycle_sum: 0,
        cycle_n: 0,
      });
    }
    for (const r of data) {
      const dateStr = r.pipeline?.pricing?.done || r.rfq_date;
      if (!dateStr) continue;
      const m = dateStr.slice(0, 7);
      const b = months.find((x) => x.key === m);
      if (!b) continue;
      if (r.result === 'WIN') b.wins++;
      if (r.result === 'LOSS') b.losses++;
      if (r.rfq_date && r.pipeline?.pricing?.done) {
        const d = daysBetween(r.rfq_date, r.pipeline.pricing.done);
        if (d != null && d >= 0) {
          b.cycle_sum += d;
          b.cycle_n++;
        }
      }
    }
    return months.map((b) => ({
      ...b,
      winRate: b.wins + b.losses ? Math.round((b.wins / (b.wins + b.losses)) * 100) : 0,
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
        <span>Win Rate % (blue) and Avg Cycle Days (amber) — last 6 months</span>
      </div>
      <svg width={W} height={H} role="img" aria-label="6-month trend">
        {buckets.map((b, i) => {
          const x = PAD + colW * i + 4;
          const barW = colW / 2 - 4;
          const wrH = (H - 2 * PAD) * (b.winRate / 100);
          const cyH = (H - 2 * PAD) * (b.cycle / maxCycle);
          return (
            <g key={b.key}>
              <rect x={x} y={H - PAD - wrH} width={barW} height={wrH} fill="#2563eb" />
              <rect x={x + barW + 2} y={H - PAD - cyH} width={barW} height={cyH} fill="#d97706" />
              <text x={x + barW} y={H - PAD + 12} textAnchor="middle" fontSize="10" fill="#475569">
                {b.label}
              </text>
              <text
                x={x + barW / 2}
                y={H - PAD - wrH - 2}
                textAnchor="middle"
                fontSize="9"
                fill="#2563eb"
              >
                {b.winRate}%
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

// ── Variant menu ─────────────────────────────────────────────────

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
      if (r.result === 'WIN' || r.result === 'LOSS') buckets.done.push(r);
      else (buckets[r.pipeline_stage] || (buckets[r.pipeline_stage] = [])).push(r);
    }
    return buckets;
  }, [data]);

  return (
    <div className="rfq2-board">
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
  const daysToDeadline = daysBetween(new Date().toISOString().slice(0, 10), row.deadline);
  const breached = daysToDeadline != null && daysToDeadline < 0 && !done;
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
        <span className="rfq2-card-no">{row.rfq_no || 'RFQ?'}</span>
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
      <div className="rfq2-card-product">{row.product || '—'}</div>
      <div className="rfq2-card-meta">
        <span>EAU {(Number(row.eau_qty) || 0).toLocaleString()}</span>
        {row.owner && <span className="rfq2-card-owner">{row.owner}</span>}
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
            {breached && <span className="rfq2-card-breach-tag">Over deadline</span>}
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
                  title={blocker ? blocker : 'Advance stage'}
                >
                  Next →
                </button>
              )}
            </div>
          )}
        </>
      )}
      {done && row.quote_value != null && (
        <div className="rfq2-card-foot">
          <span>{fmtMoney(row.quote_value)}</span>
          {row.reason_code && (
            <span className="rfq2-chip" style={{ background: '#f3f4f6', color: '#374151' }}>
              {row.reason_code}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────

function ListView({ data, selected, onToggleSelect, onOpen, onDelete }) {
  const { t } = useI18n();
  return (
    <div className="rfq2-list-wrap">
      <table className="rfq2-list">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th>RFQ No.</th>
            <th>{t('rfq.col.customer')}</th>
            <th>{t('rfq.col.product')}</th>
            <th>EAU</th>
            <th>{t('rfq.col.stage')}</th>
            <th>Age</th>
            <th>Deadline</th>
            <th>{t('qh.owner')}</th>
            <th>Value</th>
            <th>{t('rfq.col.result')}</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const cfg = PIPELINE.find((p) => p.key === r.pipeline_stage) || PIPELINE[0];
            const stage = r.pipeline[r.pipeline_stage];
            const age = daysBetween(r.rfq_date);
            const daysToDeadline = daysBetween(new Date().toISOString().slice(0, 10), r.deadline);
            return (
              <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => onToggleSelect(r.id)}
                    aria-label={`Select ${r.rfq_no}`}
                  />
                </td>
                <td className="rfq2-mono">{r.rfq_no}</td>
                <td>{r.customer}</td>
                <td className="rfq2-truncate">{r.product}</td>
                <td className="rfq2-num">{(Number(r.eau_qty) || 0).toLocaleString()}</td>
                <td>
                  <span
                    className="rfq2-stage-pill"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.short} · {STATUS_LABEL[stage.status] || ''}
                  </span>
                </td>
                <td className="rfq2-num">{age != null ? age + 'd' : ''}</td>
                <td className={daysToDeadline != null && daysToDeadline < 0 ? 'rfq2-bad' : ''}>
                  {r.deadline || '—'}
                </td>
                <td>{r.owner}</td>
                <td className="rfq2-num">{fmtMoney(r.quote_value)}</td>
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
  onSync,
}) {
  const [tab, setTab] = useState('detail'); // detail | history | attachments
  // openStage is DERIVED from row.pipeline_stage with an explicit
  // user-override layer. When the row's active stage advances
  // (operator clicks Next/Back), the derived value auto-tracks. When
  // the user manually expands a different stage, `override` wins.
  // Passing `null` to setOverride collapses to the row's active stage.
  // (The outer `<DetailDrawer key={row.id}>` handles cross-row reset.)
  const [override, setOverride] = useState(null);
  const openStage = override ?? row.pipeline_stage ?? 'sale';
  const setOpenStage = (k) => setOverride(k === (row.pipeline_stage ?? 'sale') ? null : k);

  // Draft state re-initialises on cross-row mount (via key) — no
  // useEffect needed.
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

  return (
    <>
      <div className="rfq2-drawer-scrim" onClick={onClose} />
      <aside
        className="rfq2-drawer"
        data-ops-draggable-card
        role="dialog"
        aria-label="RFQ detail"
        onBlur={flush}
      >
        <header className="rfq2-drawer-head" data-ops-drag-handle>
          <div>
            <div className="rfq2-drawer-title">{row.rfq_no || 'New RFQ'}</div>
            <div className="rfq2-drawer-sub">
              {row.customer || ''} {row.product ? '· ' + row.product : ''}
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
                  label="RFQ No."
                  value={draft.rfq_no}
                  onChange={(v) => commit('rfq_no', v)}
                  onBlur={flush}
                />
                <Field
                  label="Customer"
                  value={draft.customer}
                  onChange={(v) => commit('customer', v)}
                  onBlur={flush}
                />
                <Field
                  label="Product"
                  value={draft.product}
                  onChange={(v) => commit('product', v)}
                  onBlur={flush}
                />
                <Field
                  label="EAU Qty"
                  type="number"
                  value={draft.eau_qty}
                  onChange={(v) => commit('eau_qty', v)}
                  onBlur={flush}
                />
                <Field
                  label="MOQ"
                  type="number"
                  value={draft.moq}
                  onChange={(v) => commit('moq', v)}
                  onBlur={flush}
                />
                <Field
                  label="Quote Value (USD)"
                  type="number"
                  value={draft.quote_value}
                  onChange={(v) => commit('quote_value', v)}
                  onBlur={flush}
                />
                <Field
                  label="RFQ Date"
                  type="date"
                  value={draft.rfq_date}
                  onChange={(v) => commit('rfq_date', v)}
                  onBlur={flush}
                />
                <Field
                  label="Deadline"
                  type="date"
                  value={draft.deadline}
                  onChange={(v) => commit('deadline', v)}
                  onBlur={flush}
                />
                <Field
                  label="Sales Owner"
                  value={draft.sale_owner}
                  onChange={(v) => commit('sale_owner', v)}
                  onBlur={flush}
                />
                <Field
                  label="NPI Owner"
                  value={draft.npi_owner}
                  onChange={(v) => commit('npi_owner', v)}
                  onBlur={flush}
                />
                <Field
                  label="Owner (overall)"
                  value={draft.owner}
                  onChange={(v) => commit('owner', v)}
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
              {/* T1.3 reason-code dropdown for WIN / LOSS */}
              {(draft.result === 'WIN' || draft.result === 'LOSS') && (
                <label className="rfq2-field rfq2-field-wide">
                  <span>Reason Code ({draft.result})</span>
                  <select
                    value={draft.reason_code || ''}
                    onChange={(e) => {
                      commit('reason_code', e.target.value);
                      setTimeout(flush, 0);
                    }}
                  >
                    <option value="">(select)</option>
                    {REASON_CODES[draft.result === 'WIN' ? 'win' : 'loss'].map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
              <h4>Print Specs</h4>
              <div className="rfq2-grid-2">
                <label className="rfq2-field">
                  <span>Print Type</span>
                  <select
                    value={draft.specs?.print_type || ''}
                    onChange={(e) => {
                      commit('specs', { ...draft.specs, print_type: e.target.value });
                      setTimeout(flush, 0);
                    }}
                  >
                    {PRINT_TYPES.map((p) => (
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
                  label="Material"
                  value={draft.specs?.material}
                  onChange={(v) => commit('specs', { ...draft.specs, material: v })}
                  onBlur={flush}
                />
                <Field
                  label="Ink Spec"
                  value={draft.specs?.ink_spec}
                  onChange={(v) => commit('specs', { ...draft.specs, ink_spec: v })}
                  onBlur={flush}
                />
                <Field
                  label="Foil / Finish"
                  value={draft.specs?.foil}
                  onChange={(v) => commit('specs', { ...draft.specs, foil: v })}
                  onBlur={flush}
                />
                <Field
                  label="Die Type"
                  value={draft.specs?.die_type}
                  onChange={(v) => commit('specs', { ...draft.specs, die_type: v })}
                  onBlur={flush}
                />
                <Field
                  label="Dieline File"
                  value={draft.specs?.dieline_file}
                  onChange={(v) => commit('specs', { ...draft.specs, dieline_file: v })}
                  onBlur={flush}
                />
              </div>
            </section>

            {/* T2.6 Document flow strip */}
            <DocumentFlowStrip row={row} />

            <section className="rfq2-drawer-section">
              {(() => {
                const isLastStage = row.pipeline_stage === PIPELINE_KEYS[PIPELINE_KEYS.length - 1];
                const blocker = isLastStage ? null : stageAdvanceBlocker(row, row.pipeline_stage);
                return (
                  <>
                    <div className="rfq2-drawer-sec-head">
                      <h4>Pipeline</h4>
                      <div className="rfq2-move">
                        <button
                          onClick={onMoveBack}
                          disabled={row.pipeline_stage === PIPELINE_KEYS[0]}
                        >
                          ← Back
                        </button>
                        <button
                          onClick={onMoveNext}
                          disabled={isLastStage || !!blocker}
                          title={blocker || 'Advance stage'}
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                    {blocker && (
                      <div className="rfq2-stage-blocker" role="alert">
                        ⚠ Cannot advance: {blocker}. Fill this and the Next button enables.
                      </div>
                    )}
                  </>
                );
              })()}
              {PIPELINE.map((cfg) => (
                <StageBlock
                  key={cfg.key}
                  cfg={cfg}
                  open={openStage === cfg.key}
                  active={row.pipeline_stage === cfg.key}
                  stage={row.pipeline[cfg.key]}
                  onToggle={() => setOpenStage(openStage === cfg.key ? '' : cfg.key)}
                  onUpdate={(field, value) => onUpdateStage(cfg.key, field, value)}
                  onReopen={() => onReopen(cfg.key)}
                  onToggleCheck={(idx, checked) => onToggleChecklist(cfg.key, idx, checked)}
                  onEditCheck={(idx, text) => onEditChecklist(cfg.key, idx, text)}
                  onToggleRequired={(idx, required) => onToggleRequired(cfg.key, idx, required)}
                  onAddCheck={(text) => onAddChecklist(cfg.key, text)}
                  onRemoveCheck={(idx) => onRemoveChecklist(cfg.key, idx)}
                />
              ))}
            </section>
          </div>
        )}

        {tab === 'history' && <HistoryTab rfqId={row.id} />}
        {tab === 'attachments' && <AttachmentsTab rfqId={row.id} myUsername={myUsername} />}

        <footer className="rfq2-drawer-foot">
          <button className="rfq2-btn rfq2-btn-danger" onClick={onDelete}>
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="rfq2-btn rfq2-btn-primary"
            onClick={onSync}
            disabled={!row.rfq_no && !row.customer}
            title="Open Pricing Worksheet with these fields prefilled"
          >
            Sync → Pricing Worksheet
          </button>
          <span className="rfq2-save-status">{saving ? 'Saving…' : 'Saved'}</span>
        </footer>
      </aside>
    </>
  );
}

function pickEditable(r) {
  return {
    rfq_no: r.rfq_no || '',
    customer: r.customer || '',
    product: r.product || '',
    eau_qty: r.eau_qty || 0,
    moq: r.moq || 0,
    quote_value: r.quote_value || 0,
    rfq_date: r.rfq_date || '',
    deadline: r.deadline || '',
    sale_owner: r.sale_owner || '',
    npi_owner: r.npi_owner || '',
    owner: r.owner || '',
    result: r.result || 'PENDING',
    reason_code: r.reason_code || '',
    remarks: r.remarks || '',
    specs: { ...defaultSpecs(), ...(r.specs || {}) },
  };
}

// T2.6 Document-flow strip — small visual chain of document handoffs.
function DocumentFlowStrip({ row }) {
  const linked = row.linked_quotes || [];
  return (
    <section className="rfq2-drawer-section rfq2-flow">
      <h4>Document Flow</h4>
      <div className="rfq2-flow-strip">
        <div className="rfq2-flow-node active" title="This RFQ">
          <span className="rfq2-flow-icon">📋</span>
          <span className="rfq2-flow-label">
            RFQ
            <br />
            <b>{row.rfq_no || '—'}</b>
          </span>
        </div>
        <div className="rfq2-flow-arrow">→</div>
        <div className={'rfq2-flow-node' + (linked.length ? ' linked' : ' empty')}>
          <span className="rfq2-flow-icon">💰</span>
          <span className="rfq2-flow-label">
            Pricing Worksheet
            <br />
            {linked.length ? (
              <b>
                {linked.length} handoff{linked.length > 1 ? 's' : ''}
              </b>
            ) : (
              <i>not synced</i>
            )}
          </span>
          {linked.length > 0 && (
            <button
              className="rfq2-flow-goto"
              onClick={() =>
                window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: 'q-hist' }))
              }
              title="Open Quote History"
            >
              Open ↗
            </button>
          )}
        </div>
        <div className="rfq2-flow-arrow">→</div>
        <div className="rfq2-flow-node empty">
          <span className="rfq2-flow-icon">📦</span>
          <span className="rfq2-flow-label">
            Sample Request
            <br />
            <i>future</i>
          </span>
        </div>
        <div className="rfq2-flow-arrow">→</div>
        <div className="rfq2-flow-node empty">
          <span className="rfq2-flow-icon">🧾</span>
          <span className="rfq2-flow-label">
            Customer Order
            <br />
            <i>future</i>
          </span>
        </div>
      </div>
    </section>
  );
}

function StageBlock({
  cfg,
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

          {/* T2.4 signature block — appears once stage is done */}
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

            {/* T1.3 Blocked reason code */}
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

function HistoryTab({ rfqId }) {
  // `entries === null` means "loading"; [] = loaded-empty; Array =
  // loaded. No in-effect reset — the parent DetailDrawer already
  // remounts on row change via `key={row.id}`, so HistoryTab mounts
  // with fresh state. If it's ever reused across rfqIds, React will
  // re-run the fetch effect below (rfqId-keyed) and the initial-null
  // value will be overwritten on the first resolved promise.
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    sharedApi
      .getRFQAudit(rfqId)
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
  }, [rfqId]);

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

// ── Attachments tab ─────────────────────────────────────────────

function AttachmentsTab({ rfqId, myUsername }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const reload = useCallback(() => {
    setList(null);
    sharedApi
      .listRFQAttachments(rfqId)
      .then((arr) => setList(Array.isArray(arr) ? arr : []))
      .catch(() => setList([]));
  }, [rfqId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const handleUpload = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      try {
        await sharedApi.uploadRFQAttachment(rfqId, file);
        showToast('Uploaded ' + file.name);
        reload();
      } catch (e) {
        showToast('Upload failed: ' + (e.message || 'Unknown error'), 'err');
      } finally {
        setBusy(false);
      }
    },
    [rfqId, reload]
  );

  const handleDelete = useCallback(
    async (attId, name) => {
      if (!confirm(`Remove attachment "${name}" from this RFQ?`)) return;
      try {
        await sharedApi.deleteRFQAttachment(rfqId, attId);
        reload();
      } catch (e) {
        showToast('Delete failed: ' + (e.message || 'Unknown error'), 'err');
      }
    },
    [rfqId, reload]
  );

  return (
    <div className="rfq2-drawer-scroll">
      <section className="rfq2-drawer-section">
        <h4>Attachments ({list?.length ?? 0})</h4>
        <div className="rfq2-attach-upload">
          <input
            ref={fileInput}
            type="file"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              e.target.value = '';
            }}
          />
          {busy && <span className="rfq2-save-status">Uploading…</span>}
          {myUsername && <span className="rfq2-save-status">Uploading as {myUsername}</span>}
        </div>
        {list === null ? (
          <div style={{ color: '#94a3b8' }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 12 }}>No attachments yet.</div>
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
                      href={sharedApi.rfqAttachmentUrl(rfqId, a.id)}
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
