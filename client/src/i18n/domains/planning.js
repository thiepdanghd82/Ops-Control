/**
 * Planning domain i18n (v1.3 M3).
 *
 * SAP-PP analogue. Tab titles for the Planning module's 6 sub-tabs.
 * Body content (form labels, table headers) lives in each tab's local
 * .jsx for now — migrate to this file when the tabs are touched.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  'planning.work_orders': { en: 'Work Orders', vi: 'Lệnh sản xuất' },
  'planning.order_entry': { en: 'Order Entry', vi: 'Nhập đơn hàng' },
  'planning.material_check': { en: 'Material Check', vi: 'Kiểm tra vật tư' },
  'planning.bom_explosion': { en: 'BOM Explosion', vi: 'Phân rã BOM' },
  'planning.capacity_planning': { en: 'Capacity Planning', vi: 'Hoạch định công suất' },
  'planning.wip_tracker': { en: 'WIP Tracker', vi: 'Theo dõi WIP' },

  // Sprint MES-1.5 — Work Order v2 list + detail UI.
  'planning.workOrder.title': { en: 'Work Orders', vi: 'Lệnh sản xuất' },
  'planning.workOrder.empty': { en: 'No work orders yet', vi: 'Chưa có lệnh sản xuất nào' },
  'planning.workOrder.create_cta': { en: 'Create work order', vi: 'Tạo lệnh sản xuất' },
  'planning.workOrder.col.code': { en: 'Code', vi: 'Mã LSX' },
  'planning.workOrder.col.customer': { en: 'Customer', vi: 'Khách hàng' },
  'planning.workOrder.col.ccl_pn': { en: 'CCL P/N', vi: 'Mã hàng CCL' },
  'planning.workOrder.col.qty_planned': { en: 'Qty planned', vi: 'SL kế hoạch' },
  'planning.workOrder.col.due_date': { en: 'Due date', vi: 'Ngày giao' },
  'planning.workOrder.col.status': { en: 'Status', vi: 'Trạng thái' },
  'planning.workOrder.col.ops_count': { en: 'Ops', vi: 'CĐ' },
  'planning.workOrder.filter.status': { en: 'Status', vi: 'Trạng thái' },
  'planning.workOrder.filter.q': {
    en: 'Search code / customer / part',
    vi: 'Tìm mã / khách hàng / part',
  },
  'planning.workOrder.filter.from': { en: 'Due from', vi: 'Hạn từ' },
  'planning.workOrder.filter.to': { en: 'Due to', vi: 'Hạn đến' },
  'planning.workOrder.filter.all_statuses': { en: 'All statuses', vi: 'Tất cả trạng thái' },
  'planning.workOrder.pagination.showing': {
    en: 'Showing {from}–{to} of {total}',
    vi: 'Hiển thị {from}–{to} / {total}',
  },
  'planning.workOrder.pagination.prev': { en: 'Previous', vi: 'Trước' },
  'planning.workOrder.pagination.next': { en: 'Next', vi: 'Tiếp' },
  'planning.workOrder.pagination.page_size': { en: 'Per page', vi: 'Mỗi trang' },
  'planning.workOrder.detail.back_to_list': { en: '← Back to list', vi: '← Quay lại danh sách' },
  'planning.workOrder.detail.created_by': { en: 'Created by', vi: 'Người tạo' },
  'planning.workOrder.detail.created_at': { en: 'Created at', vi: 'Tạo lúc' },
  'planning.workOrder.detail.released_at': { en: 'Released at', vi: 'Phát lệnh lúc' },
  'planning.workOrder.detail.closed_at': { en: 'Closed at', vi: 'Đóng lúc' },
  'planning.workOrder.detail.operations': { en: 'Operations', vi: 'Công đoạn' },
  'planning.workOrder.detail.not_found': {
    en: 'Work order not found',
    vi: 'Không tìm thấy lệnh sản xuất',
  },
  'planning.workOrder.ops.col.seq': { en: 'Seq', vi: 'Thứ tự' },
  'planning.workOrder.ops.col.op_type': { en: 'Op type', vi: 'Loại CĐ' },
  'planning.workOrder.ops.col.work_centre_no': { en: 'Work centre', vi: 'Trung tâm SX' },
  'planning.workOrder.ops.col.status': { en: 'Status', vi: 'Trạng thái' },
  'planning.workOrder.ops.col.planned_start': { en: 'Planned start', vi: 'Bắt đầu KH' },
  'planning.workOrder.error.load_failed': {
    en: 'Failed to load work orders',
    vi: 'Không thể tải lệnh sản xuất',
  },
  'planning.workOrder.error.detail_failed': {
    en: 'Failed to load work order',
    vi: 'Không thể tải chi tiết',
  },
  'planning.workOrder.status.CREATED': { en: 'Created', vi: 'Đã tạo' },
  'planning.workOrder.status.RELEASED': { en: 'Released', vi: 'Đã phát lệnh' },
  'planning.workOrder.status.SCHEDULED': { en: 'Scheduled', vi: 'Đã lên lịch' },
  'planning.workOrder.status.IN_PROGRESS': { en: 'In progress', vi: 'Đang chạy' },
  'planning.workOrder.status.ON_HOLD': { en: 'On hold', vi: 'Tạm dừng' },
  'planning.workOrder.status.COMPLETED': { en: 'Completed', vi: 'Hoàn thành' },
  'planning.workOrder.status.QC_RELEASED': { en: 'QC released', vi: 'QC duyệt' },
  'planning.workOrder.status.CLOSED': { en: 'Closed', vi: 'Đã đóng' },
  'planning.workOrder.status.CANCELLED': { en: 'Cancelled', vi: 'Đã huỷ' },

  // Sprint MES-1.6 — release / cancel modals + audit timeline.
  'planning.workOrder.action.cancel': { en: 'Cancel', vi: 'Huỷ' },
  'planning.workOrder.action.pending': { en: 'Working…', vi: 'Đang xử lý…' },
  'planning.workOrder.release.title': {
    en: 'Release work order {code}',
    vi: 'Phát lệnh sản xuất {code}',
  },
  'planning.workOrder.release.subtitle': {
    en: '{ops_count} operation(s) attached',
    vi: '{ops_count} công đoạn đã gắn',
  },
  'planning.workOrder.release.confirm_text': {
    en: 'This will hand the work order over to the shop floor.',
    vi: 'Lệnh sẽ được chuyển xuống xưởng để sản xuất.',
  },
  'planning.workOrder.release.notes_label': {
    en: 'Notes (optional)',
    vi: 'Ghi chú (không bắt buộc)',
  },
  'planning.workOrder.release.notes_placeholder': {
    en: 'Anything the shop floor should know…',
    vi: 'Thông tin cần lưu ý cho xưởng…',
  },
  'planning.workOrder.release.submit': { en: 'Release', vi: 'Phát lệnh' },
  'planning.workOrder.release.needs_ops': {
    en: 'Add at least one operation before releasing',
    vi: 'Cần ≥1 công đoạn trước khi phát lệnh',
  },
  'planning.workOrder.cancel.title': {
    en: 'Cancel work order {code}',
    vi: 'Huỷ lệnh sản xuất {code}',
  },
  'planning.workOrder.cancel.warning': {
    en: 'This action cannot be undone. The work order moves to CANCELLED and cannot be re-released.',
    vi: 'Hành động này không thể hoàn tác. Lệnh sẽ chuyển sang trạng thái CANCELLED và không thể phát lại.',
  },
  'planning.workOrder.cancel.reason_label': { en: 'Reason', vi: 'Lý do' },
  'planning.workOrder.cancel.reason_placeholder': {
    en: 'Customer pulled order, material short, …',
    vi: 'Khách rút đơn, thiếu vật tư, …',
  },
  'planning.workOrder.cancel.keep': { en: 'Keep work order', vi: 'Giữ lại' },
  'planning.workOrder.cancel.submit': { en: 'Cancel work order', vi: 'Huỷ lệnh' },
  'planning.workOrder.error.allowed_from': { en: 'Allowed from', vi: 'Cho phép từ' },
  'planning.workOrder.audit.heading': { en: 'Audit trail', vi: 'Lịch sử thao tác' },
  'planning.workOrder.audit.loading': { en: 'Loading audit trail…', vi: 'Đang tải lịch sử…' },
  'planning.workOrder.audit.empty': { en: 'No history yet', vi: 'Chưa có lịch sử' },
  'planning.workOrder.audit.load_failed': {
    en: 'Failed to load audit trail',
    vi: 'Không thể tải lịch sử',
  },
  'planning.workOrder.audit.show_detail': { en: 'Show detail', vi: 'Xem chi tiết' },
  'planning.workOrder.audit.event.WO_CREATE': { en: 'Created', vi: 'Tạo lệnh' },
  'planning.workOrder.audit.event.WO_UPDATE': { en: 'Header updated', vi: 'Cập nhật header' },
  'planning.workOrder.audit.event.WO_RELEASE': { en: 'Released', vi: 'Phát lệnh' },
  'planning.workOrder.audit.event.WO_CANCEL': { en: 'Cancelled', vi: 'Huỷ lệnh' },
  'planning.workOrder.audit.event.WO_OP_ADD': { en: 'Operation added', vi: 'Thêm công đoạn' },

  // Sprint MES-1.7 — create + add-operation modals.
  'planning.workOrder.create.title': { en: 'Create work order', vi: 'Tạo lệnh sản xuất' },
  'planning.workOrder.create.submit': { en: 'Create', vi: 'Tạo' },
  'planning.workOrder.create.uom': { en: 'Unit of measure', vi: 'Đơn vị tính' },
  'planning.workOrder.create.priority': { en: 'Priority (1–9)', vi: 'Ưu tiên (1–9)' },
  'planning.workOrder.create.code_optional': {
    en: 'Code (optional, auto-generated)',
    vi: 'Mã LSX (không bắt buộc, server tự sinh)',
  },
  'planning.workOrder.create.code_placeholder': {
    en: 'Leave blank for WO-YYYY-MM-NNNNN',
    vi: 'Để trống để tự sinh WO-YYYY-MM-NNNNN',
  },
  'planning.workOrder.create.rfq_no': { en: 'RFQ # (optional)', vi: 'Mã RFQ (không bắt buộc)' },
  'planning.workOrder.create.error.required': { en: 'Required', vi: 'Bắt buộc' },
  'planning.workOrder.create.error.too_long': { en: 'Too long', vi: 'Quá dài' },
  'planning.workOrder.create.error.positive_number': { en: 'Must be > 0', vi: 'Phải > 0' },
  'planning.workOrder.create.error.past': {
    en: 'Cannot be in the past',
    vi: 'Không được trong quá khứ',
  },
  'planning.workOrder.create.error.range_1_9': { en: 'Must be 1–9', vi: 'Phải từ 1 đến 9' },
  'planning.workOrder.create.error.invalid': { en: 'Invalid', vi: 'Không hợp lệ' },
  'planning.workOrder.addOp.title': {
    en: 'Add operation to {code}',
    vi: 'Thêm công đoạn vào {code}',
  },
  'planning.workOrder.addOp.suggested_seq': {
    en: 'Sequence: {seq} (auto)',
    vi: 'Thứ tự: {seq} (tự động)',
  },
  'planning.workOrder.addOp.submit': { en: 'Add operation', vi: 'Thêm công đoạn' },
  'planning.workOrder.addOp.planned_end': { en: 'Planned end', vi: 'Kết thúc KH' },
  'planning.workOrder.addOp.setup_minutes': { en: 'Setup minutes', vi: 'Phút setup' },
  'planning.workOrder.addOp.run_minutes': { en: 'Run minutes', vi: 'Phút chạy' },
  'planning.workOrder.addOp.notes': { en: 'Notes (optional)', vi: 'Ghi chú (không bắt buộc)' },
  'planning.workOrder.addOp.error.required': { en: 'Required', vi: 'Bắt buộc' },
  'planning.workOrder.addOp.error.too_long': { en: 'Too long', vi: 'Quá dài' },
  'planning.workOrder.addOp.error.end_before_start': {
    en: 'End must be after start',
    vi: 'Kết thúc phải sau bắt đầu',
  },
  'planning.workOrder.addOp.error.non_negative': { en: 'Must be ≥ 0', vi: 'Phải ≥ 0' },
  'planning.workOrder.addOp.error.invalid': { en: 'Invalid', vi: 'Không hợp lệ' },
  'planning.workOrder.addOp.error.enum': { en: 'Pick a valid type', vi: 'Chọn loại hợp lệ' },
});
