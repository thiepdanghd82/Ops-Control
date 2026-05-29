/**
 * ProvisioningCard — Sprint 1.5 SAP/IFS-style account handover.
 *
 * Shown to admins right after generating a temp password for a user.
 * Bundles everything the new operator needs to sign in for the first
 * time onto one card: server URL, username, temp password (with the
 * "you must change this" warning), and a short instruction list.
 *
 * The temp password is shown ONCE. Server doesn't return it again, so
 * the admin must Copy or Print before closing. The Copy action
 * formats a multi-line block suited to pasting into a Slack DM /
 * encrypted email. The Print action triggers window.print() with a
 * print stylesheet that hides everything else on the page so a desk
 * printer produces a single A6-ish card.
 *
 * Bilingual labels (EN over VN) — shift leads in the factory don't
 * always share the same locale and a printed handout has no toggle.
 */
import React, { useState } from 'react';
import Modal from '../Shared/Modal';
import './ProvisioningCard.css';

function buildPlainText({ serverUrl, username, fullName, tempPassword }) {
  return [
    'OPS CONTROL — User handover / Bàn giao tài khoản',
    '─────────────────────────────────────────',
    `Server URL : ${serverUrl}`,
    `Username   : ${username}`,
    fullName ? `Full name  : ${fullName}` : null,
    `Temp pwd   : ${tempPassword}`,
    '',
    '⚠ Must change password on first login',
    '   Phải đổi mật khẩu khi đăng nhập lần đầu',
    '',
    'Generated: ' + new Date().toLocaleString(),
  ]
    .filter(Boolean)
    .join('\n');
}

export default function ProvisioningCard({
  open,
  onClose,
  username,
  fullName,
  tempPassword,
  serverUrl,
}) {
  // The "Copied" feedback auto-clears 2.5s after the user clicks Copy,
  // so by the time the modal reopens the state is normally back to
  // false on its own. No effect needed for the rare reopen-within-2.5s
  // case — worth-it tradeoff vs. a setState-in-effect lint exception.
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const plain = buildPlainText({ serverUrl, username, fullName, tempPassword });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (rare in Electron / older Safari) — fall back
      // to a temporary textarea + execCommand. Selection survives long
      // enough for the user to Cmd+C themselves.
      const ta = document.createElement('textarea');
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        /* nothing else to try */
      }
      document.body.removeChild(ta);
    }
  };

  const onPrint = () => {
    // Print stylesheet (in ProvisioningCard.css) hides everything on the
    // page except .provisioning-print-target and lays it out as a small
    // standalone card. Modal scrim doesn't print.
    window.print();
  };

  return (
    <Modal open={open} onClose={onClose} size="md" severity="info">
      <Modal.Header title="Provisioning card · Thẻ bàn giao" />
      <Modal.Body>
        {/* The visible card inside the modal AND the print target — same
            DOM, the print stylesheet just trims chrome away. */}
        <div className="provisioning-print-target">
          <div className="prov-card">
            <div className="prov-card-head">
              <div className="prov-card-brand">
                <div className="prov-card-brand-mark">⌬</div>
                <div>
                  <div className="prov-card-brand-name">OPS CONTROL</div>
                  <div className="prov-card-brand-tag">User handover · Bàn giao tài khoản</div>
                </div>
              </div>
            </div>

            <dl className="prov-card-grid">
              <dt>Server URL</dt>
              <dd className="prov-card-mono">{serverUrl || '—'}</dd>

              <dt>Username · Tên đăng nhập</dt>
              <dd className="prov-card-mono">{username}</dd>

              {fullName ? (
                <>
                  <dt>Full name · Họ tên</dt>
                  <dd>{fullName}</dd>
                </>
              ) : null}

              <dt>Temp password · Mật khẩu tạm</dt>
              <dd className="prov-card-mono prov-card-pwd">{tempPassword}</dd>
            </dl>

            <div className="prov-card-warn">
              <b>⚠ Must change password on first login</b>
              <br />
              <span className="prov-card-warn-vi">Phải đổi mật khẩu khi đăng nhập lần đầu</span>
            </div>

            <ol className="prov-card-steps">
              <li>
                <b>Open</b> the Ops Control app
                <br />
                <span className="prov-card-steps-vi">Mở ứng dụng Ops Control</span>
              </li>
              <li>
                <b>Sign in</b> with the username and temp password above
                <br />
                <span className="prov-card-steps-vi">
                  Đăng nhập bằng tên + mật khẩu tạm phía trên
                </span>
              </li>
              <li>
                <b>Choose</b> a new password (min. 6 chars)
                <br />
                <span className="prov-card-steps-vi">Đặt mật khẩu mới (tối thiểu 6 ký tự)</span>
              </li>
            </ol>

            <div className="prov-card-foot">Generated · Tạo lúc {new Date().toLocaleString()}</div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn" onClick={onCopy}>
          {copied ? '✓ Copied' : 'Copy text · Sao chép'}
        </button>
        <button type="button" className="op-btn" onClick={onPrint}>
          Print · In
        </button>
        <button type="button" className="op-btn op-btn-primary" onClick={onClose}>
          Done · Hoàn tất
        </button>
      </Modal.Footer>
    </Modal>
  );
}
