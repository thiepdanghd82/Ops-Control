/**
 * Screenshot pass using the DEMO user (role=user, no 2FA).
 *
 * Differs from capture-screenshots.mjs in that it reads username/pw
 * from HELP_DEMO_* env vars (or uses the `demo / demo1234` defaults)
 * and skips the 2FA step entirely. Also opens a saved quote in Quote
 * History to capture screenshots with REAL data, not empty state.
 *
 * Usage:
 *   node scripts/help/capture-with-demo.mjs
 *
 * Captures extra: quote-history-opened.png (a real quote detail view)
 * and sidebar-help-expanded.png (showing Help visible in SYSTEM group).
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

// Tabs visible to a plain `user` role. Admin-only tabs (Metrics, Account
// Control) are captured separately via capture-screenshots.mjs with the
// Administrator account. Help tab itself is captured to show the new
// procedure/appendix rendering.
const TABS = [
  { id: 'standard', match: 'Standard', waitMs: 1500 },
  { id: 'complex', match: 'Complex', waitMs: 1500 },
  { id: 'ink-calc', match: 'Inks|Tính Mực', waitMs: 1500 },
  { id: 'print-area', match: 'Print Area|Diện tích In', waitMs: 1700 },
  { id: 'summarize', match: 'Cost Breakdown|Cơ cấu', waitMs: 1300 },
  { id: 'formal-quote', match: 'Formal Quot|Báo giá Chính', waitMs: 1300 },
  { id: 'quote-history', match: 'Quote History|Lịch sử', waitMs: 1300 },
  { id: 'approvals-inbox', match: 'Pending Approval|Chờ Phê', waitMs: 1300 },
  { id: 'sample-tracking', match: 'Sample|Mẫu', waitMs: 1300 },
  { id: 'dashboard', match: 'Dashboard|Bảng điều', waitMs: 1600 },
  { id: 'quote-analysis', match: 'Quote Analysis|Phân tích', waitMs: 1600 },
  { id: 'lib-mat', match: 'Material Cost|Giá Vật', waitMs: 1300 },
  { id: 'settings', match: 'Settings|Cài đặt', waitMs: 1300 },
  { id: 'help', match: '^Help$|Hướng dẫn', waitMs: 1400 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

try {
  console.log(`→ Login as ${USERNAME} at ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[type=password]', { timeout: 10000 });
  await page.evaluate((u) => {
    const input = [...document.querySelectorAll('input')].find(
      (i) =>
        i.type !== 'password' &&
        /user|name/i.test(i.placeholder + ' ' + i.name + ' ' + (i.labels?.[0]?.innerText || ''))
    );
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
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
    const btn = [...document.querySelectorAll('button')].find(
      (b) => /sign\s*in/i.test(b.textContent) && !/change/i.test(b.textContent)
    );
    btn?.click();
  });

  // Demo user has totp_required = false so we should land on the shell.
  // Guard: if we DO hit a 2FA page, bail cleanly.
  await Promise.race([
    page.waitForSelector('.sidebar', { timeout: 12000 }),
    page
      .waitForFunction(() => /2-Step|Authenticator/i.test(document.body.innerText), {
        timeout: 12000,
      })
      .then(() => {
        throw new Error('demo user has 2FA enabled — disable it first');
      }),
  ]);
  await new Promise((r) => setTimeout(r, 800));
  console.log(`✓ Logged in.`);

  // ── Dismiss the "unread messages" popup + chat bubble ───────
  // The Messages module pops a modal on first session entry showing
  // unread count, AND spawns a chat-bubble launcher at bottom-right
  // that floats over every tab. Both ruin screenshots.
  //
  // Strategy: retry up to 3× with 200 ms gaps — the modal sometimes
  // mounts 200-500 ms AFTER the sidebar, so a single pass misses it.
  async function dismissOverlays() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const didSomething = await page.evaluate(() => {
        let found = false;
        // Specific: "Để sau" / "Later" / "Maybe later" / "Not now"
        const later = [...document.querySelectorAll('button')].find((b) => {
          if (b.offsetParent === null) return false; // hidden
          const t = b.textContent.trim().toLowerCase();
          return /^(để sau|later|maybe later|not now|dismiss|sau)$/i.test(t);
        });
        if (later) {
          later.click();
          found = true;
        }
        // Generic close × inside a modal/dialog container
        const closeX = [...document.querySelectorAll('button')].find((b) => {
          if (b.offsetParent === null) return false;
          const t = b.textContent.trim();
          if (!/^[×✕✖xX]$/.test(t)) return false;
          return !!b.closest(
            '[role=dialog], .modal, [class*="modal"], [class*="popup"], [class*="overlay"]'
          );
        });
        if (closeX) {
          closeX.click();
          found = true;
        }
        // Hide chat-bubble launcher (bottom-right). Cover common class + id
        // patterns without knowing the exact framework used.
        const hideSelectors = [
          '.chat-launcher',
          '[class*="chat-launcher"]',
          '[class*="chat-bubble"]',
          '.chat-widget',
          '[class*="chat-launch"]',
          '[class*="ChatLaunch"]',
          '[id*="intercom"]',
          '[id*="drift"]',
          '[class*="messenger-bubble"]',
          // Tailwind/positioned floating buttons in bottom-right with badges
        ];
        for (const sel of hideSelectors) {
          for (const el of document.querySelectorAll(sel)) {
            if (el.style.display !== 'none') {
              el.style.display = 'none';
              found = true;
            }
          }
        }
        return found;
      });
      if (!didSomething) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // Inject a global CSS rule to keep the chat bubble hidden across
    // route changes (chat launcher re-mounts on SPA nav).
    await page
      .addStyleTag({
        content: `
      [class*="chat-launcher"], [class*="chat-bubble"], [class*="ChatLaunch"],
      .chat-widget, [id*="intercom"], [id*="drift"], [class*="messenger-bubble"] {
        display: none !important;
      }
    `,
      })
      .catch(() => {});
  }
  await dismissOverlays();

  // Sidebar overview — include the Help entry being visible.
  await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-overview.png'), fullPage: false });

  // ── Main capture loop ──────────────────────────────────────
  for (const tab of TABS) {
    console.log(`  · ${tab.id}`);
    await page.evaluate((m) => {
      const re = new RegExp(m, 'i');
      const items = [...document.querySelectorAll('.nav-item')];
      const match = items.find((b) => re.test(b.textContent));
      match?.click();
    }, tab.match);
    await new Promise((r) => setTimeout(r, tab.waitMs));
    // Dismiss any fresh popups that appeared after navigation (Messages
    // modal sometimes re-fires; toast notifications can linger).
    await dismissOverlays();
    await page.screenshot({ path: path.join(OUT_DIR, `${tab.id}.png`), fullPage: false });
  }

  // ── Quote History — open a real quote for a non-empty screenshot ──
  console.log('  · quote-history-detail (opening a real quote)');
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.nav-item')].find((b) =>
      /Quote History|Lịch sử/i.test(b.textContent)
    );
    item?.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  const opened = await page.evaluate(() => {
    // Click the first row in the quote history table.
    const row = document.querySelector('table tbody tr, .quote-history-row, [data-quote-id]');
    if (row) {
      row.click();
      return true;
    }
    return false;
  });
  if (opened) {
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({
      path: path.join(OUT_DIR, 'quote-history-opened.png'),
      fullPage: false,
    });
  }

  console.log(`\n✓ Saved ${TABS.length + 2} screenshots to ${OUT_DIR}`);
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
