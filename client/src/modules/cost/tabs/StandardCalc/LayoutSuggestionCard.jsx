/**
 * LayoutSuggestionCard — optimizer output alongside the Layout Summary.
 *
 * Reusable in both Standard and Complex Calc contexts. Caller provides:
 *   - `state`    — layout-bearing state (stdState OR a SubProduct)
 *   - `material` — the main material row (for log_width)
 *   - `onApply`  — callback receiving the chosen candidate; caller
 *                  decides how to merge back into state (Standard
 *                  dispatches SET_STD_STATE; Complex mutates the SP).
 *
 * UX:
 *   - TOP card shows the #1 candidate as a mirror of Layout Summary,
 *     plus an Apply button + a "5 options" button that opens an
 *     inline modal listing the full top-5 with per-row Apply.
 *   - The card always renders (even when inputs are incomplete) so
 *     operators see "fill these fields to get a suggestion".
 */
import { useMemo, useState } from 'react';
import { suggestLayouts } from '../../../../services/layoutOptimizer';
import Modal from '../../../../components/Shared/Modal';

export default function LayoutSuggestionCard({ state, material, profile, onApply }) {
  const [showAll, setShowAll] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  const candidates = useMemo(() => {
    try {
      return suggestLayouts(state, material, { topN: 5, profile });
    } catch {
      return [];
    }
  }, [state, material, profile]);

  const top = candidates[0] || null;

  const missingInputs = [];
  if (!(state?.part_width > 0)) missingInputs.push('Part Width TD');
  if (!(state?.part_length_md > 0)) missingInputs.push('Part Length MD');
  const logW = (material?.log_width > 0 ? material.log_width : material?.width) || 0;
  if (!(logW > 0)) missingInputs.push('Material log width');

  return (
    <div className="cl-suggestion">
      <div className="cl-sum-title">
        <span role="img" aria-label="Optimizer">
          &#9889;
        </span>
        &nbsp;Layout Suggestion
      </div>

      {missingInputs.length > 0 && (
        <div className="cl-sug-empty">
          Cần nhập: <b>{missingInputs.join(', ')}</b>
        </div>
      )}

      {top && (
        <>
          <div className="cl-sum-row">
            <span>Press</span>
            <b>
              {top.press_type === 'flat' ? 'Flat die' : `Rotary (${top.tooth}T)`}
              <ReuseBadge status={top.reuse_status} reuse={top.reuse} />
            </b>
          </div>
          {top.needs_order?.length > 0 && (
            <div className="cl-sug-order-hint">
              <b>Need to order:</b>{' '}
              {top.needs_order
                .map((s) => s.replace('-', ' ').replace('T', 'T cylinder'))
                .join(' + ')}
            </div>
          )}
          <div className="cl-sum-row">
            <span>Pitch (mm)</span>
            <b>{top.pitch.toFixed(2)}</b>
          </div>
          <div className="cl-sum-row">
            <span>Web / Log</span>
            <b>
              {top.num_webs} × {top.web_width_td}mm
            </b>
          </div>
          <div className="cl-sum-row">
            <span>Grid / web</span>
            <b>
              {top.parts_web_across} × {top.parts_in_md}
            </b>
          </div>
          <div className="cl-sum-row">
            <span>Pcs / shot</span>
            <b>{top.pcs_per_shot}</b>
          </div>
          <div className="cl-sum-row cl-sug-offcut">
            <span>Offcut</span>
            <b style={{ color: offcutColor(top.offcut_total) }}>
              {(top.offcut_total * 100).toFixed(1)}%
            </b>
          </div>
          <div className="cl-sug-actions">
            <button className="cl-sug-apply" onClick={() => onApply?.(top)}>
              Apply
            </button>
            <button
              className="cl-sug-more"
              onClick={() => setShowAll(true)}
              disabled={candidates.length <= 1}
            >
              {candidates.length} options
            </button>
          </div>
          <button
            className="cl-sug-legend-btn"
            onClick={() => setShowLegend(true)}
            title="How this suggestion is calculated"
          >
            <span>ⓘ</span> How it works / Cách tính
          </button>
        </>
      )}

      {!top && missingInputs.length === 0 && (
        <div className="cl-sug-empty">Không tìm được layout khả thi với input hiện tại.</div>
      )}

      {showAll && (
        <OptionsModal
          candidates={candidates}
          onApply={(c) => {
            onApply?.(c);
            setShowAll(false);
          }}
          onClose={() => setShowAll(false)}
        />
      )}

      {showLegend && <LegendModal top={top} onClose={() => setShowLegend(false)} />}
    </div>
  );
}

function offcutColor(pct) {
  if (pct < 0.1) return '#15803d';
  if (pct < 0.2) return '#d97706';
  return '#ef4444';
}

/**
 * Reuse badge — 3-state: full / partial / none / unknown.
 * - full (both plate + magnetic in stock) → green ✓ reuse
 * - partial_plate (only plate in stock, need order magnetic) → amber ◐ partial
 * - partial_magnetic (only magnetic in stock) → amber ◐ partial
 * - none (neither in stock) → red ⚠ order both
 * - null (no inventory data) → blank
 */
function ReuseBadge({ status, reuse }) {
  if (status === 'full') return <span className="cl-sug-reuse">✓ reuse</span>;
  if (status === 'partial_plate')
    return (
      <span
        className="cl-sug-partial"
        title="Plate cylinder in stock — magnetic die must be ordered"
      >
        ◐ partial (order magnetic)
      </span>
    );
  if (status === 'partial_magnetic')
    return (
      <span
        className="cl-sug-partial"
        title="Magnetic die in stock — plate cylinder must be ordered"
      >
        ◐ partial (order plate)
      </span>
    );
  if (status === 'none') return <span className="cl-sug-newtool">⚠ order both</span>;
  // Legacy fallback when profile lacks plate/magnetic split.
  if (reuse === true) return <span className="cl-sug-reuse">✓ reuse</span>;
  if (reuse === false) return <span className="cl-sug-newtool">⚠ new die</span>;
  return null;
}

function OptionsModal({ candidates, onApply, onClose }) {
  return (
    <Modal open onClose={onClose} size="lg" ariaLabelledBy="layout-opts-title">
      <Modal.Header
        id="layout-opts-title"
        title="Layout Options"
        subtitle={`Top ${candidates.length} candidates ranked by optimizer score`}
        severity="info"
      />
      <Modal.Body className="flush">
        <table className="cl-sug-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Press</th>
              <th>Pitch</th>
              <th>Web</th>
              <th>Grid</th>
              <th>Pcs/shot</th>
              <th>Offcut</th>
              <th>Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={i} className={i === 0 ? 'cl-sug-best' : ''}>
                <td>
                  <b>{i + 1}</b>
                </td>
                <td>
                  {c.press_type === 'flat' ? 'Flat' : `${c.tooth}T`}
                  {c.reuse_status === 'full' && <span className="cl-sug-reuse"> ✓</span>}
                  {(c.reuse_status === 'partial_plate' ||
                    c.reuse_status === 'partial_magnetic') && (
                    <span className="cl-sug-partial" title={c.needs_order.join(', ')}>
                      {' '}
                      ◐
                    </span>
                  )}
                  {c.reuse_status === 'none' && <span className="cl-sug-newtool"> ⚠</span>}
                  {/* Legacy fallback */}
                  {!c.reuse_status && c.reuse === true && <span className="cl-sug-reuse"> ✓</span>}
                  {!c.reuse_status && c.reuse === false && (
                    <span className="cl-sug-newtool"> ⚠</span>
                  )}
                </td>
                <td>{c.pitch.toFixed(1)}</td>
                <td>
                  {c.num_webs}w × {c.web_width_td}
                </td>
                <td>
                  {c.parts_web_across} × {c.parts_in_md}
                  {c.rotated ? ' (rot.)' : ''}
                </td>
                <td>
                  <b>{c.pcs_per_shot}</b>
                </td>
                <td style={{ color: offcutColor(c.offcut_total) }}>
                  {(c.offcut_total * 100).toFixed(1)}%
                </td>
                <td>{c.score.toFixed(1)}</td>
                <td>
                  <button className="cl-sug-apply" onClick={() => onApply(c)}>
                    Apply
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-primary" onClick={onClose}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}

// ─── Legend modal (bilingual EN-VN) ─────────────────────────────
//
// Explains the 5 variables the optimizer searches over, the scoring
// formula, and the constraint sources. Built as a component rather
// than a static .md page so the numbers reflect the currently-shown
// top candidate — operators see exactly why this layout won.

function LegendModal({ top, onClose }) {
  return (
    <Modal open onClose={onClose} size="lg" severity="info" ariaLabelledBy="layout-legend-title">
      <Modal.Header
        id="layout-legend-title"
        title="How the Layout Optimizer works"
        subtitle="Cách Optimizer hoạt động · EN / VN"
        severity="info"
      />
      <Modal.Body>
        <div className="cl-legend-body">
          <Section
            titleEn="1. What the optimizer searches over (5 axes)"
            titleVi="1. Các biến optimizer tìm kiếm (5 trục)"
          >
            <Bi
              en="num_webs — how many parallel webs to slit out of the log (1..max)"
              vi="num_webs — số web song song tách ra từ khổ log (1..max)"
            />
            <Bi
              en="parts_web_across — parts per web in TD direction (cross-web)"
              vi="parts_web_across — số khoang mỗi web theo chiều ngang (TD)"
            />
            <Bi
              en="parts_in_md — parts per shot in MD direction (along web)"
              vi="parts_in_md — số khoang mỗi shot theo chiều dọc (MD)"
            />
            <Bi
              en="tooth / pitch — rotary cylinder tooth count (pitch = tooth × 3.175mm) or free pitch for flat presses"
              vi="tooth / pitch — số răng cylinder rotary (pitch = răng × 3.175mm) hoặc pitch tự do cho máy flat"
            />
            <Bi
              en="rotated — whether the part is placed in its original or 90° rotated orientation"
              vi="rotated — đặt khoang theo chiều gốc hay xoay 90°"
            />
          </Section>

          <Section
            titleEn="2. Geometry per web (one row of the feasibility check)"
            titleVi="2. Hình học mỗi web (1 dòng kiểm tra khả thi)"
          >
            <Formula>
              <span>web_width = log_width / num_webs</span>
              <span>avail_td = web_width − 2 × edge_margin_td</span>
              <span>max_across = ⌊(avail_td + min_gap_td) / (part_w + min_gap_td)⌋</span>
              <span>max_in_md = ⌊(pitch + min_gap_md) / (part_l + min_gap_md)⌋</span>
            </Formula>
            <Bi
              en="The edge margin (default 3mm each side) reserves space for slitting tolerance. Min gap TD/MD are the minimum cut-line separations."
              vi="Edge margin (mặc định 3mm mỗi cạnh) chừa không gian cho sai số slitting. Min gap TD/MD là khoảng cách tối thiểu giữa các đường cắt."
            />
          </Section>

          <Section
            titleEn="3. Offcut (waste %) computed against the WHOLE LOG"
            titleVi="3. Offcut (% hao phí) tính theo CẢ LOG"
          >
            <Formula>
              <span>
                used_td = num_webs × (parts_web_across × part_w + gaps + 2·edge_margin_td)
              </span>
              <span>offcut_td = 1 − used_td / log_width</span>
              <span>used_md = parts_in_md × part_l + (parts_in_md − 1) × min_gap_md</span>
              <span>offcut_md = 1 − used_md / pitch</span>
              <span>
                <b>offcut_total = 1 − (1 − offcut_td) × (1 − offcut_md)</b>
              </span>
            </Formula>
            <Bi
              en="Per-log (not per-shot) scoring lets a 4-web × 25-part layout compete fairly against a 1-web × 95-part layout — density is measured where operators actually pay: on the substrate."
              vi="Scoring theo log (không theo shot) giúp layout 4-web × 25 khoang cạnh tranh công bằng với 1-web × 95 khoang — mật độ đo ở nơi khách thật sự trả tiền: trên vật liệu."
            />
          </Section>

          <Section titleEn="4. Score (ranking formula)" titleVi="4. Score (công thức xếp hạng)">
            <Formula>
              <span>
                <b>score = pcs_per_shot × (1 − offcut_total)</b>
              </span>
              <span>pcs_per_shot = num_webs × parts_web_across × parts_in_md</span>
            </Formula>
            <Bi
              en="Rewards BOTH higher output per shot AND tighter packing. A candidate stuffing 20 parts with 40% waste scores WORSE than one stuffing 16 parts with 5% waste."
              vi="Tưởng thưởng CẢ số part/shot cao lẫn packing chặt. Layout nhồi 20 khoang với 40% waste SCORE KÉM hơn layout 16 khoang với 5% waste."
            />
            <Tiebreakers
              en="Ties are broken by (a) lower offcut_total, (b) fewer teeth (= cheaper die, smaller cylinder inertia)."
              vi="Khi tie score, thứ tự ưu tiên: (a) offcut_total thấp hơn, (b) ít răng hơn (= dao rẻ hơn, cylinder nhẹ hơn)."
            />
          </Section>

          <Section
            titleEn="5. Machine Profile constraints"
            titleVi="5. Các ràng buộc từ Machine Profile"
          >
            <Bi
              en="tooth_count_max — caps the rotary cylinder tooth search (Gallus 135T, Brotech 192T, Bayro 200T)"
              vi="tooth_count_max — giới hạn số răng tối đa (Gallus 135T, Brotech 192T, Bayro 200T)"
            />
            <Bi
              en="web_width_min / web_width_max — excludes web widths outside the machine's jaw range"
              vi="web_width_min / web_width_max — loại các web vượt khỏi khổ máy kẹp được"
            />
            <Bi
              en="plate_dies[] + magnetic_dies[] — TWO separate cylinder inventories. Rotary die-cut requires BOTH a plate mounting cylinder (printing) AND a magnetic cylinder (die-cut) at the SAME tooth count."
              vi="plate_dies[] + magnetic_dies[] — HAI kho cylinder riêng biệt. Rotary die-cut yêu cầu CẢ plate cylinder (in) VÀ magnetic cylinder (cắt) cùng số răng."
            />
            <Bi
              en="press_type (rotary | flat) — rotary iterates the tooth ladder; flat iterates free pitch values up to max_pitch_mm"
              vi="press_type (rotary | flat) — rotary duyệt theo răng; flat duyệt pitch tự do tới max_pitch_mm"
            />
          </Section>

          <Section
            titleEn="5b. Reuse classification (4 levels — drives order hints)"
            titleVi="5b. Phân loại reuse (4 mức — sinh gợi ý đặt hàng)"
          >
            <Bi
              en="✓ full — both plate AND magnetic cylinders on hand at this tooth → NO tooling cost"
              vi="✓ full — có CẢ plate và magnetic cylinder cùng tooth → KHÔNG tốn phí dao"
            />
            <Bi
              en="◐ partial_plate — plate on hand, magnetic missing → must order a new magnetic cylinder"
              vi="◐ partial_plate — có plate, thiếu magnetic → phải đặt magnetic mới"
            />
            <Bi
              en="◐ partial_magnetic — magnetic on hand, plate missing → must order a new plate cylinder"
              vi="◐ partial_magnetic — có magnetic, thiếu plate → phải đặt plate mới"
            />
            <Bi
              en="⚠ none — neither cylinder in stock → must order BOTH (highest cost, lowest rank)"
              vi="⚠ none — thiếu cả hai → phải đặt CẢ HAI (phí cao nhất, xếp hạng thấp nhất)"
            />
            <Bi
              en="Ranking: full wins first, then partial (either flavour), then none. Within same level, higher score + lower offcut win."
              vi="Xếp hạng: full trước, rồi partial (bất kỳ loại), rồi none. Cùng mức: score cao hơn + offcut thấp hơn thắng."
            />
          </Section>

          <Section
            titleEn="6. Asymmetric edge margins (customer-specified)"
            titleVi="6. Edge margin bất đối xứng (khách yêu cầu)"
          >
            <Bi
              en="edge_margin_td_left / edge_margin_td_right — distance from LEFT / RIGHT liner edge to the first product. Non-zero overrides the symmetric edge_margin_td."
              vi="edge_margin_td_left / edge_margin_td_right — khoảng cách từ mép liner TRÁI / PHẢI đến sản phẩm đầu tiên. Khác 0 sẽ ghi đè edge_margin_td đối xứng."
            />
            <Formula>
              <span>edge_total_per_web = edgeLeft + edgeRight</span>
              <span>avail_td = web_width − edge_total_per_web</span>
              <span>log_used_td = num_webs × (parts_span + edge_total_per_web)</span>
            </Formula>
          </Section>

          <Section
            titleEn="6b. Advanced tuning (Advanced Layout block)"
            titleVi="6b. Các tham số nâng cao (block Advanced Layout)"
          >
            <Bi
              en="parts_per_die — compound-die multiplier (e.g. 2 for a 2-up die cutting 2 labels per cavity). pcs_per_shot is multiplied by this."
              vi="parts_per_die — số bội compound die (ví dụ 2 cho dao 2-up cắt 2 nhãn/cavity). pcs_per_shot nhân với số này."
            />
            <Bi
              en="orient_locked — when true, optimizer MUST NOT rotate 90°. Use when text/barcode direction must match unwind direction."
              vi="orient_locked — khi bật, optimizer KHÔNG xoay 90°. Dùng khi hướng text/barcode phải theo chiều cuộn."
            />
            <Bi
              en="perf_offset_mm — adds to effective MD gap. Needed when a perforation line runs between repeat labels (extra space for perf blade)."
              vi="perf_offset_mm — cộng thêm vào gap MD hiệu dụng. Cần khi có đường perforation giữa các nhãn lặp lại (chừa chỗ cho lưỡi perf)."
            />
            <Bi
              en="target_pcs_per_roll — when set, optimizer grants a small score bonus (+2%) to candidates whose pcs_per_shot divides the target evenly (no leftover half-shots)."
              vi="target_pcs_per_roll — khi có giá trị, optimizer tặng bonus điểm (+2%) cho candidate mà pcs_per_shot chia hết target (không còn shot lẻ)."
            />
            <Bi
              en="tol_p2c / tol_c2c / tol_slit — customer-specified tolerances. Validator warns if min_gap_md < 2×tol_p2c, min_gap_td < 2×tol_c2c, or edge_margin_td < 3×tol_slit."
              vi="tol_p2c / tol_c2c / tol_slit — dung sai khách quy định. Validator cảnh báo nếu min_gap_md < 2×tol_p2c, min_gap_td < 2×tol_c2c, hoặc edge_margin_td < 3×tol_slit."
            />
          </Section>

          <Section
            titleEn="7. De-duplication of equivalent grids"
            titleVi="7. Loại trùng lặp các grid giống nhau"
          >
            <Bi
              en="Two candidates with the same (num_webs, parts_web_across, parts_in_md, rotated) but different tooth counts are functionally identical. The optimizer keeps the one with the lowest tooth count (cheapest die, best for reuse)."
              vi="Hai candidate cùng (num_webs, parts_web_across, parts_in_md, rotated) mà khác số răng thì giống nhau về layout. Optimizer giữ lại cái có ít răng nhất (dao rẻ nhất, dễ reuse hơn)."
            />
          </Section>

          {top && (
            <Section
              titleEn="📊 Why the current top suggestion won"
              titleVi="📊 Vì sao gợi ý #1 hiện tại thắng"
            >
              <div className="cl-legend-why">
                <div>
                  <b>Press / Máy:</b>{' '}
                  {top.press_type === 'flat' ? 'Flat die' : `Rotary ${top.tooth}T`}
                  <ReuseBadge status={top.reuse_status} reuse={top.reuse} />
                </div>
                {top.needs_order?.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <b>Order / Cần đặt:</b>{' '}
                    {top.needs_order
                      .map((s) => s.replace('-', ' ').replace('T', 'T cylinder'))
                      .join(' + ')}
                  </div>
                )}
                <div>
                  <b>Pitch:</b> {top.pitch.toFixed(2)} mm
                </div>
                <div>
                  <b>Layout:</b> {top.num_webs} web × {top.parts_web_across} across ×{' '}
                  {top.parts_in_md} MD = <b>{top.pcs_per_shot}</b> parts/shot
                </div>
                <div>
                  <b>Offcut TD:</b> {(top.offcut_td * 100).toFixed(1)}%
                </div>
                <div>
                  <b>Offcut MD:</b> {(top.offcut_md * 100).toFixed(1)}%
                </div>
                <div>
                  <b>Total offcut:</b>{' '}
                  <span style={{ color: offcutColor(top.offcut_total), fontWeight: 700 }}>
                    {(top.offcut_total * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <b>Score:</b> {top.score.toFixed(1)}{' '}
                  <span className="cl-legend-hint">
                    (= {top.pcs_per_shot} × {(1 - top.offcut_total).toFixed(4)})
                  </span>
                </div>
              </div>
            </Section>
          )}

          <div className="cl-legend-footer">
            <Bi
              en="Tip: if a suggestion looks wrong, check the Machine Profile + Material log_width first — the optimizer is only as good as its inputs."
              vi="Gợi ý: nếu đề xuất có vẻ sai, kiểm tra trước Machine Profile + Material log_width — optimizer chỉ tốt bằng input của nó."
            />
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

function Tiebreakers({ en, vi }) {
  return (
    <div className="cl-legend-tie">
      <div>
        <b>Tiebreaker:</b> {en}
      </div>
      <div>
        <b>Phá tie:</b> {vi}
      </div>
    </div>
  );
}

function Formula({ children }) {
  return <div className="cl-legend-formula">{children}</div>;
}
