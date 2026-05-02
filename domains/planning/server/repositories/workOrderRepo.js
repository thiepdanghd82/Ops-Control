/**
 * Work Order repository — Sprint MES-1.3.
 *
 * Raw SQL prepared statements over a better-sqlite3 instance. NO business
 * logic (no state-machine guards, no audit, no codegen) — those live in
 * workOrderService.js. Factory takes the `db` instance so tests can pass
 * an in-memory SQLite without touching connection.js's singleton.
 *
 * `HEADER_PATCHABLE_FIELDS` is exported so the service can derive a
 * `forbidden_fields` list without duplicating the column whitelist.
 */

export const HEADER_PATCHABLE_FIELDS = Object.freeze([
  'customer',
  'qty_planned',
  'due_date',
  'priority',
  'sales_order_id',
  'rfq_no',
]);

const LIST_COLUMNS = `
  id, code, status, ccl_pn, customer,
  qty_planned, qty_completed, due_date, priority,
  (SELECT COUNT(*) FROM work_order_op WHERE work_order_id = work_order.id) AS operations_count
`;

function buildWhere(filters) {
  const clauses = [];
  const params = [];
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.q) {
    const pat = `%${filters.q}%`;
    clauses.push('(code LIKE ? OR ccl_pn LIKE ? OR customer LIKE ?)');
    params.push(pat, pat, pat);
  }
  if (filters.from) {
    clauses.push('due_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('due_date <= ?');
    params.push(filters.to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function createWorkOrderRepo(db) {
  function findById(id) {
    return db.prepare('SELECT * FROM work_order WHERE id = ?').get(id) || null;
  }

  function existsByCode(code) {
    return !!db.prepare('SELECT 1 FROM work_order WHERE code = ?').get(code);
  }

  function insert(input) {
    const r = db
      .prepare(
        `INSERT INTO work_order
          (code, sales_order_id, rfq_no, ccl_pn, customer, qty_planned, uom,
           priority, due_date, status, raw_json, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.code,
        input.sales_order_id ?? null,
        input.rfq_no ?? null,
        input.ccl_pn,
        input.customer,
        input.qty_planned,
        input.uom,
        input.priority ?? 5,
        input.due_date,
        input.status,
        input.raw_json,
        input.created_by
      );
    return findById(r.lastInsertRowid);
  }

  function list({ status, q, from, to, limit = 50, offset = 0 } = {}) {
    const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
    const off = Math.max(0, Number(offset) || 0);
    const { where, params } = buildWhere({ status, q, from, to });
    const items = db
      .prepare(
        `SELECT ${LIST_COLUMNS} FROM work_order
         ${where}
         ORDER BY status ASC, due_date ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, lim, off);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM work_order ${where}`).get(...params).n;
    return { items, total, limit: lim, offset: off };
  }

  function updateHeader(id, partial, updated_by) {
    const cols = Object.keys(partial).filter((k) => HEADER_PATCHABLE_FIELDS.includes(k));
    if (cols.length === 0) return findById(id);
    const sets = cols
      .map((c) => `${c} = ?`)
      .concat(['updated_at = CURRENT_TIMESTAMP', 'updated_by = ?']);
    const params = cols.map((c) => partial[c]).concat([updated_by, id]);
    db.prepare(`UPDATE work_order SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return findById(id);
  }

  function updateStatus(id, newStatus, ts) {
    const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [newStatus];
    if (newStatus === 'RELEASED') {
      sets.push('released_at = ?');
      params.push(ts);
    }
    if (newStatus === 'CLOSED' || newStatus === 'CANCELLED') {
      sets.push('closed_at = ?');
      params.push(ts);
    }
    params.push(id);
    db.prepare(`UPDATE work_order SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return findById(id);
  }

  function addOperation(input) {
    const r = db
      .prepare(
        `INSERT INTO work_order_op
          (work_order_id, seq, op_type, work_centre_no, status,
           planned_start, planned_end, setup_minutes_plan, run_minutes_plan, notes, raw_json)
         VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.work_order_id,
        input.seq,
        input.op_type,
        input.work_centre_no,
        input.planned_start ?? null,
        input.planned_end ?? null,
        input.setup_minutes_plan ?? null,
        input.run_minutes_plan ?? null,
        input.notes ?? null,
        input.raw_json
      );
    return db.prepare('SELECT * FROM work_order_op WHERE id = ?').get(r.lastInsertRowid);
  }

  function findOpsByWorkOrder(work_order_id) {
    return db
      .prepare('SELECT * FROM work_order_op WHERE work_order_id = ? ORDER BY seq ASC')
      .all(work_order_id);
  }

  function countOps(work_order_id) {
    return db
      .prepare('SELECT COUNT(*) AS n FROM work_order_op WHERE work_order_id = ?')
      .get(work_order_id).n;
  }

  function maxSeq(work_order_id) {
    const row = db
      .prepare('SELECT MAX(seq) AS m FROM work_order_op WHERE work_order_id = ?')
      .get(work_order_id);
    return row?.m ?? 0;
  }

  // ── MES-2.4 op-status mutators (additive). Service layer
  //    (operationService.js) is the only caller; routes go through the
  //    service so no atomicity / state-machine invariant can be skipped.

  // JOIN work_order so the service can do barcode comparisons (scan()
  // matches against wo.code per MES-2.4 decision) without a second
  // round-trip per scan.
  function findOpById(opId) {
    return (
      db
        .prepare(
          `SELECT op.*, wo.code AS wo_code
           FROM work_order_op op
           LEFT JOIN work_order wo ON wo.id = op.work_order_id
           WHERE op.id = ?`
        )
        .get(opId) || null
    );
  }

  // `deltas` is whatever the service's mutator returned — a plain object
  // of column→value writes. last_pulse_at is forced on every call (kiosk
  // online indicator depends on it). Status is always written.
  const OP_STATUS_DELTA_COLUMNS = Object.freeze([
    'started_at',
    'paused_at',
    'paused_reason_code',
    'completed_at',
    'accepted_at',
    'good_count',
    'scrap_count',
  ]);
  function updateOpStatus(opId, newStatus, deltas, pulseAt) {
    const sets = ['status = ?'];
    const params = [newStatus];
    for (const col of OP_STATUS_DELTA_COLUMNS) {
      if (Object.prototype.hasOwnProperty.call(deltas || {}, col)) {
        sets.push(`${col} = ?`);
        params.push(deltas[col]);
      }
    }
    sets.push('last_pulse_at = ?');
    params.push(pulseAt);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(opId);
    db.prepare(`UPDATE work_order_op SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return findOpById(opId);
  }

  function insertOpEvent(row) {
    const r = db
      .prepare(
        `INSERT INTO op_status_event
           (op_id, from_status, to_status, actor_user_id, kiosk_session_jti,
            idempotency_key, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.op_id,
        row.from_status,
        row.to_status,
        row.actor_user_id ?? null,
        row.kiosk_session_jti ?? null,
        row.idempotency_key ?? null,
        row.payload_json ?? null
      );
    return Number(r.lastInsertRowid);
  }

  function findReasonCode(code) {
    return db.prepare(`SELECT * FROM reason_code WHERE code = ? AND active = 1`).get(code) || null;
  }

  return {
    insert,
    findById,
    existsByCode,
    list,
    updateHeader,
    updateStatus,
    addOperation,
    findOpsByWorkOrder,
    countOps,
    maxSeq,
    // MES-2.4 (additive — no existing exports renamed or removed)
    findOpById,
    updateOpStatus,
    insertOpEvent,
    findReasonCode,
  };
}
