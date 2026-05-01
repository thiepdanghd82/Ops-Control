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
});
