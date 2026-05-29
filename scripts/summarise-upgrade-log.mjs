#!/usr/bin/env node
/**
 * summarise-upgrade-log.mjs — produces a one-line-per-phase digest
 * of UPGRADE_LOG.md so engineers reviewing the migration can see
 * the shape without reading 700 lines.
 *
 * Usage:
 *   node scripts/summarise-upgrade-log.mjs
 *   node scripts/summarise-upgrade-log.mjs --markdown   # emit markdown table
 *   node scripts/summarise-upgrade-log.mjs --json       # emit JSON for tooling
 *
 * Output (default):
 *   Phase 0 — Scaffolding                              · 2026-04-29 18:06 GMT+7
 *   Phase 1 — Security hardening                       · 2026-04-29 18:30 GMT+7
 *   ...
 *
 * The parser looks for `### Phase X — <title> · <ts>` headings, which
 * is the convention used throughout this log.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.resolve(__dirname, '..', 'UPGRADE_LOG.md');

function parsePhases(md) {
  const lines = md.split('\n');
  const out = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Heading: "### Phase <ID> — <title> · <timestamp>"
    const m = line.match(/^###\s+Phase\s+([\w.-]+)\s*[—-]\s*(.+?)\s*[·•]\s*(.+)$/);
    if (m) {
      if (current) out.push(current);
      current = {
        id: m[1].trim(),
        title: m[2].trim(),
        timestamp: m[3].trim(),
        tasks: [],
        commits: [],
      };
      continue;
    }

    if (!current) continue;

    // Bullet sub-task: "**P1.2 — title**"  or  "**X.Y — title**"
    const sub = line.match(/^\*\*([A-Z0-9]+(?:\.\d+)?)\s*[—-]\s*(.+?)\*\*\s*$/);
    if (sub) {
      current.tasks.push({ id: sub[1], title: sub[2].trim() });
      continue;
    }

    // Result line
    if (/^\s*\*\*Result:?\*\*/.test(line) || /^\s*Result:/.test(line)) {
      current.result = line
        .replace(/^\s*\*\*Result:?\*\*\s*/, '')
        .replace(/^\s*Result:\s*/, '')
        .trim();
    }
  }
  if (current) out.push(current);
  return out;
}

function formatPlain(phases) {
  const w = phases.reduce((m, p) => Math.max(m, p.title.length + p.id.length), 0);
  return phases
    .map((p) => {
      const head = `Phase ${p.id} — ${p.title}`;
      const pad = ' '.repeat(Math.max(2, w - head.length + 6));
      return `${head}${pad}· ${p.timestamp}  (${p.tasks.length} task${p.tasks.length !== 1 ? 's' : ''})`;
    })
    .join('\n');
}

function formatMarkdown(phases) {
  const rows = phases
    .map((p) => {
      const taskList =
        p.tasks.length > 0
          ? p.tasks.map((t) => `${t.id}: ${t.title.replace(/\|/g, '\\|')}`).join(' · ')
          : '—';
      return `| ${p.id} | ${p.title.replace(/\|/g, '\\|')} | ${p.timestamp} | ${p.tasks.length} | ${taskList} |`;
    })
    .join('\n');
  return [
    '| Phase | Title | Timestamp | Tasks | Sub-task IDs |',
    '|---|---|---|---|---|',
    rows,
  ].join('\n');
}

function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(`UPGRADE_LOG.md not found at ${LOG_PATH}`);
    process.exit(1);
  }
  const md = fs.readFileSync(LOG_PATH, 'utf8');
  const phases = parsePhases(md);

  if (phases.length === 0) {
    console.error('No phase headings found. Expected: "### Phase X — <title> · <ts>"');
    process.exit(2);
  }

  const flag = process.argv[2];
  if (flag === '--json') {
    console.log(JSON.stringify(phases, null, 2));
    return;
  }
  if (flag === '--markdown' || flag === '--md') {
    console.log(formatMarkdown(phases));
    return;
  }
  console.log(formatPlain(phases));
  console.log('');
  console.log(
    `Total: ${phases.length} phases · ${phases.reduce((s, p) => s + p.tasks.length, 0)} tracked sub-tasks`
  );
}

main();
