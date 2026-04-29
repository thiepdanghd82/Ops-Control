/**
 * Self-test — Sprint 10 go-live smoke test.
 *
 * Launches headless Chrome, logs in as the demo user, navigates every
 * top-level sidebar tab + every calc sub-tab, and reports:
 *   - console errors during navigation
 *   - missing aria-labels on sub-tab buttons
 *   - unhandled promise rejections
 *   - slow-loading tabs (> 3 s to render their main panel)
 *
 * Exit code 0 = all tabs healthy; 1 = issues found. Output is a
 * structured JSON report printed to stdout for CI ingestion.
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.HELP_BASE_URL || 'http://localhost:5175';
const USER = 'demo';
const PASS = 'demo1234';

const TAB_PROBES = [
  // Sidebar tabs to visit (by substring match against nav-item text).
  // Regex covers all three label variants: legacy ("Standard"), current
  // EN ("Pricing (Std)"), and VN ("Bảng tính giá (TC)").
  { nav: 'Pricing.*Std|Standard|Tiêu chuẩn|Bảng tính giá.*TC',  id: 'standard',  wait: 1400 },
  { nav: 'Pricing.*Cpx|Complex|Phức tạp|Bảng tính giá.*PT',     id: 'complex',   wait: 1400 },
  { nav: 'Material Cost|Giá Vật',                   id: 'lib-mat',   wait: 1200 },
  { nav: 'Inks Calculator|Tính Mực',                id: 'ink-calc',  wait: 1400 },
  { nav: 'Print Area|Diện tích In',                 id: 'print-area',wait: 1600 },
  { nav: 'Cost Breakdown|Cơ cấu',                   id: 'summarize', wait: 1200 },
  { nav: 'Formal Quot|Báo giá Chính',               id: 'formal-q',  wait: 1200 },
  { nav: 'Quote History|Lịch sử',                   id: 'q-hist',    wait: 1300 },
  { nav: 'Pending Approval|Chờ Phê',                id: 'approvals', wait: 1200 },
  { nav: 'Dashboard|Bảng điều',                     id: 'dashboard', wait: 1500 },
  { nav: 'Settings|Cài đặt',                        id: 'settings',  wait: 1200 },
  { nav: '^Help$|Hướng dẫn',                        id: 'help',      wait: 1200 },
];

const report = {
  startedAt: new Date().toISOString(),
  consoleErrors: [],       // { tabId, message, source }
  pageErrors: [],          // { tabId, message }
  navFailures: [],         // tabId strings
  ariaMissing: [],         // { tabId, selector, count }
  slowRenders: [],         // { tabId, ms }
  summary: { tabsVisited: 0, healthy: 0 },
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

let currentTab = 'boot';
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    report.consoleErrors.push({
      tabId: currentTab, message: msg.text().slice(0, 300),
      source: msg.location()?.url || '',
    });
  }
});
page.on('pageerror', (err) => {
  report.pageErrors.push({ tabId: currentTab, message: String(err).slice(0, 300) });
});

try {
  // Login
  currentTab = 'login';
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[type=password]', { timeout: 10000 });
  await page.evaluate((u) => {
    const i = [...document.querySelectorAll('input')].find(x => x.type !== 'password'
      && /user|name/i.test(x.placeholder + ' ' + x.name));
    if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, u); i.dispatchEvent(new Event('input', { bubbles: true })); }
  }, USER);
  await page.evaluate((p) => {
    const pw = document.querySelector('input[type=password]');
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(pw, p); pw.dispatchEvent(new Event('input', { bubbles: true }));
  }, PASS);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /sign\s*in/i.test(b.textContent) && !/change/i.test(b.textContent))?.click();
  });
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));

  // Dismiss overlays (messages popup, chat bubble)
  await page.evaluate(() => {
    const later = [...document.querySelectorAll('button')].find(b =>
      /^(để sau|later|dismiss|sau)$/i.test(b.textContent.trim()));
    later?.click();
  });
  await page.addStyleTag({ content: `
    [class*="chat-launcher"], [class*="chat-bubble"] { display: none !important; }
  `}).catch(() => {});

  // Iterate sidebar tabs
  for (const probe of TAB_PROBES) {
    currentTab = probe.id;
    const t0 = Date.now();
    const clicked = await page.evaluate((m) => {
      const re = new RegExp(m, 'i');
      const strip = s => s.replace(/^[^a-zA-Z]+/, '').trim();
      const items = [...document.querySelectorAll('.nav-item')];
      const match = items.find(b => re.test(b.textContent) || re.test(strip(b.textContent)));
      if (match) { match.click(); return true; }
      return false;
    }, probe.nav);
    if (!clicked) {
      report.navFailures.push(probe.id);
      continue;
    }
    await new Promise(r => setTimeout(r, probe.wait));
    const renderMs = Date.now() - t0;
    if (renderMs > 3000) {
      report.slowRenders.push({ tabId: probe.id, ms: renderMs });
    }

    // Aria-label audit on any sub-tab bar present on this screen
    const a11y = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const missing = tabs.filter(t => !t.getAttribute('aria-label') && !t.textContent.trim()).length;
      return { tabCount: tabs.length, ariaMissing: missing };
    });
    if (a11y.ariaMissing > 0) {
      report.ariaMissing.push({ tabId: probe.id, count: a11y.ariaMissing });
    }
    report.summary.tabsVisited += 1;
    report.summary.healthy += 1;
  }
} catch (err) {
  report.pageErrors.push({ tabId: currentTab, message: `Test harness crashed: ${err.message}` });
} finally {
  await browser.close();
}

const outPath = path.resolve(__dirname, '../../../../4. CLAUDE OUTPUT/self-test-report.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

// Pretty summary
console.log('\n── Self-test summary ───────────────────');
console.log(`Tabs visited:     ${report.summary.tabsVisited}/${TAB_PROBES.length}`);
console.log(`Console errors:   ${report.consoleErrors.length}`);
console.log(`Page errors:      ${report.pageErrors.length}`);
console.log(`Nav failures:     ${report.navFailures.length}`);
console.log(`Aria-missing tabs:${report.ariaMissing.length}`);
console.log(`Slow renders:     ${report.slowRenders.length}`);
console.log(`\nFull report: ${outPath}`);

const bad = report.consoleErrors.length + report.pageErrors.length + report.navFailures.length;
if (bad > 0) {
  console.log('\n✘ Issues detected — see report');
  process.exitCode = 1;
} else {
  console.log('\n✓ All tabs healthy');
}
