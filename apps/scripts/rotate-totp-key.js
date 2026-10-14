#!/usr/bin/env node
/**
 * rotate-totp-key — Phase 9N.2
 *
 * Rotates the OPS_TOTP_KEY master key by:
 *   1. Loading totp_secrets.enc with the CURRENT key (from env)
 *   2. Swapping the key in memory to a new 32-byte random value
 *      (or a caller-supplied hex string)
 *   3. Re-encrypting + writing back to disk atomically
 *   4. Printing the new key so operators can update .env
 *
 * Usage:
 *   # Auto-generate a new 32-byte key:
 *   OPS_TOTP_KEY=<current-key> node scripts/rotate-totp-key.js
 *
 *   # Rotate to a specific key (e.g. from a password manager):
 *   OPS_TOTP_KEY=<current-key> node scripts/rotate-totp-key.js <new-hex-64-chars>
 *
 * Safety:
 *   - Runs as a standalone process so the live server never holds two
 *     keys at once. Stop the server before running.
 *   - Backs up the existing totp_secrets.enc to `.pre-rotation-<ts>`
 *     before writing the new ciphertext. If re-encrypt fails, restore
 *     the backup manually; do NOT delete the backup until you've
 *     verified TOTP login still works with the new key.
 *   - Writes the new key to stdout ONCE. Capture it immediately into
 *     your secrets manager; don't leave it in shell history.
 *
 * Exit codes:
 *   0  — rotation succeeded
 *   1  — missing current key / unreadable secrets file
 *   2  — invalid new key format
 *   3  — re-encrypt failed (backup preserved)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR
  ? path.isAbsolute(process.env.DATA_DIR)
    ? process.env.DATA_DIR
    : path.resolve(__dirname, '..', process.env.DATA_DIR)
  : path.resolve(__dirname, '..', 'server', 'data');
const SECRETS_PATH = path.join(DATA_DIR, 'Library', 'Users', 'totp_secrets.enc');

function die(code, msg) {
  console.error(`❌ ${msg}`);
  process.exit(code);
}

function readSecrets() {
  if (!fs.existsSync(SECRETS_PATH)) {
    die(1, `No TOTP secrets file at ${SECRETS_PATH}. Nothing to rotate.`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf-8'));
  } catch (e) {
    die(1, `totp_secrets.enc is not valid JSON: ${e.message}`);
  }
  return raw;
}

function decryptV2(enc, keyHex) {
  const key = Buffer.from(keyHex.slice(0, 64), 'hex');
  if (key.length !== 32) die(1, 'OPS_TOTP_KEY must be 64 hex chars (32 bytes).');
  const nonce = Buffer.from(enc.nonce, 'base64');
  const ct = Buffer.from(enc.data, 'base64');
  const tag = Buffer.from(enc.tag, 'base64');
  const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  if (enc.aad) decipher.setAAD(Buffer.from(enc.aad, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8'));
}

function encryptV2(secretsDict, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const nonce = crypto.randomBytes(12);
  const aad = Buffer.from('ops-totp-v2', 'utf-8');
  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(secretsDict), 'utf-8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    version: 'v2',
    alg: 'chacha20-poly1305',
    nonce: nonce.toString('base64'),
    data: ct.toString('base64'),
    tag: tag.toString('base64'),
    aad: aad.toString('base64'),
    rotated_at: new Date().toISOString(),
  };
}

async function main() {
  const currentKey = process.env.OPS_TOTP_KEY || '';
  if (currentKey.length < 64) {
    die(1, 'OPS_TOTP_KEY env var must be set to the CURRENT 64-hex master key.');
  }

  const cliNewKey = process.argv[2];
  let newKeyHex;
  if (cliNewKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(cliNewKey)) {
      die(2, 'New key must be exactly 64 hex characters.');
    }
    newKeyHex = cliNewKey.toLowerCase();
  } else {
    newKeyHex = crypto.randomBytes(32).toString('hex');
  }

  const enc = readSecrets();
  if ((enc.version || 'v2') !== 'v2') {
    die(
      1,
      `Only v2 (ChaCha20-Poly1305) secrets can be rotated; this file is ${enc.version}. Re-save via a live server first.`
    );
  }

  // Decrypt with CURRENT key.
  let secrets;
  try {
    secrets = decryptV2(enc, currentKey);
  } catch (e) {
    die(
      1,
      `Failed to decrypt with current OPS_TOTP_KEY — is the env value correct? (${e.message})`
    );
  }

  const userCount = Object.keys(secrets).length;
  if (userCount === 0) {
    console.warn('⚠️  Secrets file decrypted OK but is empty (no TOTP-enrolled users).');
  }

  // Backup BEFORE writing. Never overwrite without a safety net.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${SECRETS_PATH}.pre-rotation-${stamp}`;
  fs.copyFileSync(SECRETS_PATH, backupPath);

  // Re-encrypt with new key + atomic rename.
  try {
    const reEnc = encryptV2(secrets, newKeyHex);
    const tmp = `${SECRETS_PATH}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(reEnc, null, 2));
    fs.renameSync(tmp, SECRETS_PATH);
  } catch (e) {
    die(3, `Re-encrypt failed: ${e.message}. Backup preserved at ${backupPath}.`);
  }

  console.log('');
  console.log('✅ TOTP master key rotated successfully.');
  console.log(`   Users re-encrypted: ${userCount}`);
  console.log(`   Backup (old key):   ${backupPath}`);
  console.log('');
  console.log('🔑 NEW OPS_TOTP_KEY (copy to .env + restart server):');
  console.log('');
  console.log(`   ${newKeyHex}`);
  console.log('');
  console.log('⚠️  REMEMBER:');
  console.log('   1. Update OPS_TOTP_KEY in .env (or secrets manager).');
  console.log('   2. Restart the server so the new key loads.');
  console.log('   3. Verify TOTP login works for at least one test user.');
  console.log('   4. ONLY THEN delete the .pre-rotation backup.');
  console.log('');
}

main().catch((err) => die(3, err.message));
