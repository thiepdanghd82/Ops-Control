// MES-2.8 — Playwright globalSetup. Writes feature-flags.json into the
// isolated test DATA_DIR so mountPlanning() runs and the kiosk routes
// register. This runs ONCE before the webServer is started.
import fs from 'node:fs';
import path from 'node:path';
import { TEST_PATHS } from '../../playwright.config.js';

export default function globalSetup() {
  const cfgDir = path.join(TEST_PATHS.TEST_DATA_DIR, 'Library', 'SystemConfig');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, 'feature-flags.json'),
    JSON.stringify({ 'mes.workOrder.enabled': true }, null, 2)
  );
  // Seed an empty MachineProfiles file so the kiosks router's machine
  // validator finds something. Tests overwrite it via fixtures as needed.
  const mpDir = path.join(TEST_PATHS.TEST_DATA_DIR, 'Library', 'MachineProfiles');
  fs.mkdirSync(mpDir, { recursive: true });
  fs.writeFileSync(
    path.join(mpDir, 'profiles.json'),
    JSON.stringify({ profiles: [{ id: 'TEST-MACHINE-01', name: 'Test Machine 01' }] }, null, 2)
  );
}
