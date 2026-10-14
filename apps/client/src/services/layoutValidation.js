/**
 * layoutValidation — pre-press layout sanity checks.
 *
 * Pure function. No React, no pdf.js, no api. Given the Standard-Calc
 * `stdState` (and optionally the resolved `materials[]`), it walks a set
 * of industry-standard ink-on-web geometric rules and returns every
 * violation it finds, bucketed by severity:
 *
 *   error   — physically impossible (parts overlap, web ≥ log, etc.)
 *             Save is BLOCKED until the operator fixes it.
 *   warning — geometrically possible but likely operator mistake
 *             (wasteful offcut, rotary pitch won't round, etc.)
 *             Save requires explicit "I have checked" confirmation.
 *   info    — derived delta the operator may want to glance at
 *             (exact mm dư / thiếu next to each field).
 *
 * Every issue is keyed by `field` (one of the flat stdState field names
 * — 'part_width', 'web_width_td', etc.) so the UI can render an inline
 * badge next to the offending input.
 */

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

// Thresholds — tuned for label-converting shop-floor norms (Esko / CERM
// defaults). Can be overridden per-call via opts, eventually per-site
// via Settings.
const DEFAULTS = {
  // TD margins
  edgeMarginTd: 3, // mm per side reserved for slitting
  minGapTd: 3, // mm between parts across the web
  // MD gaps
  minGapMd: 3, // mm between parts along the web
  // Waste tolerance above nominal (soft warning)
  maxWasteTdPct: 0.2, // warn if web > 20% wider than parts need
  maxWasteMdPct: 0.3, // warn if sheet > 30% longer than parts need
  // Rotary step (1/8" = 3.175 mm industry standard)
  toothPitchMm: 3.175,
  // Material
  maxOffcutPct: 0.25, // 25% offcut = warn
};

const num = (v) => (Number.isFinite(+v) ? +v : 0);

/**
 * @param {object} st      stdState with the flat layout fields
 * @param {object[]} materials  optional material rows (for cross-check)
 * @param {object}  opts   threshold overrides
 * @param {object}  profile  optional machine profile (for station / slit
 *                  lane cross-check). Shape: { num_print_stations,
 *                  min_slit_lane_mm, web_width_min_mm, web_width_max_mm }
 * @returns {{ errors, warnings, infos, byField, hasBlockers }}
 */
export function validateLayout(st, materials = [], opts = {}, profile = null) {
  const cfg = { ...DEFAULTS, ...opts };
  const issues = [];

  const partW = num(st?.part_width);
  const partL = num(st?.part_length_md);
  const across = num(st?.parts_web_across);
  const inMd = num(st?.parts_in_md);
  const webW = num(st?.web_width_td);
  const sheetL = num(st?.sheet_length);
  const numWebs = num(st?.num_webs);
  const gapMd = num(st?.min_gap_md) || cfg.minGapMd;
  const gapTd = num(st?.min_gap_td) || cfg.minGapTd;
  const edgeTd = num(st?.edge_margin_td) || cfg.edgeMarginTd;
  // Asymmetric edge margins — when either is non-zero, they OVERRIDE the
  // symmetric default (same convention as layoutOptimizer). The validator
  // must honor this or it silently misses web-overflow when operators
  // enter large customer-specified edges like 10/10 mm.
  const edgeLeft = num(st?.edge_margin_td_left);
  const edgeRight = num(st?.edge_margin_td_right);
  const edgesAsym = edgeLeft > 0 || edgeRight > 0;
  const edgesTotal = edgesAsym ? edgeLeft + edgeRight : 2 * edgeTd;
  const rotaryCols = num(st?.rotary_cols);
  const toothPitch = num(st?.tooth_pitch_mm) || cfg.toothPitchMm;
  // v3 — tolerance + compound-die fields
  const tolP2c = num(st?.tol_p2c_mm);
  const tolC2c = num(st?.tol_c2c_mm);
  const tolSlit = num(st?.tol_slit_mm);
  const perfOff = num(st?.perf_offset_mm);

  // 1) Required-field checks ────────────────────────────────────────
  if (partW <= 0)
    issues.push(iss('part_width', SEVERITY.ERROR, 'required', 'Part Width TD là bắt buộc'));
  if (partL <= 0)
    issues.push(iss('part_length_md', SEVERITY.ERROR, 'required', 'Part Length MD là bắt buộc'));
  if (across <= 0)
    issues.push(
      iss('parts_web_across', SEVERITY.ERROR, 'required', 'Parts/Web Across là bắt buộc')
    );
  if (inMd <= 0)
    issues.push(iss('parts_in_md', SEVERITY.ERROR, 'required', 'Parts in MD là bắt buộc'));
  if (webW <= 0)
    issues.push(iss('web_width_td', SEVERITY.ERROR, 'required', 'Web Width TD là bắt buộc'));
  if (sheetL <= 0)
    issues.push(iss('sheet_length', SEVERITY.ERROR, 'required', 'Sheet Length MD là bắt buộc'));

  // 2) Geometry — TD (across the web) ───────────────────────────────
  //   Required TD space = across·partW + (across-1)·gapTd + edgesTotal
  //   edgesTotal honors asymmetric edge_margin_td_left + _right when set,
  //   else falls back to 2 × edge_margin_td (symmetric default).
  //   Must fit inside web_width_td.
  if (partW > 0 && across > 0 && webW > 0) {
    const needTd = across * partW + Math.max(0, across - 1) * gapTd + edgesTotal;
    const deltaTd = webW - needTd; // >0 = dư, <0 = thiếu
    const edgesDesc = edgesAsym
      ? `L ${edgeLeft}mm + R ${edgeRight}mm = ${edgesTotal}mm`
      : `${edgeTd}mm mỗi cạnh (= ${edgesTotal}mm)`;
    if (deltaTd < 0) {
      issues.push(
        iss(
          'web_width_td',
          SEVERITY.ERROR,
          'td_overlap',
          `Web rộng ${webW}mm không chứa đủ ${across} khoang × ${partW}mm (+ ${gapTd}mm gap + edge ${edgesDesc} = cần ≥ ${needTd.toFixed(2)}mm). Thiếu ${(-deltaTd).toFixed(2)}mm. Giảm edge hoặc tăng web_width_td lên ≥ ${needTd.toFixed(2)}mm.`,
          { need: needTd, have: webW, delta: deltaTd, edgesTotal, edgesAsym }
        )
      );
    } else if (deltaTd > needTd * cfg.maxWasteTdPct) {
      issues.push(
        iss(
          'web_width_td',
          SEVERITY.WARNING,
          'td_waste',
          `Web dư ${deltaTd.toFixed(2)}mm (cần ${needTd.toFixed(2)}mm, đang ${webW}mm). Cân nhắc tăng parts_web_across hoặc chọn khổ web nhỏ hơn để giảm offcut.`,
          { need: needTd, have: webW, delta: deltaTd }
        )
      );
    } else {
      issues.push(
        iss(
          'web_width_td',
          SEVERITY.INFO,
          'td_fit',
          deltaTd === 0 ? 'TD vừa khít' : `TD dư ${deltaTd.toFixed(2)}mm`,
          { delta: deltaTd }
        )
      );
    }
  }

  // 2b) Edge-margin sanity — warn when asymmetric edges alone consume
  // most of the web, regardless of part count. Catches cases where the
  // operator enters customer-specified edges (e.g. 10/10 on a 108 mm
  // web) without realising they've already eaten 40% of the usable width.
  if (webW > 0 && edgesTotal > 0) {
    const edgePct = edgesTotal / webW;
    if (edgesTotal >= webW) {
      issues.push(
        iss(
          'edge_margin_td_left',
          SEVERITY.ERROR,
          'edges_exceed_web',
          `Edge L (${edgeLeft}) + Edge R (${edgeRight}) = ${edgesTotal}mm ≥ web ${webW}mm — không còn chỗ cho part. Giảm edge hoặc tăng Web Width TD lên > ${edgesTotal.toFixed(1)}mm.`,
          { edgesTotal, webW }
        )
      );
    } else if (edgePct > 0.25) {
      issues.push(
        iss(
          'edge_margin_td_left',
          SEVERITY.WARNING,
          'edges_too_wide',
          `Edge tổng ${edgesTotal}mm = ${(edgePct * 100).toFixed(1)}% của web ${webW}mm — lãng phí vật liệu. Cân nhắc giảm edge hoặc tăng web width.`,
          { edgesTotal, webW, pct: edgePct }
        )
      );
    }
  }

  // 3) Geometry — MD (along the web / sheet) ────────────────────────
  if (partL > 0 && inMd > 0 && sheetL > 0) {
    const needMd = inMd * partL + Math.max(0, inMd - 1) * gapMd;
    const deltaMd = sheetL - needMd;
    if (deltaMd < 0) {
      issues.push(
        iss(
          'sheet_length',
          SEVERITY.ERROR,
          'md_overlap',
          `Sheet dài ${sheetL}mm không chứa đủ ${inMd} khoang × ${partL}mm (+ ${gapMd}mm gap = cần ≥ ${needMd.toFixed(2)}mm). Thiếu ${(-deltaMd).toFixed(2)}mm.`,
          { need: needMd, have: sheetL, delta: deltaMd }
        )
      );
    } else if (deltaMd > needMd * cfg.maxWasteMdPct) {
      issues.push(
        iss(
          'sheet_length',
          SEVERITY.WARNING,
          'md_waste',
          `Sheet dư ${deltaMd.toFixed(2)}mm. Cân nhắc tăng parts_in_md hoặc giảm min_gap_md.`,
          { need: needMd, have: sheetL, delta: deltaMd }
        )
      );
    } else {
      issues.push(
        iss(
          'sheet_length',
          SEVERITY.INFO,
          'md_fit',
          deltaMd === 0 ? 'MD vừa khít' : `MD dư ${deltaMd.toFixed(2)}mm`,
          { delta: deltaMd }
        )
      );
    }
  }

  // 3b) Pitch consistency (Sprint S-DFM) — when parts_in_md > 1, the
  // `sheet_length` MUST equal the physical MD layout extent. If operator
  // enters an arbitrary sheet_length, pitch + QPA silently use a value
  // that doesn't match the actual part grid → material cost wrong.
  if (partL > 0 && inMd > 1 && sheetL > 0) {
    const expected = inMd * partL + (inMd - 1) * gapMd;
    const lenDelta = Math.abs(sheetL - expected);
    if (lenDelta > 0.5) {
      issues.push(
        iss(
          'sheet_length',
          SEVERITY.ERROR,
          'pitch_mismatch',
          `Sheet Length MD ${sheetL}mm không khớp bố cục ${inMd} × ${partL}mm + ${inMd - 1} × ${gapMd}mm gap = ${expected.toFixed(2)}mm. Lệch ${lenDelta.toFixed(2)}mm → pitch và QPA tính sai. Đặt Sheet Length = ${expected.toFixed(2)}mm.`,
          { expected, have: sheetL, delta: lenDelta }
        )
      );
    }
  }

  // 4) Rotary pitch — must round to the tooth step ──────────────────
  //
  // Float-precision guard: 104.775 / 3.175 = 33.000000000000004 in IEEE
  // 754, so a naive ceil() rounds to 34 and "discovers" a 3.175mm snap
  // that doesn't exist. Shave off a tiny epsilon (1e-9) before ceiling
  // so values that ARE exact multiples don't falsely snap.
  if (rotaryCols > 0 && sheetL > 0) {
    const rawPitch = sheetL + gapMd;
    const teeth = Math.ceil((rawPitch * rotaryCols) / toothPitch - 1e-9);
    const snappedPitch = (teeth * toothPitch) / rotaryCols;
    const snapDelta = Math.abs(snappedPitch - rawPitch);
    if (snapDelta > 0.05) {
      // Sprint S-SNAP-FIX (2026-04-24) — old message stated only the
      // snapped PITCH, which operators confused for the sheet_length
      // to enter. Following the advice literally produced a new
      // non-matching pitch (user enters snappedPitch as sheet_length →
      // new pitch = snappedPitch + gapMd → still off by gapMd). The
      // clearer message spells out BOTH the target pitch AND the
      // sheet_length value that achieves it.
      const recommendedSheet = snappedPitch - gapMd;
      issues.push(
        iss(
          'sheet_length',
          SEVERITY.WARNING,
          'rotary_snap',
          `Rotary ${rotaryCols} cột: pitch hiện tại ${rawPitch.toFixed(3)}mm (= sheet_length ${sheetL.toFixed(3)} + min_gap_md ${gapMd.toFixed(3)}) không khớp bước răng ${toothPitch}mm. Sẽ tự snap lên pitch ${snappedPitch.toFixed(3)}mm (${teeth}T, lệch ${snapDelta.toFixed(3)}mm). Muốn khớp chính xác: nhập sheet_length = ${recommendedSheet.toFixed(3)}mm (= ${snappedPitch.toFixed(3)} − ${gapMd.toFixed(3)}).`,
          { raw: rawPitch, snapped: snappedPitch, delta: snapDelta, recommendedSheet, teeth }
        )
      );
    }
  }

  // 5) Multi-web vs log width ───────────────────────────────────────
  const mainMat = Array.isArray(materials)
    ? materials.find((m) => m && m.row_type === 'Main.Mat' && (m.log_width > 0 || m.width > 0))
    : null;
  const logW = num(mainMat?.log_width) || num(mainMat?.width);
  if (numWebs > 1 && webW > 0 && logW > 0) {
    const needLog = numWebs * webW;
    if (needLog > logW + 0.01) {
      issues.push(
        iss(
          'num_webs',
          SEVERITY.ERROR,
          'log_overflow',
          `${numWebs} web × ${webW}mm = ${needLog}mm vượt khổ log ${logW}mm (material).`,
          { need: needLog, have: logW }
        )
      );
    }
  }

  // 6) Material offcut % (cross-check with Materials tab) ───────────
  if (mainMat && mainMat.offcut_pct > cfg.maxOffcutPct) {
    issues.push(
      iss(
        'web_width_td',
        SEVERITY.WARNING,
        'offcut_high',
        `Offcut vật liệu chính ${(mainMat.offcut_pct * 100).toFixed(1)}% — xem lại layout (ngưỡng cảnh báo ${(cfg.maxOffcutPct * 100).toFixed(0)}%).`,
        { offcut_pct: mainMat.offcut_pct }
      )
    );
  }

  // 7) Tolerance-aware gap checks (v3) ───────────────────────────
  //
  // Customer tolerance means the REAL position can drift by ±tol. Two
  // parts at opposite tolerance extremes with a gap equal to the
  // tolerance would touch. Safe gap = at least 2× the tolerance.
  if (tolC2c > 0 && gapTd > 0 && gapTd < 2 * tolC2c) {
    issues.push(
      iss(
        'min_gap_td',
        SEVERITY.WARNING,
        'gap_below_tol',
        `Gap TD ${gapTd}mm < 2× tolerance C2C (${tolC2c}mm × 2 = ${(2 * tolC2c).toFixed(2)}mm). Các khoang có thể chồng lên nhau ở biên dung sai.`,
        { gap: gapTd, tol: tolC2c, min_safe: 2 * tolC2c }
      )
    );
  }
  if (tolP2c > 0 && gapMd > 0 && gapMd < 2 * tolP2c) {
    issues.push(
      iss(
        'min_gap_md',
        SEVERITY.WARNING,
        'gap_below_tol',
        `Gap MD ${gapMd}mm < 2× tolerance P2C (${tolP2c}mm × 2 = ${(2 * tolP2c).toFixed(2)}mm). Các khoang có thể chồng lên nhau ở biên dung sai.`,
        { gap: gapMd, tol: tolP2c, min_safe: 2 * tolP2c }
      )
    );
  }
  if (tolSlit > 0 && edgeTd > 0 && edgeTd < 3 * tolSlit) {
    issues.push(
      iss(
        'edge_margin_td',
        SEVERITY.WARNING,
        'edge_below_slit_tol',
        `Edge margin ${edgeTd}mm < 3× tolerance Slit (${tolSlit}mm × 3 = ${(3 * tolSlit).toFixed(2)}mm). Dễ bị cắt phạm sản phẩm ở cực dung sai.`,
        { edge: edgeTd, tol: tolSlit, min_safe: 3 * tolSlit }
      )
    );
  }

  // 9) Print/Cut split validators (Sprint S-SPLIT) ──────────────
  const netW = num(st?.part_net_width);
  const netL = num(st?.part_net_length);
  const bleedTd = num(st?.bleed_td_mm);
  const bleedMd = num(st?.bleed_md_mm);
  const cornerR = num(st?.corner_radius_mm);
  const cutType = String(st?.cut_type || '').trim();

  // 9a) Net size too small (< 5×5mm) — likely operator error
  if (netW > 0 && netW < 5) {
    issues.push(
      iss(
        'part_net_width',
        SEVERITY.WARNING,
        'net_too_small',
        `Net width ${netW}mm < 5mm — quá nhỏ, kiểm tra lại (đơn vị mm không phải cm?).`,
        { net: netW, min: 5 }
      )
    );
  }
  if (netL > 0 && netL < 5) {
    issues.push(
      iss(
        'part_net_length',
        SEVERITY.WARNING,
        'net_too_small',
        `Net length ${netL}mm < 5mm — quá nhỏ, kiểm tra lại.`,
        { net: netL, min: 5 }
      )
    );
  }

  // 9b) Bleed too large compared to net (> 10%) — likely operator error
  if (netW > 0 && bleedTd > 0 && bleedTd > netW * 0.1) {
    issues.push(
      iss(
        'bleed_td_mm',
        SEVERITY.WARNING,
        'bleed_too_large',
        `Bleed TD ${bleedTd}mm > 10% của net width ${netW}mm. Bleed quá lớn — thường 0.5-1mm là đủ.`,
        { bleed: bleedTd, net: netW, pct: (bleedTd / netW) * 100 }
      )
    );
  }
  if (netL > 0 && bleedMd > 0 && bleedMd > netL * 0.1) {
    issues.push(
      iss(
        'bleed_md_mm',
        SEVERITY.WARNING,
        'bleed_too_large',
        `Bleed MD ${bleedMd}mm > 10% của net length ${netL}mm.`,
        { bleed: bleedMd, net: netL, pct: (bleedMd / netL) * 100 }
      )
    );
  }

  // 9c) Net + 2·bleed must fit inside die (part_width / part_length_md)
  if (netW > 0 && partW > 0 && netW + 2 * bleedTd > partW + 0.01) {
    issues.push(
      iss(
        'part_net_width',
        SEVERITY.ERROR,
        'net_exceeds_die',
        `Net + 2×bleed = ${(netW + 2 * bleedTd).toFixed(2)}mm vượt Die Width ${partW}mm. In sẽ tràn khỏi vùng cắt.`,
        { net: netW, bleed: bleedTd, die: partW }
      )
    );
  }
  if (netL > 0 && partL > 0 && netL + 2 * bleedMd > partL + 0.01) {
    issues.push(
      iss(
        'part_net_length',
        SEVERITY.ERROR,
        'net_exceeds_die',
        `Net + 2×bleed = ${(netL + 2 * bleedMd).toFixed(2)}mm vượt Die Length ${partL}mm.`,
        { net: netL, bleed: bleedMd, die: partL }
      )
    );
  }

  // 9d) Corner radius incompatible with perf-only cut type
  if (cornerR > 0 && cutType === 'perf-only') {
    issues.push(
      iss(
        'corner_radius_mm',
        SEVERITY.WARNING,
        'corner_vs_perf',
        `Corner radius ${cornerR}mm không áp dụng khi cut_type = "perf-only" (perf line không có góc bo).`,
        { corner: cornerR, cut_type: cutType }
      )
    );
  }

  // 10) Perforation offset must fit inside MD gap ────────────────
  if (perfOff > 0 && gapMd > 0 && gapMd < perfOff + 1) {
    issues.push(
      iss(
        'perf_offset_mm',
        SEVERITY.WARNING,
        'perf_gap_tight',
        `Perf offset ${perfOff}mm gần/vượt min_gap_md ${gapMd}mm — cần tăng gap MD để chứa perf line + margin.`,
        { perf: perfOff, gap: gapMd }
      )
    );
  }

  // 11) DFM: Color count vs Print stations (Sprint S-DFM) ────────
  // Flexo/letterpress have a finite number of print stations (Gallus
  // EM340 = 4P/2C). Quoting 8 colors on a 4-station machine means
  // either 2-pass operation (doubles setup cost) or re-assign to a
  // bigger press. Silent miss = mis-priced quote.
  const colorCount = num(st?.color_count);
  const stationMax = num(profile?.num_print_stations) || num(profile?.num_stations);
  if (colorCount > 0 && stationMax > 0 && colorCount > stationMax) {
    issues.push(
      iss(
        'color_count',
        SEVERITY.ERROR,
        'color_over_stations',
        `Số màu ${colorCount} vượt số trạm in ${stationMax} của máy "${profile?.name || 'press'}" → cần chạy 2-pass (doubles setup) hoặc đổi máy lớn hơn.`,
        { color_count: colorCount, stations: stationMax, press: profile?.name }
      )
    );
  }
  if (colorCount > 8) {
    issues.push(
      iss(
        'color_count',
        SEVERITY.WARNING,
        'color_count_high',
        `${colorCount} màu là rất cao — kiểm tra lại (có phải spot + CMYK + white + UV?). Quy chuẩn nhãn thường 1-6 màu.`,
        { color_count: colorCount }
      )
    );
  }

  // 12) DFM: Die quiet zone (Sprint S-DFM) ──────────────────────
  // Rotary dies need 5-8mm clearance around parts for reg marks,
  // bearer bars, and vision system fiducials. Operator often forgets
  // to account for this — die rides up to liner edge on paper, but
  // production fails QC.
  const quietZone = num(st?.die_quiet_zone_mm);
  if (quietZone > 0) {
    const minEdgeForQZ = quietZone;
    const effEdgeMin = Math.min(edgeLeft || edgeTd, edgeRight || edgeTd);
    if (effEdgeMin > 0 && effEdgeMin < minEdgeForQZ) {
      issues.push(
        iss(
          'die_quiet_zone_mm',
          SEVERITY.WARNING,
          'quiet_zone_too_tight',
          `Quiet zone ${quietZone}mm cần Edge ≥ ${minEdgeForQZ}mm, hiện Edge min = ${effEdgeMin}mm. Reg marks/bearer bar có thể bị chèn sát mép.`,
          { quiet: quietZone, edge: effEdgeMin }
        )
      );
    }
    if (quietZone > 0 && gapTd > 0 && gapTd < quietZone * 0.8) {
      issues.push(
        iss(
          'die_quiet_zone_mm',
          SEVERITY.WARNING,
          'quiet_zone_gap_tight',
          `Quiet zone ${quietZone}mm > gap TD ${gapTd}mm × 0.8 — khoảng trống giữa parts không đủ cho vision system / bearer.`,
          { quiet: quietZone, gap_td: gapTd }
        )
      );
    }
  }

  // 13) DFM: Print-to-print (color registration) tolerance ───────
  const tolP2p = num(st?.tol_p2p_mm);
  if (tolP2p > 0 && tolP2p > 0.2) {
    issues.push(
      iss(
        'tol_p2p_mm',
        SEVERITY.WARNING,
        'color_reg_loose',
        `Print-to-print tolerance ${tolP2p}mm > 0.2mm — rất rộng so với chuẩn (flexo ≤ 0.1mm, Indigo ≤ 0.05mm). Kiểm tra lại với khách.`,
        { tol_p2p: tolP2p }
      )
    );
  }
  // Color registration relies on bleed to mask drift. With multi-color
  // jobs, bleed should be ≥ 2× tol_p2p on each side or colors won't
  // overlap at registration extremes.
  if (tolP2p > 0 && colorCount >= 2) {
    const bleedTd = num(st?.bleed_td_mm);
    const bleedMd = num(st?.bleed_md_mm);
    const minBleed = 2 * tolP2p;
    if (bleedTd > 0 && bleedTd < minBleed) {
      issues.push(
        iss(
          'bleed_td_mm',
          SEVERITY.WARNING,
          'bleed_below_reg',
          `Bleed TD ${bleedTd}mm < 2× tol_p2p (${minBleed.toFixed(2)}mm). Với ${colorCount} màu, drift registration có thể lộ mép trắng giữa màu.`,
          { bleed: bleedTd, tol_p2p: tolP2p, min_safe: minBleed }
        )
      );
    }
    if (bleedMd > 0 && bleedMd < minBleed) {
      issues.push(
        iss(
          'bleed_md_mm',
          SEVERITY.WARNING,
          'bleed_below_reg',
          `Bleed MD ${bleedMd}mm < 2× tol_p2p (${minBleed.toFixed(2)}mm).`,
          { bleed: bleedMd, tol_p2p: tolP2p, min_safe: minBleed }
        )
      );
    }
  }

  // 14) DFM: Corner radius physical limits ───────────────────────
  if (cornerR > 0) {
    if (cornerR < 0.5) {
      issues.push(
        iss(
          'corner_radius_mm',
          SEVERITY.ERROR,
          'corner_too_sharp',
          `Corner radius ${cornerR}mm < 0.5mm — không chế tạo được trên magnetic die (min radius vật lý = 0.5mm). Đặt ≥ 0.5mm.`,
          { corner: cornerR, min: 0.5 }
        )
      );
    }
    if (partW > 0 && cornerR > partW / 4) {
      issues.push(
        iss(
          'corner_radius_mm',
          SEVERITY.WARNING,
          'corner_too_large',
          `Corner radius ${cornerR}mm > 1/4 part width (${(partW / 4).toFixed(2)}mm) → label mất gần hết góc vuông, trông tròn bầu. Xác nhận với khách.`,
          { corner: cornerR, part_w: partW }
        )
      );
    }
    const bleedTd = num(st?.bleed_td_mm);
    if (bleedTd > 0 && cornerR > bleedTd * 2) {
      issues.push(
        iss(
          'corner_radius_mm',
          SEVERITY.INFO,
          'corner_exceeds_bleed',
          `Corner radius ${cornerR}mm > 2× bleed TD (${bleedTd}mm) — vùng bleed ở góc có thể ngắn, artwork phải thiết kế phù hợp.`,
          { corner: cornerR, bleed: bleedTd }
        )
      );
    }
  }

  // 15) DFM: Slit lane width ≥ machine minimum (Sprint S-DFM) ────
  // After slit, each lane must be wide enough for the cut machine to
  // transport it (typical: ≥ 25mm for RDC, ≥ 30mm for Brotech). Set
  // per-press override via machine profile.min_slit_lane_mm.
  const slitOn = !!st?.slit_after_print;
  const slitCnt = Math.max(1, num(st?.slit_lane_count) || 1);
  if (slitOn && slitCnt > 1 && webW > 0) {
    const usable = webW - edgesTotal;
    const laneW = usable / slitCnt;
    const minLane = num(st?.min_slit_lane_width_mm) || num(profile?.min_slit_lane_mm) || 25;
    if (laneW < minLane) {
      issues.push(
        iss(
          'slit_lane_count',
          SEVERITY.ERROR,
          'slit_lane_too_narrow',
          `Lane sau slit = (${webW} − ${edgesTotal}) / ${slitCnt} = ${laneW.toFixed(2)}mm < min ${minLane}mm (${profile?.name ? 'máy ' + profile.name : 'chuẩn công nghiệp'}). Giảm slit_lane_count hoặc tăng web width.`,
          { lane_w: laneW, min_lane: minLane, press: profile?.name }
        )
      );
    }
  }

  // 16) DFM: Web width out of press range ─────────────────────────
  if (webW > 0 && profile) {
    const wMin = num(profile.web_width_min_mm);
    const wMax = num(profile.web_width_max_mm);
    if (wMin > 0 && webW < wMin) {
      issues.push(
        iss(
          'web_width_td',
          SEVERITY.ERROR,
          'web_below_press_min',
          `Web ${webW}mm < min ${wMin}mm của máy ${profile.name || ''}. Chọn máy khác hoặc tăng web width.`,
          { web: webW, min: wMin, press: profile.name }
        )
      );
    }
    if (wMax > 0 && webW > wMax) {
      issues.push(
        iss(
          'web_width_td',
          SEVERITY.ERROR,
          'web_above_press_max',
          `Web ${webW}mm > max ${wMax}mm của máy ${profile.name || ''}. Chọn máy khác hoặc giảm web width.`,
          { web: webW, max: wMax, press: profile.name }
        )
      );
    }
  }

  // 17) DFM: Reg-mark strip needs edge space (Sprint S-DFM-P4) ────
  // When include_reg_marks is on, a color bar / registration strip
  // (typ. 5mm) must sit in the edge zone. Warn when the narrower edge
  // is smaller than reg-mark width.
  if (st?.include_reg_marks) {
    const regW = num(st?.reg_mark_width_mm) || 5;
    const narrowEdge = edgesAsym ? Math.min(edgeLeft || 0, edgeRight || 0) : edgeTd;
    if (narrowEdge > 0 && narrowEdge < regW) {
      issues.push(
        iss(
          'reg_mark_width_mm',
          SEVERITY.WARNING,
          'reg_mark_edge_short',
          `Reg mark strip ${regW}mm cần Edge ≥ ${regW}mm, hiện Edge nhỏ nhất = ${narrowEdge}mm. Reg mark / color bar sẽ bị cắt phạm.`,
          { reg_w: regW, edge: narrowEdge }
        )
      );
    }
  }

  const errors = issues.filter((i) => i.severity === SEVERITY.ERROR);
  const warnings = issues.filter((i) => i.severity === SEVERITY.WARNING);
  const infos = issues.filter((i) => i.severity === SEVERITY.INFO);

  const byField = {};
  for (const i of issues) {
    if (!byField[i.field]) byField[i.field] = [];
    byField[i.field].push(i);
  }

  return { errors, warnings, infos, byField, hasBlockers: errors.length > 0 };
}

function iss(field, severity, code, message, detail) {
  return { field, severity, code, message, ...(detail ? { detail } : {}) };
}
