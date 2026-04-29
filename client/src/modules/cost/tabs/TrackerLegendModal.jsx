/**
 * TrackerLegendModal — bilingual (EN/VN) legend modal shared between
 * RFQ Tracker and Sample Tracking.
 *
 * Usage:
 *   <TrackerLegendModal kind="rfq"    onClose={...} />
 *   <TrackerLegendModal kind="sample" onClose={...} />
 *
 * Content is baked into this file (not content.js) because it closely
 * tracks the tab's data shape — the sections/formulas here mirror
 * exactly what the UI renders on cards and drawer fields. Migrated to
 * the shared Modal primitive in the 2026-04-24 modal-design refresh.
 */
import Modal from '../../../components/Shared/Modal';

export default function TrackerLegendModal({ kind, onClose }) {
  const content = kind === 'sample' ? SAMPLE_LEGEND : RFQ_LEGEND;

  return (
    <Modal open onClose={onClose} size="lg" severity="info" ariaLabelledBy="tracker-legend-title">
      <Modal.Header
        id="tracker-legend-title"
        title={content.title}
        subtitle="Bilingual reference — EN / VN"
        severity="info"
      />
      <Modal.Body>
        <div className="cl-legend-body">
          {content.sections.map((s, i) => (
            <Section key={i} titleEn={s.en} titleVi={s.vi}>{s.body}</Section>
          ))}
          <div className="cl-legend-footer">
            <Bi en={content.footerEn} vi={content.footerVi} />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-primary" onClick={onClose}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function Section({ titleEn, titleVi, children }) {
  return (
    <div className="cl-legend-section">
      <div className="cl-legend-sec-title">
        <span className="cl-legend-en">{titleEn}</span>
        <span className="cl-legend-vi">{titleVi}</span>
      </div>
      <div className="cl-legend-sec-body">{children}</div>
    </div>
  );
}

function Bi({ en, vi }) {
  return (
    <div className="cl-legend-bi">
      <div className="cl-legend-bi-en">{en}</div>
      <div className="cl-legend-bi-vi">{vi}</div>
    </div>
  );
}

function Formula({ children }) {
  return <div className="cl-legend-formula">{children}</div>;
}

function CodeTable({ title, rows }) {
  return (
    <div className="cl-legend-codes">
      <div className="cl-legend-codes-title">{title}</div>
      <table>
        <tbody>
          {rows.map(([code, labelEn, labelVi]) => (
            <tr key={code}>
              <td className="cl-legend-code">{code}</td>
              <td className="cl-legend-bi-en">{labelEn}</td>
              <td className="cl-legend-bi-vi">{labelVi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── RFQ Tracker legend content ─────────────────────────────────

const RFQ_LEGEND = {
  title: 'RFQ Tracker — Field Legend / Chú giải trường',
  sections: [
    {
      en: '1. Purpose', vi: '1. Mục đích',
      body: (
        <Bi
          en="End-to-end pipeline for every customer RFQ. 5 stages (Sale → Feasibility → Design → Sourcing → Pricing) each with owner, SLA, checklist, and sign-off. Single source of truth for 'where is this RFQ now'."
          vi="Pipeline đầu-cuối cho mọi RFQ khách. 5 giai đoạn (Sale → Khả thi → Thiết kế → Sourcing → Báo giá) mỗi giai đoạn có owner, SLA, checklist, ký duyệt. Nguồn sự thật duy nhất cho 'RFQ đang ở đâu'."
        />
      ),
    },
    {
      en: '2. The 5 pipeline stages', vi: '2. 5 giai đoạn pipeline',
      body: <>
        <Bi en="Sale (Input) — Sales receives RFQ, captures design file, specs, EAU, deadline. SLA 1d." vi="Sale (Nhập) — Sale nhận RFQ, file thiết kế, specs, EAU, deadline. SLA 1 ngày." />
        <Bi en="Feasibility (NPI Quote Specialist) — reviews feasibility, classifies print type, approves for costing. SLA 1d." vi="Khả thi (NPI Quote Specialist) — đánh giá khả thi, phân loại in, duyệt để tính giá. SLA 1 ngày." />
        <Bi en="Design (NPI Design Process) — imposition, dieline, wastage. SLA 2d." vi="Thiết kế (NPI Design) — bình đồ, dieline, hao hụt. SLA 2 ngày." />
        <Bi en="Sourcing (Materials) — quotes paper / ink / foil / die from suppliers. SLA 3d." vi="Sourcing (Vật tư) — hỏi giá giấy / mực / nhũ / dao từ NCC. SLA 3 ngày." />
        <Bi en="Pricing (Final) — labor + depreciation + margin → final quotation + Sync to Pricing Worksheet. SLA 1d." vi="Báo giá (Cuối) — nhân công + khấu hao + margin → báo giá cuối + Sync sang Pricing Worksheet. SLA 1 ngày." />
      </>,
    },
    {
      en: '3. Stage status', vi: '3. Trạng thái giai đoạn',
      body: <>
        <Bi en="pending — not yet started" vi="pending — chưa bắt đầu" />
        <Bi en="active — in progress" vi="active — đang làm" />
        <Bi en="done — completed + signed by owner (immutable until Reopen)" vi="done — hoàn thành + owner ký (bất biến cho tới khi Reopen)" />
        <Bi en="blocked — waiting on external input (attach a reason code R01-R99)" vi="blocked — chờ input ngoài (gắn reason code R01-R99)" />
      </>,
    },
    {
      en: '4. Required-field gates (blocks Next button)', vi: '4. Khoá theo trường bắt buộc (chặn nút Next)',
      body: <>
        <Bi en="Each stage lists required identity fields + required checklist items. Next → stays disabled until ALL are satisfied (tooltip shows which)." vi="Mỗi stage liệt kê trường bắt buộc + checklist 'req'. Nút Next → bị disable đến khi đủ TẤT CẢ (tooltip chỉ thiếu gì)." />
        <Bi en="Example — Sale stage: customer, rfq_no, eau_qty, deadline + 4 checklist items marked 'req' (design file, size, EAU/MOQ, deadline agreed)." vi="Ví dụ — Sale: customer, rfq_no, eau_qty, deadline + 4 item 'req' (file thiết kế, kích thước, EAU/MOQ, deadline xác nhận)." />
      </>,
    },
    {
      en: '5. Result enum', vi: '5. Enum kết quả',
      body: <>
        <Bi en="PENDING (default) — no decision yet" vi="PENDING (mặc định) — chưa có kết quả" />
        <Bi en="WIN — customer accepted → quote becomes PO" vi="WIN — khách chấp nhận → báo giá → PO" />
        <Bi en="LOSS — customer rejected → requires reason code (L01-L99)" vi="LOSS — khách từ chối → yêu cầu reason code (L01-L99)" />
        <Bi en="NEGOTIATING — active back-and-forth with customer" vi="NEGOTIATING — đang đàm phán qua lại với khách" />
      </>,
    },
    {
      en: '6. Reason codes', vi: '6. Reason codes',
      body: <>
        <CodeTable title="Blocked reasons (R01-R99)" rows={[
          ['R01', 'Tolerance not achievable', 'Không đạt dung sai'],
          ['R02', 'Material unavailable', 'Vật liệu không có sẵn'],
          ['R03', 'Awaiting customer input', 'Chờ khách phản hồi'],
          ['R04', 'Awaiting supplier quote', 'Chờ NCC báo giá'],
          ['R05', 'Design file defective', 'File thiết kế lỗi'],
          ['R06', 'Capacity conflict', 'Xung đột công suất'],
          ['R99', 'Other (see notes)', 'Khác (xem notes)'],
        ]} />
        <CodeTable title="LOSS reasons (L01-L99)" rows={[
          ['L01', 'Price too high', 'Giá quá cao'],
          ['L02', 'Lead time too long', 'Thời gian giao quá dài'],
          ['L03', 'Technology / capability gap', 'Không đủ công nghệ'],
          ['L04', 'Quality concern', 'Lo ngại chất lượng'],
          ['L05', 'Customer cancelled project', 'Khách huỷ dự án'],
          ['L06', 'Relationship / commercial terms', 'Quan hệ / điều khoản'],
          ['L99', 'Other', 'Khác'],
        ]} />
        <CodeTable title="WIN reasons (W01-W99)" rows={[
          ['W01', 'Best price', 'Giá tốt nhất'],
          ['W02', 'Best lead time', 'Lead time tốt nhất'],
          ['W03', 'Best technology match', 'Công nghệ phù hợp'],
          ['W04', 'Existing-customer loyalty', 'Khách trung thành'],
          ['W05', 'Sole qualified supplier', 'NCC duy nhất đủ tiêu chuẩn'],
          ['W99', 'Other', 'Khác'],
        ]} />
      </>,
    },
    {
      en: '7. KPI formulas', vi: '7. Công thức KPI',
      body: <>
        <Formula>
          <span><b>Win Rate %</b> = wins / (wins + losses) × 100</span>
          <span>// PENDING + NEGOTIATING excluded (only closed RFQs count)</span>
        </Formula>
        <Formula>
          <span><b>SLA Breach</b> = deadline &lt; today  OR  any stage.status = blocked</span>
          <span>// Closed RFQs (WIN/LOSS) never count as breach</span>
        </Formula>
        <Formula>
          <span><b>Stage Progress %</b> = checked_count / total_count × 100</span>
          <span>// drives the progress bar on each Kanban card</span>
        </Formula>
        <Formula>
          <span><b>Days in Stage</b> = today − stage.start (if start set)</span>
          <span>// goes red on the card when &gt; stage.sla_days</span>
        </Formula>
      </>,
    },
    {
      en: '8. Signatures + Reopen', vi: '8. Chữ ký + Reopen',
      body: <>
        <Bi en="Marking a stage done auto-stamps owner + ISO timestamp. Fieldset becomes read-only (grey bg)." vi="Chuyển stage sang done tự đóng dấu owner + timestamp. Fieldset thành read-only (nền xám)." />
        <Bi en="⟲ Reopen wipes signature + returns stage to active + logs 'stage_reopened' to audit. Use when a stage needs to be re-worked." vi="⟲ Reopen xoá chữ ký + trả stage về active + log 'stage_reopened' vào audit. Dùng khi cần làm lại stage." />
      </>,
    },
    {
      en: '9. Document Flow', vi: '9. Luồng tài liệu',
      body: <Bi
        en="RFQ → Pricing Worksheet → (future: Sample Request, Customer Order). Click Sync → Pricing Worksheet to prefill Standard Calc from the RFQ identity fields."
        vi="RFQ → Pricing Worksheet → (tương lai: Yêu cầu mẫu, PO khách). Click Sync → Pricing Worksheet để prefill Standard Calc từ các trường identity của RFQ."
      />,
    },
  ],
  footerEn: 'Tip: open the History tab in the detail drawer to see every field change, stage transition, and checklist tick logged with user + timestamp.',
  footerVi: 'Gợi ý: mở tab History trong drawer chi tiết để xem mọi thay đổi field, chuyển stage, tick checklist — đều log user + timestamp.',
};

// ── Sample Tracking legend content ─────────────────────────────

const SAMPLE_LEGEND = {
  title: 'Sample Tracking — Field Legend / Chú giải trường',
  sections: [
    {
      en: '1. Purpose', vi: '1. Mục đích',
      body: <Bi
        en="End-to-end pipeline for every customer sample request. 6 stages (Request → Prep → Run → QC → Customer → Spec Released) each with owner, SLA, checklist, sign-off."
        vi="Pipeline đầu-cuối cho mọi yêu cầu mẫu. 6 giai đoạn (Yêu cầu → Chuẩn bị → Chạy → QC → Phản hồi khách → Phát SPEC) mỗi giai đoạn có owner, SLA, checklist, ký duyệt."
      />,
    },
    {
      en: '2. The 6 pipeline stages', vi: '2. 6 giai đoạn pipeline',
      body: <>
        <Bi en="Request (Intake) — CS receives request, captures identity (customer, IFS, part#, qty, due date). SLA 1d." vi="Request (Nhận yêu cầu) — CS nhận request, điền identity (customer, IFS, part#, số lượng, deadline). SLA 1 ngày." />
        <Bi en="Prep — 3 PARALLEL sub-tracks: Material, Film/Plate, Cutter. Each independent; all 3 must be Done before Run. SLA 3d." vi="Prep — 3 sub-track SONG SONG: Vật liệu, Film/Plate, Dao. Độc lập; cả 3 phải Done mới qua Run. SLA 3 ngày." />
        <Bi en="Run (Sample Production) — YCM request, machine alloc, run start/finish, handover to QC. SLA 2d." vi="Run (Sản xuất mẫu) — YCM request, cấp máy, chạy bắt đầu/kết thúc, giao QC. SLA 2 ngày." />
        <Bi en="QC — visual + dimensional + (optional) functional. Attach QC report. SLA 1d." vi="QC — visual + dimensional + (tuỳ chọn) functional. Đính kèm QC report. SLA 1 ngày." />
        <Bi en="Customer Feedback — ship sample, log OK/NG + reason code. SLA 5d." vi="Phản hồi khách — giao mẫu, log OK/NG + reason code. SLA 5 ngày." />
        <Bi en="Spec Released — final SPEC document + production order triggered. SLA 1d." vi="Phát SPEC — SPEC cuối + kích hoạt production order. SLA 1 ngày." />
      </>,
    },
    {
      en: '3. Parallel Prep sub-tracks', vi: '3. 3 sub-track Prep song song',
      body: <>
        <Bi en="Material — substrate procurement (ETA + status)" vi="Vật liệu — mua giấy/film (ETA + status)" />
        <Bi en="Film / Plate — printing plate prep (Name + ETA + status)" vi="Film / Plate — chuẩn bị bản in (Tên + ETA + status)" />
        <Bi en="Cutter — magnetic die prep (Name + ETA + status)" vi="Dao — chuẩn bị magnetic die (Tên + ETA + status)" />
        <Bi en="Each sub-track's status is pending / active / done / blocked. Display shows coloured left border + status pill." vi="Status mỗi sub-track: pending / active / done / blocked. Hiển thị viền trái màu + pill trạng thái." />
      </>,
    },
    {
      en: '4. Result enum', vi: '4. Enum kết quả',
      body: <>
        <Bi en="PENDING — no decision from customer yet" vi="PENDING — khách chưa phản hồi" />
        <Bi en="OK — customer accepted → spec can be released" vi="OK — khách chấp nhận → có thể phát SPEC" />
        <Bi en="NG — customer rejected → must have a reason code (N01-N99) and rework plan" vi="NG — khách từ chối → phải có reason code (N01-N99) và kế hoạch làm lại" />
        <Bi en="PARTIAL — mixed batch: ok_count vs ng_count both > 0" vi="PARTIAL — batch hỗn hợp: ok_count và ng_count cùng > 0" />
      </>,
    },
    {
      en: '5. Reason codes', vi: '5. Reason codes',
      body: <>
        <CodeTable title="NG reasons (N01-N99)" rows={[
          ['N01', 'Colour mismatch', 'Sai màu'],
          ['N02', 'Dimension out of spec', 'Kích thước sai spec'],
          ['N03', 'Ink adhesion failure', 'Mực không bám'],
          ['N04', 'Die-cut defect', 'Lỗi cắt die'],
          ['N05', 'Substrate defect', 'Lỗi vật liệu'],
          ['N06', 'Artwork error', 'Lỗi thiết kế'],
          ['N07', 'Registration / alignment', 'Lệch chồng'],
          ['N99', 'Other (see notes)', 'Khác (xem notes)'],
        ]} />
        <CodeTable title="Accept reasons (A01-A02)" rows={[
          ['A01', 'Accepted as is', 'Chấp nhận như hiện trạng'],
          ['A02', 'Accepted with minor notes', 'Chấp nhận với vài ghi chú'],
        ]} />
        <CodeTable title="Blocked reasons (R01-R99)" rows={[
          ['R01', 'Material not available', 'Vật liệu chưa có'],
          ['R02', 'Film / plate defective', 'Film/plate lỗi'],
          ['R03', 'Cutter unavailable', 'Chưa có dao'],
          ['R04', 'Machine conflict', 'Xung đột máy'],
          ['R05', 'Awaiting customer input', 'Chờ khách phản hồi'],
          ['R06', 'Design file defective', 'File thiết kế lỗi'],
          ['R99', 'Other', 'Khác'],
        ]} />
      </>,
    },
    {
      en: '6. KPI formulas', vi: '6. Công thức KPI',
      body: <>
        <Formula>
          <span><b>OK Rate %</b> = OK / (OK + NG + PARTIAL) × 100</span>
          <span>// PENDING excluded (only judged samples count)</span>
        </Formula>
        <Formula>
          <span><b>Finished Rate %</b> = (total − pending) / total × 100</span>
          <span>// how much of the backlog has ANY result</span>
        </Formula>
        <Formula>
          <span><b>SLA Breach</b> = due_date &lt; today  OR  any stage.status = blocked</span>
          <span>// OK/NG samples never count as breach</span>
        </Formula>
      </>,
    },
    {
      en: '7. Per-NPI-Owner summary (strip under KPI bar)', vi: '7. Tổng kết theo NPI-Owner (dải dưới KPI)',
      body: <>
        <Bi en="Top 5 NPI owners by parts count. Columns: Owner · Parts · Finished · OK · NG · OK Rate · Spec Released." vi="Top 5 NPI owner theo số part. Cột: Owner · Parts · Finished · OK · NG · OK Rate · Spec Released." />
        <Bi en="Mirrors the master summary layout used in the plant xlsx — senior managers see their top performers at a glance." vi="Giống layout master summary trong xlsx xưởng — trưởng bộ phận thấy top performer trong 1 cái nhìn." />
      </>,
    },
    {
      en: '8. Document Flow', vi: '8. Luồng tài liệu',
      body: <Bi
        en="RFQ (upstream) → Sample → Production Order (downstream) → Spec Released. Fill Linked RFQ + Linked Production Order fields in Identity to light up the flow strip."
        vi="RFQ (trước) → Mẫu → Production Order (sau) → Phát SPEC. Điền Linked RFQ + Linked Production Order trong Identity để strip sáng lên."
      />,
    },
  ],
  footerEn: 'Tip: Attach every customer-feedback email in the Attachments tab — the full thread is the audit record, not just your summary.',
  footerVi: 'Gợi ý: Đính kèm MỌI email phản hồi của khách vào tab Attachments — full thread là audit record, không chỉ bản tóm tắt.',
};
