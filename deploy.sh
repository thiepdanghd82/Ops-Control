#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Ops Control v1.2 — Deploy to Production Server (Linux)
# ═══════════════════════════════════════════════════════════════
#
# Usage:
#   ./deploy.sh                    # Deploy to localhost
#   ./deploy.sh user@server-ip     # Deploy to remote server via SSH
#
# Prerequisites on server:
#   - Node.js 18+ with npm
#   - (Optional) nginx for reverse proxy
#
# Counterpart for Windows targets: deploy.ps1 (NSSM service).
#
# Sprint S-P0-FIX-1 (2026-05-03) — DATA_DIR is now driven by .env
# (defaulting to ./server/data per .env.example) instead of a stale
# systemd Environment= line that pointed at the v1.0 legacy folder.
# ═══════════════════════════════════════════════════════════════

set -e

REMOTE="$1"
APP_NAME="ops-control"
APP_DIR="/opt/$APP_NAME"
PORT=3000
PYTHON_PORT=5173

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║       Ops Control v1.2 — Deploy Script          ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# ── Build client locally first ────────────────────────────
echo "  🔨  Building client..."
cd "$(dirname "$0")"
cd client && npx vite build && cd ..
echo "  ✓  Client built"
echo ""

if [ -z "$REMOTE" ]; then
    # ── Local deployment ──────────────────────────────────
    echo "  📂  Deploying locally..."
    echo "  ✓  App ready at: http://localhost:$PORT"
    echo ""
    echo "  Start with: node server/index.js"
    echo "  Or:         ./START_SERVER.command"
    exit 0
fi

# ── Remote deployment via SSH ─────────────────────────────
echo "  🚀  Deploying to $REMOTE..."
echo ""

# Create app directory on remote
ssh "$REMOTE" "mkdir -p $APP_DIR/{server,client/dist}"

# ── Preserve the FULL remote .env across deploys ───────────────
# Sprint 11 P2-1 protected OPS_TOTP_KEY only; Sprint 1.7 audit (§8)
# found that EVERY OTHER env var (OPS_BACKUP_SCHEDULE, OPS_BACKUP_WEBHOOK,
# OPS_CORS_ORIGINS, OPS_DB_PATH, OPS_DATA_BACKEND, OPS_PWD_MAX_AGE_DAYS,
# OPS_BACKUP_RETENTION_DAYS, OPS_REQUIRE_2FA_ROLES, …) was being clobbered
# on each deploy → backups silently turned off, CORS reverted, etc. Read
# the WHOLE remote .env into a tempfile here, merge it back AFTER the
# rsync, and only then add brand-new keys from the new release's .env.example.
echo "  🔐  Reading existing remote .env (preserves all operator-set values)..."
REMOTE_ENV_TMP=$(mktemp)
ssh "$REMOTE" "cat $APP_DIR/.env 2>/dev/null" > "$REMOTE_ENV_TMP" || true
EXISTING_TOTP_KEY=$(grep -E '^OPS_TOTP_KEY=' "$REMOTE_ENV_TMP" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EXISTING_KIOSK_KEY=$(grep -E '^OPS_KIOSK_KEY=' "$REMOTE_ENV_TMP" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EXISTING_EXPORT_HMAC_KEY=$(grep -E '^OPS_EXPORT_HMAC_KEY=' "$REMOTE_ENV_TMP" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EXISTING_LICENSE_PUBKEY=$(grep -E '^OPS_LICENSE_PUBKEY=' "$REMOTE_ENV_TMP" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EXISTING_KEY_COUNT=$(wc -l < "$REMOTE_ENV_TMP" | tr -d ' ')
if [ "$EXISTING_KEY_COUNT" -gt 0 ]; then
    echo "  ✓  Captured ${EXISTING_KEY_COUNT} existing env line(s) for merge-back"
fi
if [ -n "$EXISTING_TOTP_KEY" ]; then
    echo "  ✓  Preserving existing OPS_TOTP_KEY (${#EXISTING_TOTP_KEY} chars)"
else
    echo "  ⚠   No existing OPS_TOTP_KEY — operator must set one before boot."
    echo "      Without it, the server refuses to start in NODE_ENV=production."
fi
# Sprint MES-2.3 — kiosk JWT signing key (mirrors OPS_TOTP_KEY semantics).
# Whole-file merge below preserves the value automatically; this line is
# only here to surface the state in the deploy log so a missing key
# isn't silently inherited from .env.example on a fresh box.
if [ -n "$EXISTING_KIOSK_KEY" ]; then
    echo "  ✓  Preserving existing OPS_KIOSK_KEY (${#EXISTING_KIOSK_KEY} chars)"
else
    echo "  ⚠   No existing OPS_KIOSK_KEY — operator must set one before boot."
    echo "      Without it, kiosk pairings can't be issued in NODE_ENV=production."
    echo "      Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
fi
# Sprint S-EXPORT-MVP-2 — HMAC key for quote xlsx tamper detection.
# Same preservation semantics. Whole-file merge below carries the value;
# this block surfaces missing-key state in the deploy log.
if [ -n "$EXISTING_EXPORT_HMAC_KEY" ]; then
    echo "  ✓  Preserving existing OPS_EXPORT_HMAC_KEY (${#EXISTING_EXPORT_HMAC_KEY} chars)"
else
    echo "  ⚠   No existing OPS_EXPORT_HMAC_KEY — operator must set one before boot."
    echo "      Without it, quote xlsx exports cannot be HMAC-signed. Server"
    echo "      refuses to start in NODE_ENV=production (see preflight)."
    echo "      Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
fi
# Sprint S-D21-LICENSE-FIX 2026-06-09 — Ed25519 SPKI PEM for license
# validation (server/services/licenseService.js + desktop/license.js).
# Whole-file merge preserves the value; this block surfaces missing-key
# state. Without it server boots OK (legacy preflight didn't gate it)
# but every license check fails → all users locked out post-deploy.
# Preflight now gates this key (PR fix/d21-license-pubkey-preserve).
if [ -n "$EXISTING_LICENSE_PUBKEY" ]; then
    echo "  ✓  Preserving existing OPS_LICENSE_PUBKEY (${#EXISTING_LICENSE_PUBKEY} chars)"
else
    echo "  ⚠   No existing OPS_LICENSE_PUBKEY — operator must set one before boot."
    echo "      Without it, all license validations fail → all users locked out."
    echo "      Source: prod-public.pem from offline license keypair."
fi
echo ""

# ── Backup-before-deploy (Sprint 1.7 audit §3) ────────────────
# Snapshot the live app dir to releases/<timestamp> BEFORE rsync
# overwrites it, so a botched deploy is one `ln -s + restart` away
# from rollback. We do NOT version the data/Library dirs (those stay
# shared via a symlink so user data keeps accumulating across releases).
# Retention: keep the last 5 release snapshots; older ones are pruned.
DEPLOY_TS=$(date +%Y%m%d-%H%M%S)
echo "  🗄  Snapshotting current $APP_DIR → releases/$DEPLOY_TS for rollback…"
ssh "$REMOTE" "set -e
mkdir -p $APP_DIR/releases
if [ -d $APP_DIR/server ] && [ ! -L $APP_DIR/server ]; then
  # First-time migration to the versioned layout — copy the LIVE state
  # into releases/<ts>-pre-versioning, leave data/ in place at the root.
  PREV_TS=\$(date -d '1 minute ago' +%Y%m%d-%H%M%S 2>/dev/null || date +%Y%m%d-%H%M%S)
  mkdir -p $APP_DIR/releases/\${PREV_TS}-pre-versioning
  cp -R --parents $APP_DIR/server $APP_DIR/client $APP_DIR/scripts $APP_DIR/package.json $APP_DIR/package-lock.json $APP_DIR/releases/\${PREV_TS}-pre-versioning/ 2>/dev/null || true
fi
# Prune older snapshots — keep the 5 most recent.
ls -1t $APP_DIR/releases 2>/dev/null | tail -n +6 | xargs -I {} rm -rf $APP_DIR/releases/{} || true"

# Sync files (excluding node_modules, .git, etc.)
echo "  📤  Uploading files..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'client/node_modules' \
    --exclude 'client/src' \
    --exclude 'client/public' \
    --exclude '*.command' \
    --exclude '*.bat' \
    --exclude 'releases' \
    --exclude 'server/data' \
    ./ "$REMOTE:$APP_DIR/"

# Upload built client
rsync -avz --progress \
    client/dist/ "$REMOTE:$APP_DIR/client/dist/"

echo ""

# ── Merge the captured remote .env back into the deployed .env ──
# Sprint 1.7 audit §8 fix. Strategy: take the WHOLE captured remote .env
# as the authoritative source, then APPEND any new keys present in the
# new release's .env.example that the captured file lacked. Existing
# values win — we never overwrite an operator-set var.
if [ -s "$REMOTE_ENV_TMP" ]; then
    echo "  📝  Merging captured remote .env back (preserves all operator values)..."
    # Add new keys from .env.example if missing in remote
    MERGE_TMP=$(mktemp)
    cp "$REMOTE_ENV_TMP" "$MERGE_TMP"
    if [ -f .env.example ]; then
        while IFS= read -r line; do
            # skip comments + blanks
            case "$line" in
                ''|\#*) continue ;;
            esac
            key="${line%%=*}"
            if ! grep -qE "^${key}=" "$MERGE_TMP"; then
                echo "$line" >> "$MERGE_TMP"
                echo "    + new key: $key"
            fi
        done < .env.example
    fi
    scp -q "$MERGE_TMP" "$REMOTE:$APP_DIR/.env"
    ssh "$REMOTE" "chmod 600 $APP_DIR/.env"
    rm -f "$MERGE_TMP" "$REMOTE_ENV_TMP"
else
    echo "  ⚠   No prior remote .env — leaving .env.example as-is for first-time install."
    rm -f "$REMOTE_ENV_TMP"
fi

# ── Preflight gate before restart ─────────────────────────────
# Sprint 1.7 audit §8: catch missing/invalid env vars BEFORE flipping
# systemd. A failed preflight aborts the deploy with a clear error
# instead of leaving systemd in restart-loop with the new bundle.
echo "  🔎  Running preflight against staged .env..."
if ! ssh "$REMOTE" "cd $APP_DIR && NODE_ENV=production npm run preflight"; then
    echo "  ✘  Preflight failed — refusing to restart the service."
    echo "     The new bundle is uploaded but NOT yet activated. Fix .env"
    echo "     on the remote, then re-run this deploy.sh to retry."
    exit 1
fi

echo "  📦  Installing dependencies on server..."
ssh "$REMOTE" "cd $APP_DIR && npm install --production"

# Create systemd service
echo "  ⚙️   Setting up systemd service..."
ssh "$REMOTE" "cat > /tmp/$APP_NAME.service << 'UNIT'
[Unit]
Description=Ops Control v1.2
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR
# DATA_DIR + every other env var is read from $APP_DIR/.env at startup.
# Sprint S-P0-FIX-1: the previous Environment=DATA_DIR=…/COST_V1.0/… was
# a v1.0 legacy carry-over. .env (preserved across deploys per the merge
# logic above) is now the single source of truth. dotenv default is
# no-override, so any matching Environment= line below would still mask
# the .env value — keep this list minimal and defer to .env.
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo mv /tmp/$APP_NAME.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable $APP_NAME
sudo systemctl restart $APP_NAME"

echo ""

# Create nginx config (optional)
echo "  🌐  Creating nginx config..."
ssh "$REMOTE" "cat > /tmp/$APP_NAME.nginx << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
sudo mv /tmp/$APP_NAME.nginx /etc/nginx/sites-available/$APP_NAME
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "  ══════════════════════════════════════════"
echo "  ✅  Deploy complete!"
echo ""
echo "  URL:     http://$REMOTE"
echo "  Status:  ssh $REMOTE 'systemctl status $APP_NAME'"
echo "  Logs:    ssh $REMOTE 'journalctl -u $APP_NAME -f'"
echo "  ══════════════════════════════════════════"
