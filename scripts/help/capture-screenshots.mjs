/**
 * Headless-Chrome screenshot pass for the Help user guide.
 *
 * Runs puppeteer-core against the SYSTEM Chrome (no Chromium download),
 * logs into the dev server, navigates each Tier-1/2 tab, and saves
 * PNGs to `client/public/help/screenshots/`.
 *
 * Usage:
 *   node scripts/help/capture-screenshots.mjs --otp=<6-digit-code>
 *
 * The OTP is time-sensitive; script must finish within ~25 s after the
 * user reads it from Google Authenticator. Login + 8 tabs typically
 * completes in 12-15 s.
 *
 * Extend `TABS` to add more captures; each entry triggers a click on
 * the sidebar item with matching text, a ~1.2 s wait, and a
 * `<tab-id>.png` save at 1280×800.
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../client/public/help/screenshots');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.HELP_BASE_URL || 'http://localhost:5175';
const USERNAME = process.env.HELP_USERNAME || 'Administrator';
const PASSWORD = process.env.HELP_PASSWORD || 'Vicky@1982';

// Parse --otp=NNNNNN from argv
const otpArg = process.argv.find(a => a.startsWith('--otp='));
const OTP = otpArg ? otpArg.split('=')[1].trim() : null;
if (!OTP || !/^\d{6}$/.test(OTP)) {
  console.error('ERROR: pass --otp=<6-digit Google Authenticator code>');
  process.exit(1);
}

// Tabs to capture. `match` is a case-insensitive substring of the
// sidebar nav-item text (VN or EN — whichever is more specific).
const TABS = [
  { id: 'standard',        match: 'Standard',          waitMs: 1400 },
  { id: 'complex',         match: 'Complex',           waitMs: 1400 },
  { id: 'ink-calc',        match: 'Inks',              waitMs: 1400 },
  { id: 'print-area',      match: 'Print Area',        waitMs: 1600 },
  { id: 'summarize',       match: 'Cost Breakdown',    waitMs: 1200 },
  { id: 'formal-quote',    match: 'Formal Quot',       waitMs: 1200 },
  { id: 'approvals-inbox', match: 'Pending Approval',  waitMs: 1200 },
  { id: 'sample-tracking', match: 'Sample Track',      waitMs: 1200 },
  { id: 'dashboard',       match: 'Dashboard',         waitMs: 1500 },
  { id: 'quote-analysis',  match: 'Quote Analysis',    waitMs: 1500 },
  { id: 'settings',        match: 'Settings',          waitMs: 1200 },
  // Help tab itself — closes the loop: the user guide shows its own Help screen.
  { id: 'help',            match: 'Help',              waitMs: 1200 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

// Launch headless Chrome via system binary. `--no-sandbox` because the
// user may not have sandbox capabilities enabled for Chromium.
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
  args: ['--no-sandbox'],
});

const page = await browser.newPage();

try {
  // ── Login ────────────────────────────────────────────────────
  console.log(`→ Logging in at ${BASE} …`);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });

  await page.waitForSelector('input[type=password]', { timeout: 10000 });
  // Fill username — robust to placeholder variants.
  await page.evaluate((u) => {
    const inputs = [...document.querySelectorAll('input')];
    const user = inputs.find(i =>
      i.type !== 'password' &&
      /user|name/i.test(i.placeholder + ' ' + i.name + ' ' + (i.labels?.[0]?.innerText || '')));
    if (user) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(user, u);
      user.dispatchEvent(new Event('input', { bubbles: true }));
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

  // 2FA page
  await page.waitForFunction(() => /2-Step|Authenticator|Verification/i.test(document.body.innerText),
    { timeout: 10000 });
  console.log(`→ Entering 2FA code …`);
  await page.evaluate((code) => {
    const inp = document.querySelector('input[type=text], input[type=tel], input[type=number]');
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, code);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, OTP);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /verify/i.test(b.textContent));
    btn?.click();
  });

  // Wait for the sidebar to appear — signals a successful login.
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  console.log(`→ Login OK.`);

  // ── Capture loop ─────────────────────────────────────────────
  for (const tab of TABS) {
    console.log(`  … capturing ${tab.id}`);
    // Click the sidebar nav-item matching the text. Use evaluate so
    // click fires on the correct element even if it shares a prefix
    // with another tab (e.g. "Quote History" vs "Quote Analysis").
    await page.evaluate((m) => {
      const items = [...document.querySelectorAll('.nav-item')];
      const match = items.find(b => new RegExp(m, 'i').test(b.textContent));
      match?.click();
    }, tab.match);
    await new Promise(r => setTimeout(r, tab.waitMs));
    const out = path.join(OUT_DIR, `${tab.id}.png`);
    await page.screenshot({ path: out, fullPage: false });
  }

  console.log(`\n✓ Saved ${TABS.length} screenshots to ${OUT_DIR}`);
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
