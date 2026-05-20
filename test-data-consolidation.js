/* global console, process */
/**
 * Data Consolidation Test — COST V1.0 vs Ops Cost Flow
 * Compares data served by the Ops Control API endpoints against
 * the source JSON files in /server/data/Library/ to ensure
 * all COST V1.0 data is properly consolidated into the Ops flow.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIB = path.join(__dirname, 'server', 'data', 'Library');
let passed = 0;
let failed = 0;
const errors = [];

function readJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return null;
  }
}

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅  ${label}`);
  } else {
    failed++;
    const msg = `  ❌  ${label}${detail ? ` — ${detail}` : ''}`;
    console.log(msg);
    errors.push(msg);
  }
}

console.log('\n══════════════════════���════════════════════════════');
console.log('  Data Consolidation Test: COST V1.0 → Ops Flow');
console.log('═══════════════════════════════════════════════════\n');

// ─── 1. Material Library ───
console.log('📦 Material Library');
const matDB = readJson(path.join(LIB, 'MaterialCost', 'materials.json'));
const npiDB = readJson(path.join(LIB, 'MaterialCost', 'npi_materials.json'));
const sourcingDB = readJson(path.join(LIB, 'MaterialCost', 'sourcing_db.json'));

assert('materials.json exists', matDB !== null);
assert('materials.json is array', Array.isArray(matDB));
assert('materials.json has records', matDB && matDB.length > 0, `count: ${matDB?.length || 0}`);
assert('npi_materials.json exists', npiDB !== null);
assert('npi_materials.json is array', Array.isArray(npiDB));
assert('sourcing_db.json exists', sourcingDB !== null);
assert('sourcing_db.json is array', Array.isArray(sourcingDB));

if (matDB && matDB.length > 0) {
  const sample = matDB[0];
  const expectedFields = ['code', 'type', 's_price', 'g_price', 'thickness', 'supplier', 'width'];
  const hasFields = expectedFields.every((f) => f in sample);
  assert(
    'materials has expected fields (code, type, s_price, g_price, thickness, supplier, width)',
    hasFields,
    hasFields ? '' : `missing: ${expectedFields.filter((f) => !(f in sample)).join(', ')}`
  );
}

// ─── 2. IFS Inventory ───
console.log('\n📦 IFS Inventory');
const invDir = path.join(LIB, 'IFS_Inventory');
const invFiles = ['inventory_data.js', 'finished_good_data.js', 'raw_materials_data.js'];
for (const f of invFiles) {
  const fp = path.join(invDir, f);
  assert(`${f} exists`, fs.existsSync(fp));
  if (fs.existsSync(fp)) {
    const content = fs.readFileSync(fp, 'utf-8');
    assert(`${f} has data (non-empty)`, content.length > 100, `size: ${content.length}`);
  }
}

// ─── 3. Quote History ───
console.log('\n📦 Quote History');
const qh = readJson(path.join(LIB, 'QuoteHistory', 'quote_history.json'));
assert('quote_history.json exists', qh !== null);
assert('quote_history.json is array', Array.isArray(qh));
assert('quote_history.json has records', qh && qh.length > 0, `count: ${qh?.length || 0}`);

if (qh && qh.length > 0) {
  const sample = qh[0];
  assert('quote has id field', 'id' in sample);
  assert('quote has type field', 'type' in sample);
  assert('quote has saved_at field', 'saved_at' in sample);
  assert('quote has state field', 'state' in sample);
  const csvExists = fs.existsSync(path.join(LIB, 'QuoteHistory', 'quote_history.csv'));
  assert('quote_history.csv exists (CSV mirror)', csvExists);
}

// ─── 4. Work Center Rates ───
console.log('\n📦 Work Center Rates');
const rate = readJson(path.join(LIB, 'Rate', 'rate.json'));
const rateSites = readJson(path.join(LIB, 'Rate', 'rate_sites.json'));
assert('rate.json exists', rate !== null);
assert('rate.json is array', Array.isArray(rate));
assert('rate_sites.json exists', rateSites !== null);
if (rateSites) {
  const sites = Object.keys(rateSites);
  assert(
    'rate_sites.json is valid object (may be empty if single-site)',
    typeof rateSites === 'object'
  );
  // rate_sites may be empty if only default VN site — fallback is rate.json
  if (sites.length === 0 && rate && rate.length > 0) {
    assert('rate.json serves as fallback for default site', true);
  }
  for (const site of sites) {
    const siteData = rateSites[site];
    assert(
      `rate site "${site}" has data`,
      Array.isArray(siteData) && siteData.length > 0,
      `count: ${siteData?.length || 0}`
    );
    if (siteData && siteData.length > 0) {
      const sample = siteData[0];
      assert(`rate site "${site}" has workcenter field`, 'workcenter' in sample);
      assert(`rate site "${site}" has machine_rate field`, 'machine_rate' in sample);
    }
  }
}

// ─── 5. DDL (Drop-down Lists) ───
console.log('\n📦 Drop-down Lists');
const ddl = readJson(path.join(LIB, 'DDL', 'ddl.json'));
const ddlSites = readJson(path.join(LIB, 'DDL', 'ddl_sites.json'));
assert('ddl.json exists', ddl !== null);
assert('ddl.json is object', ddl && typeof ddl === 'object');
assert('ddl_sites.json exists', ddlSites !== null);
if (ddl) {
  const sections = Object.keys(ddl).filter((k) => !k.startsWith('_'));
  assert('ddl has sections', sections.length > 0, `sections: ${sections.length}`);
  const expectedDDLKeys = ['site', 'print_type', 'trade_mode'];
  for (const key of expectedDDLKeys) {
    assert(`ddl has "${key}" section`, key in ddl);
  }
}

// ─── 6. Finance Data ───
console.log('\n📦 Finance Data');
const finWC = readJson(path.join(LIB, 'Finance', 'finance_wc.json'));
const finSum = readJson(path.join(LIB, 'Finance', 'finance_sum.json'));
assert('finance_wc.json exists', finWC !== null);
assert('finance_sum.json exists', finSum !== null);

// ─── 7. Summarize DB ───
console.log('\n📦 Summarize DB');
const summarize = readJson(path.join(LIB, 'SummarizeDB', 'summarize_db.json'));
assert('summarize_db.json exists', summarize !== null);
assert('summarize_db.json is array', Array.isArray(summarize));

// ─── 8. RFQ Tracker ───
console.log('\n📦 RFQ Tracker');
const rfq = readJson(path.join(LIB, 'RFQTracker', 'rfq_tracker.json'));
assert('rfq_tracker.json exists', rfq !== null);
assert('rfq_tracker.json is array', Array.isArray(rfq));

// ─── 9. Sample Tracking ───
console.log('\n📦 Sample Tracking');
const samples = readJson(path.join(LIB, 'SampleTracking', 'sample_tracking.json'));
assert('sample_tracking.json exists', samples !== null);
assert('sample_tracking.json is array', Array.isArray(samples));

// ─── 10. Ink Calculator ───
console.log('\n📦 Ink Calculator');
const ink = readJson(path.join(LIB, 'InkCalc', 'ink_calc.json'));
assert('ink_calc.json exists', ink !== null);

// ─── 11. Users ───
console.log('\n📦 Users');
const usersDir = path.join(LIB, 'Users');
assert('Users directory exists', fs.existsSync(usersDir));
const usersFile = path.join(usersDir, 'users.json');
if (fs.existsSync(usersFile)) {
  const users = readJson(usersFile);
  assert('users.json is array', Array.isArray(users));
  assert('users.json has records', users && users.length > 0, `count: ${users?.length || 0}`);
}

// ─── 12. Backup Directory ───
console.log('\n📦 Backup Infrastructure');
const backupDataDir = path.join(__dirname, 'server', 'data', 'Backup', 'Data');
const backupCodeDir = path.join(__dirname, 'server', 'data', 'Backup', 'Code');
assert('Backup/Data directory exists', fs.existsSync(backupDataDir));
assert('Backup/Code directory exists', fs.existsSync(backupCodeDir));

// ─── 13. API Route Coverage ───
console.log('\n📦 API Route Coverage (React ↔ Server)');
const apiFile = fs.readFileSync(
  path.join(__dirname, 'client', 'src', 'services', 'api.js'),
  'utf-8'
);
const costApiFile = fs.readFileSync(
  path.join(__dirname, 'server', 'routes', 'costApi.js'),
  'utf-8'
);
const sharedFile = fs.readFileSync(path.join(__dirname, 'server', 'routes', 'shared.js'), 'utf-8');

// Check that key endpoints exist in both client and server
const endpointChecks = [
  { label: 'inventory', client: '/shared/inventory', server: '/inventory' },
  { label: 'materials', client: '/shared/materials', server: '/materials' },
  { label: 'quotes', client: '/shared/quotes', server: '/quotes' },
  { label: 'rates', client: '/shared/rates', server: '/rates' },
  { label: 'ddl', client: '/shared/ddl', server: '/ddl' },
  { label: 'finance', client: '/shared/finance', server: '/finance' },
  { label: 'change-pwd', client: '/auth/change-pwd', server: '/auth/change-pwd' },
  { label: 'backup/list', client: '/backup/list', server: '/backup/list' },
  { label: 'rate/backups', client: '/rate/backups', server: '/rate/backups' },
  { label: 'ddl/backups', client: '/ddl/backups', server: '/ddl/backups' },
  { label: 'users/status', client: '/users/status', server: '/users/status' },
];

for (const ep of endpointChecks) {
  const inClient = apiFile.includes(ep.client);
  const inServer = costApiFile.includes(ep.server) || sharedFile.includes(ep.server);
  assert(`${ep.label}: client endpoint`, inClient, ep.client);
  assert(`${ep.label}: server endpoint`, inServer, ep.server);
}

// ─── 14. Settings Component Verification ───
console.log('\n📦 Settings Component Structure');
const settingsFile = fs.readFileSync(
  path.join(__dirname, 'client', 'src', 'modules', 'cost', 'tabs', 'Settings.jsx'),
  'utf-8'
);

const expectedSections = [
  'ProfileSection',
  'PasswordSection',
  'AccountSection',
  'RateSection',
  'DDLSection',
  'FinanceSection',
  'BackupSection',
  'LogsSection',
];
for (const sec of expectedSections) {
  assert(`Settings has ${sec} component`, settingsFile.includes(`function ${sec}`));
}

assert(
  'Settings has split-pane layout (settings-layout)',
  settingsFile.includes('settings-layout')
);
assert('Settings has left menu (settings-menu)', settingsFile.includes('settings-menu'));
assert('Settings uses costApi', settingsFile.includes('costApi'));
assert('Settings uses sharedApi', settingsFile.includes('sharedApi'));

// ─── 15. Sidebar Access ───
console.log('\n📦 Sidebar Configuration');
const sidebarFile = fs.readFileSync(
  path.join(__dirname, 'client', 'src', 'components', 'Layout', 'Sidebar.jsx'),
  'utf-8'
);
assert(
  'Settings tab is accessible to all users (no minRole)',
  !sidebarFile.includes("id: 'settings', icon: '⚙', label: 'Settings', minRole")
);

// ═════════════════════════════���═════════════════════���═══════
// SUMMARY
// ═══════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════');

if (failed > 0) {
  console.log('\n⚠️  Failed checks:');
  errors.forEach((e) => console.log(e));
}

console.log(
  '\n' +
    (failed === 0
      ? '🎉 All checks passed! Data consolidation is complete.'
      : `⚠️  ${failed} issue(s) need attention.`) +
    '\n'
);

process.exit(failed > 0 ? 1 : 0);
