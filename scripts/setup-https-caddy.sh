#!/usr/bin/env bash
#
# setup-https-caddy.sh — One-shot TLS reverse proxy for the LAN server.
#
# Why: the embedded/dedicated Express server is HTTP-only on port 3100.
# Browsers in 2026 treat plain HTTP as insecure (geolocation, clipboard,
# service workers all blocked). Caddy gives the LAN one self-signed cert
# (or trusted via mkcert) without needing to wire OpenSSL by hand.
#
# Two modes:
#
#   1. SELF-SIGNED (default)
#      Caddy generates an internal CA + per-name certs. Each LAN client
#      must trust the CA once (~/Library/Keychains on macOS, certutil on
#      Windows). Browsers stop yelling about NET::ERR_CERT_AUTHORITY_INVALID.
#
#   2. PUBLIC ACME (only if the host has a real DNS name resolvable
#      from the public Internet AND port 80 reachable for HTTP-01).
#      Pass --public ops.example.com to use Let's Encrypt.
#
# Pre-reqs: caddy v2.7+ on PATH (brew install caddy).
#
# Usage:
#   ./scripts/setup-https-caddy.sh                       # self-signed for current LAN IP
#   ./scripts/setup-https-caddy.sh ops.local             # self-signed for hostname
#   ./scripts/setup-https-caddy.sh --public ops.example.com  # ACME via LE
#
# After running, Caddy listens on :443 and forwards to the embedded
# server on :3100. Client URL becomes https://<host>/ — that's the URL
# to put into Settings → Mode → Thin on remote desktop installs.

set -euo pipefail

UPSTREAM_PORT="${OPS_UPSTREAM_PORT:-3100}"
PUBLIC_MODE=0
HOSTNAME=""

# ── Parse args ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --public) PUBLIC_MODE=1; shift ;;
    --port) UPSTREAM_PORT="$2"; shift 2 ;;
    -h|--help)
      grep -E "^# ?" "$0" | sed -E 's/^# ?//' ; exit 0 ;;
    *) HOSTNAME="$1"; shift ;;
  esac
done

# ── Resolve a sane default hostname ─────────────────────────────────
if [[ -z "$HOSTNAME" ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then
    LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  else
    LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  HOSTNAME="${LAN_IP:-localhost}"
  echo "[caddy] No hostname given — defaulting to $HOSTNAME"
  echo "        (override: $0 ops.local)"
fi

# ── Sanity check Caddy ──────────────────────────────────────────────
if ! command -v caddy >/dev/null 2>&1; then
  echo "ERROR: caddy not found on PATH." >&2
  echo "  macOS:  brew install caddy" >&2
  echo "  Linux:  https://caddyserver.com/docs/install" >&2
  exit 2
fi

CADDY_VER=$(caddy version | awk '{print $1}' | tr -d 'v')
echo "[caddy] using $(command -v caddy) ($CADDY_VER)"

# ── Generate Caddyfile ──────────────────────────────────────────────
CONF_DIR="${OPS_CADDY_DIR:-$HOME/.config/ops-control-caddy}"
mkdir -p "$CONF_DIR"
CADDYFILE="$CONF_DIR/Caddyfile"

if [[ "$PUBLIC_MODE" == "1" ]]; then
  # Real ACME — needs port 80 reachable from public Internet for HTTP-01
  cat > "$CADDYFILE" <<EOF
{
  email ops@${HOSTNAME}
}

${HOSTNAME} {
  encode gzip
  reverse_proxy 127.0.0.1:${UPSTREAM_PORT} {
    transport http {
      keepalive 30s
    }
    # Pass real client IP through so server logs aren't all 127.0.0.1
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto https
  }

  # SSE / chat stream needs flushing — Caddy does this by default for
  # text/event-stream. Just don't enable any buffering middleware.

  # Keep cookies same-site=strict — browser handles, server already sets.

  log {
    output file ${CONF_DIR}/access.log {
      roll_size 50mb
      roll_keep 5
    }
    format console
  }
}
EOF
  MODE_DESC="public ACME (Let's Encrypt) for $HOSTNAME"
else
  # Self-signed via Caddy's internal CA — perfect for LAN deploys
  cat > "$CADDYFILE" <<EOF
{
  # Caddy auto-generates an internal root CA. Trust it once per
  # client to silence browser warnings:
  #   macOS:    sudo security add-trusted-cert -d -r trustRoot \\
  #             -k /Library/Keychains/System.keychain \\
  #             ~/Library/Application\\ Support/Caddy/pki/authorities/local/root.crt
  #   Windows:  certutil -addstore -f Root caddy_root.crt
  local_certs
}

# Listen on the LAN hostname/IP. Multiple names work — separate by comma.
${HOSTNAME}, localhost, 127.0.0.1 {
  encode gzip
  reverse_proxy 127.0.0.1:${UPSTREAM_PORT} {
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto https
  }

  log {
    output file ${CONF_DIR}/access.log {
      roll_size 50mb
      roll_keep 5
    }
    format console
  }
}
EOF
  MODE_DESC="self-signed (Caddy internal CA)"
fi

echo "[caddy] wrote config: $CADDYFILE"
echo "[caddy] mode: $MODE_DESC"
echo "[caddy] upstream: 127.0.0.1:$UPSTREAM_PORT"
echo

# ── Validate config ─────────────────────────────────────────────────
caddy validate --config "$CADDYFILE" --adapter caddyfile

# ── Run instructions ────────────────────────────────────────────────
cat <<EOF

═══ Done ═══

Foreground (test):
  caddy run --config $CADDYFILE --adapter caddyfile

Background (macOS launchd):
  brew services start caddy
  # then drop $CADDYFILE → /usr/local/etc/Caddyfile (or /opt/homebrew/etc)

Background (Linux systemd):
  sudo cp $CADDYFILE /etc/caddy/Caddyfile
  sudo systemctl reload caddy

After Caddy is running, open https://${HOSTNAME}/ — the dashboard should
load over TLS. On other LAN machines: Settings → Mode = Thin →
URL = https://${HOSTNAME}

EOF

if [[ "$PUBLIC_MODE" != "1" ]]; then
  cat <<EOF
SELF-SIGNED setup — first-time only on each client:
  macOS:
    sudo security add-trusted-cert -d -r trustRoot \\
      -k /Library/Keychains/System.keychain \\
      ~/Library/Application\\ Support/Caddy/pki/authorities/local/root.crt

  Windows (PowerShell elevated):
    Import-Certificate -FilePath caddy_root.crt -CertStoreLocation Cert:\\LocalMachine\\Root

EOF
fi
