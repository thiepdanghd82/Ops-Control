/**
 * Planning domain i18n (v1.3 M3).
 *
 * SAP-PP analogue. Tab titles for the Planning module's 6 sub-tabs.
 * Body content (form labels, table headers) lives in each tab's local
 * .jsx for now — migrate to this file when the tabs are touched.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  'planning.work_orders':       { en: 'Work Orders',       vi: 'Lệnh sản xuất' },
  'planning.order_entry':       { en: 'Order Entry',       vi: 'Nhập đơn hàng' },
  'planning.material_check':    { en: 'Material Check',    vi: 'Kiểm tra vật tư' },
  'planning.bom_explosion':     { en: 'BOM Explosion',     vi: 'Phân rã BOM' },
  'planning.capacity_planning': { en: 'Capacity Planning', vi: 'Hoạch định công suất' },
  'planning.wip_tracker':       { en: 'WIP Tracker',       vi: 'Theo dõi WIP' },
});
