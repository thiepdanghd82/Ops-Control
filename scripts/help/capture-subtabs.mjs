/**
 * Sub-tab capture: opens a real quote from Quote History, then cycles
 * through every sub-tab of the Standard Calc + Complex Calc to capture
 * screenshots with REAL data filled in.
 *
 * Outputs (under client/public/help/screenshots/):
 *   standard-layout.png, standard-material.png, standard-inks.png,
 *   standard-process.png, standard-balancing.png,
 *   standard-cost-breakdown.png, standard-pack-ship.png,
 *   standard-summarize.png
 *   complex-bom-tree.png, complex-cost-breakdown.png
 *   quote-history.png (list view), quote-history-opened.png (detail)
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../client/public/help/screenshots');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.HELP_BASE_URL || 'http://localhost:5175';
const USERNAME = process.env.HELP_DEMO_USER || 'demo';
const PASSWORD = process.env.HELP_DEMO_PASS || 'demo1234';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

// Reusable overlay dismissal (popup + chat bubble).
async function dismissOverlays() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await page.evaluate(() => {
      let hit = false;
      const later = [...document.querySelectorAll('button')].find(b => {
        if (b.offsetParent === null) return false;
        return /^(để sau|later|maybe later|not now|dismiss|sau)$/i.test(b.textContent.trim());
      });
      if (later) { later.click(); hit = true; }
      const closeX = [...document.querySelectorAll('button')].find(b => {
        if (b.offsetParent === null) return false;
        if (!/^[×✕✖xX]$/.test(b.textContent.trim())) return false;
        return !!b.closest('[role=dialog], .modal, [class*="modal"], [class*="popup"], [class*="overlay"]');
      });
      if (closeX) { closeX.click(); hit = true; }
      return hit;
    });
    if (!found) break;
    await new Promise(r => setTimeout(r, 200));
  }
  // CSS cover for re-mounting launcher
  await page.addStyleTag({ content: `
    [class*="chat-launcher"], [class*="chat-bubble"], [class*="ChatLaunch"],
    .chat-widget, [id*="intercom"], [id*="drift"], [class*="messenger-bubble"] {
      display: none !important;
    }
  `}).catch(() => {});
}

try {
  console.log(`→ Login as ${USERNAME}`);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[type=password]', { timeout: 10000 });
  await page.evaluate((u) => {
    const input = [...document.querySelectorAll('input')].find(i =>
      i.type !== 'password' &&
      /user|name/i.test(i.placeholder + ' ' + i.name));
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, u);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, USERNAME);
  await page.evaluate((p) => {
    const pw = document.querySelector('input[type=password]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(pw, p);
    pw.dispatchEvent(new Event('input', { bubbles: true }));
  }, PASSWORD);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      /sign\s*in/i.test(b.textContent) && !/change/i.test(b.textContent));
    btn?.click();
  });
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  await dismissOverlays();
  console.log('✓ Logged in');

  // Helper: click a sidebar nav-item by regex + wait + dismiss.
  // Nav items in this app render as "◇Standard" (icon + name, no space),
  // so we strip leading non-letter characters before matching.
  async function navSidebar(labelRegex, waitMs = 1200) {
    await page.evaluate((m) => {
      const re = new RegExp(m, 'i');
      const strip = s => s.replace(/^[^a-zA-Z]+/, '').trim();
      const items = [...document.querySelectorAll('.nav-item')];
      const match = items.find(b => re.test(b.textContent) || re.test(strip(b.textContent)));
      match?.click();
    }, labelRegex);
    await new Promise(r => setTimeout(r, waitMs));
    await dismissOverlays();
  }

  // Helper: click a sub-tab in the Standard/Complex internal tab bar.
  // The app uses .sc-subtab-btn buttons with an icon span + label span
  // (e.g., "📐" + "Layout" — combined textContent is "📐Layout"). We
  // target the .sc-subtab-label directly for a robust match.
  async function clickSubtab(labelRegex, waitMs = 1000) {
    const clicked = await page.evaluate((m) => {
      const re = new RegExp(m, 'i');
      // Tier 1: match .sc-subtab-label span, click its parent button.
      const labels = [...document.querySelectorAll('.sc-subtab-label')].filter(el => el.offsetParent !== null);
      const labelHit = labels.find(el => re.test(el.textContent.trim()));
      if (labelHit) {
        const btn = labelHit.closest('.sc-subtab-btn') || labelHit.closest('button');
        if (btn) { btn.click(); return 'sc-label'; }
      }
      // Tier 2: .sc-subtab-btn by its full text (includes emoji prefix)
      const btns = [...document.querySelectorAll('.sc-subtab-btn')].filter(el => el.offsetParent !== null);
      const btnHit = btns.find(b => re.test(b.textContent.trim()));
      if (btnHit) { btnHit.click(); return 'sc-btn'; }
      // Tier 3: any visible button short label
      const anyBtn = [...document.querySelectorAll('button')].filter(b => {
        if (b.offsetParent === null) return false;
        const t = b.textContent.trim();
        return t.length > 0 && t.length < 40 && re.test(t);
      })[0];
      if (anyBtn) { anyBtn.click(); return 'any'; }
      return null;
    }, labelRegex);
    await new Promise(r => setTimeout(r, waitMs));
    await dismissOverlays();
    return clicked;
  }

  // ── 1. Quote History list ───────────────────────────
  console.log('→ Quote History');
  await navSidebar('Quote History|Lịch sử');
  await page.screenshot({ path: path.join(OUT_DIR, 'quote-history.png') });

  // Open the first quote row (detail drawer / modal).
  const openedDetail = await page.evaluate(() => {
    const row = document.querySelector('table tbody tr, .quote-history-row, [data-quote-id]');
    if (!row) return false;
    row.click();
    return true;
  });
  if (openedDetail) {
    await new Promise(r => setTimeout(r, 1500));
    await dismissOverlays();
    await page.screenshot({ path: path.join(OUT_DIR, 'quote-history-opened.png') });
    console.log('  ✓ quote-history-opened');
  }

  // ── 2. Navigate to Standard directly (uses auto-restored state) ─
  // Standard Calc has a persistence layer — the last SKU worked on
  // auto-hydrates. Simpler than jumping from Quote History.
  console.log('→ Standard Calc');
  await navSidebar('^Standard|Tiêu chuẩn', 1500);


  // ── 3. Capture each Standard sub-tab ─────────────────────
  const STD_SUBTABS = [
    { id: 'standard-layout',          re: '^Layout$' },
    { id: 'standard-material',        re: '^Materials?$' },
    { id: 'standard-inks',            re: '^Inks$' },
    { id: 'standard-process',         re: '^Processes$' },
    { id: 'standard-balancing',       re: '^Balancing$' },
    { id: 'standard-cost-breakdown',  re: 'Cost Breakdown' },
    { id: 'standard-pack-ship',       re: 'Pack.{0,5}Ship' },
    { id: 'standard-summarize',       re: '^Summarize|Summary' },
  ];
  for (const st of STD_SUBTABS) {
    const result = await clickSubtab(st.re);
    console.log(`  · ${st.id} (click=${result || 'MISS'})`);
    await page.screenshot({ path: path.join(OUT_DIR, `${st.id}.png`) });
  }

  // ── 4. Complex Calc sub-views ────────────────────────────
  console.log('→ Complex Calc');
  await navSidebar('^Complex|Phức tạp', 1500);
  // Also attempt to load a Complex quote; if none, capture the empty tree.
  await page.evaluate(() => {
    const openBtn = [...document.querySelectorAll('button, a')].find(b => {
      if (b.offsetParent === null) return false;
      return /^(open|load|mở)$/i.test(b.textContent.trim());
    });
    openBtn?.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await dismissOverlays();

  const CPLX_VIEWS = [
    { id: 'complex-bom-tree',         re: 'BOM.*Tree|Cấu trúc' },
    { id: 'complex-cost-breakdown',   re: 'Cost Breakdown|Cơ cấu' },
  ];
  for (const v of CPLX_VIEWS) {
    const result = await clickSubtab(v.re);
    console.log(`  · ${v.id} (click=${result || 'MISS'})`);
    await page.screenshot({ path: path.join(OUT_DIR, `${v.id}.png`) });
  }

  console.log('\n✓ Sub-tab capture complete');
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
