// Tổng hợp kết quả audit thành SUMMARY.md. Dùng: node audit/summarize.mjs <thư mục report>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const read = (f) => {
  try {
    return fs.readFileSync(path.join(dir, f), 'utf8');
  } catch {
    return null;
  }
};
const lines = [];
const gate = []; // các mục chặn release

lines.push(`# Ops-Control audit – ${path.basename(dir)}`, '');

// 1. npm audit
lines.push('## 1. Thư viện phụ thuộc (npm audit, production)', '');
for (const name of fs.readdirSync(dir).filter((f) => f.startsWith('npm-audit-'))) {
  const t = read(name) || '';
  const m =
    t.match(/(\d+) vulnerabilities? \(([^)]*)\)/) ||
    t.match(/(\d+) (?:high|critical|moderate|low) severity vulnerabilit(?:y|ies)/) ||
    t.match(/found (\d+) vulnerabilities/);
  const zero = /found 0 vulnerabilities/.test(t);
  const hi = /(\d+) (?:high|critical)(?: severity)?/g;
  let hc = 0,
    mm;
  while ((mm = hi.exec(t))) hc += Number(mm[1]);
  lines.push(
    `- ${name.replace('npm-audit-', '').replace('.txt', '')}: ${zero ? 'sạch' : m ? m[0] : 'xem file'}`
  );
  if (hc > 0) gate.push(`${hc} CVE high/critical trong ${name}`);
}
const al = read('allowlist-check.txt');
if (al)
  lines.push(
    `- allowlist: ${/fail|expired|error/i.test(al) ? '!! có vấn đề – xem allowlist-check.txt' : 'OK'}`
  );
lines.push('');

// 2. secrets
lines.push('## 2. Secrets', '');
const gl = read('gitleaks.csv');
if (gl !== null) {
  const n = Math.max(0, gl.trim().split('\n').length - 1);
  lines.push(`- gitleaks: ${n} finding`);
  if (n) gate.push(`${n} secret theo gitleaks`);
} else {
  const sg = read('secrets-grep.txt') || '';
  const n = sg.trim() ? sg.trim().split('\n').length : 0;
  lines.push(`- grep cơ bản: ${n} dòng nghi ngờ (kiểm tra tay, hay có false positive)`);
}
const ts = (read('tracked-sensitive.txt') || '').trim();
lines.push(`- file nhạy cảm bị git theo dõi: ${ts ? '!! ' + ts.split('\n').join(', ') : 'không'}`);
if (ts) gate.push('file nhạy cảm đang được commit');
lines.push('');

// 3. semgrep
lines.push('## 3. Semgrep', '');
for (const f of ['semgrep-custom.json', 'semgrep-registry.json']) {
  const raw = read(f);
  if (!raw) {
    lines.push(`- ${f}: không chạy`);
    continue;
  }
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    lines.push(`- ${f}: lỗi đọc`);
    continue;
  }
  const bySev = {};
  for (const r of d.results || []) bySev[r.extra.severity] = (bySev[r.extra.severity] || 0) + 1;
  lines.push(
    `- ${f}: ${
      Object.entries(bySev)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'sạch'
    }`
  );
  if (bySev.ERROR) gate.push(`${bySev.ERROR} finding ERROR trong ${f}`);
  const top = (d.results || []).filter((r) => r.extra.severity !== 'INFO').slice(0, 40);
  for (const r of top) {
    lines.push(
      `  - [${r.extra.severity}] ${r.check_id.split('.').pop()} – ${r.path}:${r.start.line}`
    );
    lines.push(`    ${r.extra.message.split('\n')[0]}`);
  }
}
lines.push('');

// 4. electronegativity
lines.push('## 4. Electronegativity', '');
const en = read('electronegativity.csv');
if (en) {
  const rows = en.trim().split('\n').slice(1);
  lines.push(`- ${rows.length} finding (severity >= medium)`);
  for (const r of rows.slice(0, 30)) lines.push(`  - ${r}`);
} else lines.push('- không chạy');
lines.push('');

// gate
lines.push('## Kết luận', '');
if (gate.length) {
  lines.push('**CHƯA ĐẠT – chặn release:**', '');
  for (const g of gate) lines.push(`- ${g}`);
} else {
  lines.push('**Tự động: ĐẠT.** Còn phần kiểm tra tay trong audit/CHECKLIST.md.');
}
console.log(lines.join('\n'));
