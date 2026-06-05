import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authApi, api, costApi, importApi, sharedApi } from '../../../services/api';
import EmptyState from '../../../components/Shared/EmptyState';
import Modal from '../../../components/Shared/Modal';
import { useTheme } from '../../../utils/useTheme';
import { useI18n } from '../../../utils/useI18n';
import PermissionGroupsSection from './PermissionGroupsSection';
import ConnectionInfoSection from './ConnectionInfoSection';
import HardwareSection from './HardwareSection';
import ImportLegacySection from './ImportLegacySection';
import ModeSection from './ModeSection';
import AboutSection from './AboutSection';
import LicenseManagerSection from './LicenseManager';
import ProvisioningCard from '../../../components/Auth/ProvisioningCard';
import {
  getClientVersionBadge,
  groupClientVersionEventsByUser,
} from '../../../services/clientVersionBadge';
import './Settings.css';

// ─── Settings menu structure (matches COST V1.0) ───
// Icons use monochrome Unicode glyphs (not colour emoji) to match the
// geometric glyph style of the main sidebar. The colour comes from
// ICON_BGS pastel boxes below; the glyph itself stays uniform.
const MENU_SECTIONS = [
  {
    label: 'User',
    items: [
      { id: 'profile', icon: '◉', label: 'My Profile' },
      { id: 'mypwd', icon: '⚿', label: 'My Password' },
      // Phase 9J.4 — theme preference lives under the user's own
      // settings (it's a personal UI choice, not a tenant-wide config).
      { id: 'appearance', icon: '◐', label: 'Appearance' },
      // v1.1 — desktop-only tab, hiển thị banner trong web mode.
      { id: 'hardware', icon: '⌘', label: 'Thiết bị phần cứng', i18nKey: 'settings.item.hardware' },
      // v1.2 — desktop-only: chế độ kết nối (embedded/thin/smart).
      { id: 'mode', icon: '⇄', label: 'Chế độ kết nối', i18nKey: 'settings.item.mode' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'account', icon: '◍', label: 'Account Control', minRole: 'admin' },
      // v1.6 — License Manager (fleet license distribution). sys-only:
      // it surfaces every machine's installation_id + license status.
      { id: 'license-mgr', icon: '⚷', label: 'License Manager', minRole: 'sys' },
      // v1.2 — about + diagnostics dialog cho mọi user
      { id: 'about', icon: 'ⓘ', label: 'About / Diagnostics' },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { id: 'data', icon: '⊞', label: 'Backup / Restore', minRole: 'admin' },
      { id: 'syslog', icon: '❒', label: 'System Logs', minRole: 'admin' },
      // v1.1 — desktop-only: import data từ Ops Control v1.0 cũ
      { id: 'import-legacy', icon: '⇩', label: 'Import data v1.0', minRole: 'admin' },
    ],
  },
];

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

const ICON_BGS = {
  profile: '#dbeafe',
  mypwd: '#fef3c7',
  account: '#e0e7ff',
  'license-mgr': '#fee2e2',
  data: '#fce7f3',
  syslog: '#f0fdf4',
  appearance: '#f3e8ff',
  hardware: '#fef9c3',
  'import-legacy': '#dcfce7',
  mode: '#fae8ff',
  about: '#cffafe',
};

const ROLE_COLORS = {
  sys: '#dc2626',
  admin: '#7c3aed',
  cost: '#0369a1',
  user: '#16a34a',
  viewonly: '#92400e',
};
const ROLE_LABELS = {
  sys: 'Super Admin',
  admin: 'Dept Manager',
  cost: 'Cost Engineer',
  user: 'Standard User',
  viewonly: 'View Only',
};

// ═══════════════════════════════════════════════════════════
// MAIN SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════

export default function Settings() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [activeSec, setActiveSec] = useState('profile');
  const userLevel = ROLE_LEVELS[user?.role] || 0;

  return (
    <div className="settings-layout">
      {/* Left Menu Panel */}
      <aside className="settings-menu">
        <div className="settings-menu-header">Settings</div>
        {MENU_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (it) => !it.minRole || userLevel >= (ROLE_LEVELS[it.minRole] || 0)
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label} className="smenu-section">
              <div className="smenu-section-label">{section.label}</div>
              {visibleItems.map((it) => (
                <button
                  key={it.id}
                  className={`smenu-item ${activeSec === it.id ? 'active' : ''}`}
                  onClick={() => setActiveSec(it.id)}
                >
                  <span
                    className="smenu-icon-box"
                    style={{ background: ICON_BGS[it.id] || '#f1f5f9' }}
                  >
                    {it.icon}
                  </span>
                  <span className="smenu-label">{it.i18nKey ? t(it.i18nKey) : it.label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </aside>

      {/* Right Content Area */}
      <main className="settings-content">
        {activeSec === 'profile' && <ProfileSection user={user} />}
        {activeSec === 'mypwd' && <PasswordSection />}
        {activeSec === 'appearance' && <AppearanceSection />}
        {activeSec === 'hardware' && <HardwareSection />}
        {activeSec === 'mode' && <ModeSection />}
        {activeSec === 'about' && <AboutSection />}
        {activeSec === 'account' && <AccountSection />}
        {activeSec === 'license-mgr' && <LicenseManagerSection />}
        {activeSec === 'data' && <BackupSection />}
        {activeSec === 'syslog' && <LogsSection />}
        {activeSec === 'import-legacy' && <ImportLegacySection />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROFILE SECTION
// ═══════════════════════════════════════════════════════════

function ProfileSection({ user }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    english_name: user?.english_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [trackedUserId, setTrackedUserId] = useState(user?.id);
  // Sync form when the bound user actually changes (account switch, refresh-from-server).
  // "Derive state from props" pattern (no useEffect) per React 19 guidance.
  if (user?.id !== trackedUserId) {
    setTrackedUserId(user?.id);
    setForm({
      full_name: user?.full_name || '',
      english_name: user?.english_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
  }
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState(() => {
    try {
      return localStorage.getItem(`ops_avatar_${user?.id}`) || '';
    } catch {
      return '';
    }
  });

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await authApi.updateProfile(form);
      setMsg({ type: 'success', text: 'Profile updated successfully' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result;
      setAvatar(b64);
      try {
        localStorage.setItem(`ops_avatar_${user?.id}`, b64);
      } catch {
        /* localStorage may be unavailable (private mode) — non-fatal */
      }
    };
    reader.readAsDataURL(file);
  }

  function clearAvatar() {
    setAvatar('');
    try {
      localStorage.removeItem(`ops_avatar_${user?.id}`);
    } catch {
      /* localStorage may be unavailable (private mode) — non-fatal */
    }
  }

  const roleColor = ROLE_COLORS[user?.role] || '#475569';
  const roleLabel = ROLE_LABELS[user?.role] || user?.role;
  const firstLetter = (user?.full_name || user?.username || '?')[0].toUpperCase();

  return (
    <div className="settings-panel">
      <h3 className="panel-title">◉ My Profile</h3>
      <div className="settings-card">
        {/* Avatar Section */}
        <div className="prof-avatar-section">
          <div
            className="prof-avatar-wrap"
            onClick={() => document.getElementById('avatar-input')?.click()}
          >
            {avatar ? (
              <img src={avatar} alt="avatar" className="prof-avatar-img" />
            ) : (
              <div className="prof-avatar-fallback">{firstLetter}</div>
            )}
            <div className="prof-avatar-overlay">
              <span style={{ fontSize: 18 }}>📷</span>
              <span style={{ fontSize: '8.5px', color: 'white', fontWeight: 700 }}>CHANGE</span>
            </div>
            {avatar && (
              <button
                className="prof-avatar-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAvatar();
                }}
              >
                ✕
              </button>
            )}
          </div>
          <input
            id="avatar-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
          <div className="prof-avatar-info">
            <div className="prof-name">{user?.full_name || user?.username}</div>
            <div className="prof-username">@{user?.username}</div>
            <span
              className="prof-role-badge"
              style={{ background: `${roleColor}22`, color: roleColor }}
            >
              ⚡ {roleLabel}
            </span>
            <div className="prof-avatar-hint">📷 Click on photo to upload</div>
          </div>
        </div>

        {/* Form Grid */}
        <div className="prof-form-grid">
          <div className="prof-form-field prof-field-wide">
            <label>Full Name (Vietnamese)</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
            />
          </div>
          <div className="prof-form-field prof-field-wide">
            <label>English Name</label>
            <input
              type="text"
              value={form.english_name}
              onChange={(e) => set('english_name', e.target.value)}
            />
          </div>
          <div className="prof-form-field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="prof-form-field">
            <label>Phone</label>
            <input type="text" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="prof-form-field">
            <label>Username</label>
            <input type="text" value={user?.username || ''} readOnly className="prof-readonly" />
          </div>
          <div className="prof-form-field">
            <label>ID No.</label>
            <input type="text" value={user?.id_no || ''} readOnly className="prof-readonly" />
          </div>
        </div>
      </div>

      {msg && (
        <div className={`form-msg ${msg.type}`} style={{ marginTop: 8 }}>
          {msg.text}
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 12 }}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>

      <h3 className="panel-title" style={{ marginTop: 28 }}>
        About
      </h3>
      <div className="settings-card about-card">
        <p>
          <strong>Ops Control</strong> v
          {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
        </p>
        <p>CCL Design Vietnam — Integrated Cost & Planning Platform</p>
        <p className="about-tech">Henry Dang — NPI Manager · React + Node.js (Electron 33)</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APPEARANCE SECTION (Phase 9J.4)
// ═══════════════════════════════════════════════════════════
//
// Three-option radio group: System / Light / Dark. Saves immediately
// to localStorage and applies across the whole app via data-theme on
// <html>. No server round-trip needed — theme is a per-browser
// preference, not synced across devices.

function AppearanceSection() {
  const { pref, active, setPref } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const themeOpts = [
    {
      value: 'system',
      label: t('appearance.system'),
      hint: t('appearance.system_hint', { active }),
      icon: '🖥',
    },
    { value: 'light', label: t('appearance.light'), hint: t('appearance.light_hint'), icon: '☀️' },
    { value: 'dark', label: t('appearance.dark'), hint: t('appearance.dark_hint'), icon: '🌙' },
  ];

  const langOpts = [
    { value: 'en', label: t('appearance.lang.en'), icon: '🇺🇸' },
    { value: 'vi', label: t('appearance.lang.vi'), icon: '🇻🇳' },
  ];

  // Shared option-card style so theme + language groups look identical.
  const cardStyle = (checked) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: checked ? 'var(--color-primary-subtle, #edf5ff)' : 'var(--surface-card)',
    border: checked ? '2px solid var(--color-primary)' : '1px solid var(--border-strong)',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    borderRadius: 2,
  });

  return (
    <div className="settings-panel">
      <div className="settings-panel-title">{t('appearance.title')}</div>
      <div
        className="settings-panel-hint"
        style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}
      >
        {t('appearance.hint')}
      </div>

      {/* Theme group */}
      <div
        role="radiogroup"
        aria-label="Theme preference"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 500 }}
      >
        {themeOpts.map((o) => {
          const checked = pref === o.value;
          return (
            <label key={o.value} style={cardStyle(checked)}>
              <input
                type="radio"
                name="theme-pref"
                value={o.value}
                checked={checked}
                onChange={() => setPref(o.value)}
                style={{ margin: 0 }}
              />
              <span style={{ fontSize: 20 }}>{o.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{o.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {o.hint}
                </div>
              </div>
              {checked && (
                <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 600 }}>
                  {t('common.active').toUpperCase()}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Phase 9P.3 — Language selector. Rendered as a second radiogroup
          so the keyboard tab order is theme-first → language. Industry
          acronyms (BOM/RFQ/MOQ/SGA) stay English in both locales per the
          convention documented in the strings.js header. */}
      <div
        style={{
          marginTop: 24,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 4,
        }}
      >
        {t('appearance.language')}
      </div>
      <div
        style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, maxWidth: 500 }}
      >
        {t('appearance.language_hint')}
      </div>
      <div
        role="radiogroup"
        aria-label="Language preference"
        style={{ display: 'flex', gap: 8, maxWidth: 500 }}
      >
        {langOpts.map((o) => {
          const checked = locale === o.value;
          return (
            <label key={o.value} style={{ ...cardStyle(checked), flex: 1 }}>
              <input
                type="radio"
                name="locale-pref"
                value={o.value}
                checked={checked}
                onChange={() => setLocale(o.value)}
                style={{ margin: 0 }}
              />
              <span style={{ fontSize: 20 }}>{o.icon}</span>
              <div style={{ fontWeight: 600, flex: 1 }}>{o.label}</div>
              {checked && (
                <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 600 }}>
                  {t('common.active').toUpperCase()}
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 10,
          background: 'var(--surface-subtle)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          borderLeft: '3px solid var(--color-primary)',
        }}
      >
        <b>Note:</b> Most Ops Control surfaces use CSS tokens and flip automatically. A few legacy
        tabs (Standard/Complex calculators, Settings → Account Control) are still being migrated and
        may appear light even in dark mode. Those will be addressed in a follow-up sprint.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PASSWORD SECTION
// ═══════════════════════════════════════════════════════════

function PasswordSection() {
  const { user } = useAuth();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (newPwd.length < 6)
      return setMsg({ type: 'error', text: 'Password must be at least 6 characters' });
    if (newPwd !== confirm) return setMsg({ type: 'error', text: 'Passwords do not match' });
    setSaving(true);
    try {
      await costApi.changePwd(oldPwd, newPwd);
      setMsg({ type: 'success', text: 'Password changed successfully' });
      setOldPwd('');
      setNewPwd('');
      setConfirm('');
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to change password' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-panel">
      <h3 className="panel-title">⚿ Change Password — {user?.username}</h3>
      <div className="settings-card">
        <form className="pwd-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label-upper">Current Password</label>
            <input
              type="password"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label className="form-label-upper">New Password</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              placeholder="Min 6 characters"
            />
          </div>
          <div className="form-field">
            <label className="form-label-upper">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {msg && <div className={`form-msg ${msg.type}`}>{msg.text}</div>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT CONTROL SECTION
// ═══════════════════════════════════════════════════════════

// Role badges: monochrome glyphs only (matches Settings sub-tab icon style).
// sys ⚡ = god mode | admin ★ = elevated | cost ▤ = data-write | user ◉ = standard | viewonly ◌ = read-only
const ACCT_ROLE_ICONS = { sys: '⚡', admin: '★', cost: '▤', user: '◉', viewonly: '◌' };
const ACCT_ROLE_COLORS = {
  sys: '#ff3b30',
  admin: '#af52de',
  cost: '#007aff',
  user: '#34c759',
  viewonly: '#ff9500',
};
const ACCT_ROLE_LABEL = {
  sys: 'SYS',
  admin: 'ADM — Dept Manager',
  cost: 'COST — Cost Engineer',
  user: 'USER — Standard User',
  viewonly: 'VIEW — Read Only',
};

const PERM_MODULES = [
  {
    section: 'CALCULATORS',
    rows: [
      {
        fn: 'Standard / Complex / Inks',
        sys: true,
        admin: true,
        cost: true,
        user: true,
        viewonly: 'view',
      },
      {
        fn: 'Material Cost (edit)',
        sys: true,
        admin: true,
        cost: true,
        user: false,
        viewonly: 'view',
      },
      { fn: 'Cost Breakdown', sys: true, admin: true, cost: true, user: true, viewonly: 'view' },
    ],
  },
  {
    section: 'QUOTING',
    rows: [
      {
        fn: 'Formal Quotation (create)',
        sys: true,
        admin: true,
        cost: true,
        user: true,
        viewonly: false,
      },
      {
        fn: 'Quote History (view all)',
        sys: true,
        admin: true,
        cost: true,
        user: 'Own',
        viewonly: 'view',
      },
      {
        fn: 'Quote Analysis / Reports',
        sys: true,
        admin: true,
        cost: true,
        user: false,
        viewonly: 'view',
      },
    ],
  },
  {
    section: 'MANUFACTURING',
    rows: [
      {
        fn: 'Mfg Structures / Routing',
        sys: true,
        admin: true,
        cost: true,
        user: true,
        viewonly: 'view',
      },
      { fn: 'IFS Inventory', sys: true, admin: true, cost: true, user: true, viewonly: 'view' },
    ],
  },
  {
    section: 'SETTINGS',
    rows: [
      {
        fn: 'Account / User Mgmt',
        sys: true,
        admin: true,
        cost: false,
        user: false,
        viewonly: false,
      },
      {
        fn: 'Rate / DDL / Finance',
        sys: true,
        admin: true,
        cost: false,
        user: false,
        viewonly: false,
      },
      {
        fn: 'Backup / Restore',
        sys: true,
        admin: false,
        cost: false,
        user: false,
        viewonly: false,
      },
    ],
  },
];

// SVG icons for Account Control action buttons. Each one is a stroked,
// 14×14 outline matching the function it triggers — rendered white-on-steel
// by the parent .acct-sq-btn rules (stroke: currentColor).
function SqIcon({ children }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
const AcctIcon = {
  // Pencil — edit profile
  edit: (
    <SqIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </SqIcon>
  ),
  // Shield with check — setup 2FA
  shield: (
    <SqIcon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </SqIcon>
  ),
  // Closed padlock — lock user
  lock: (
    <SqIcon>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </SqIcon>
  ),
  // Open padlock — unlock user
  unlock: (
    <SqIcon>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0" />
    </SqIcon>
  ),
  // Trash can — delete user
  trash: (
    <SqIcon>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </SqIcon>
  ),
  // ID card — generate temp password + show provisioning card (Sprint 1.5)
  card: (
    <SqIcon>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M7 11h4" />
      <path d="M7 14h6" />
      <circle cx="17" cy="12" r="2" />
    </SqIcon>
  ),
};

const TTL_OPTS = [
  { v: 0, l: 'Def' },
  { v: 1, l: '1h' },
  { v: 2, l: '2h' },
  { v: 4, l: '4h' },
  { v: 8, l: '8h' },
  { v: 12, l: '12h' },
  { v: 16, l: '16h' },
  { v: 24, l: '24h' },
  { v: 48, l: '2d' },
  { v: 72, l: '3d' },
  { v: 168, l: '7d' },
];

function pwdAgeBadge(lastPwdChange) {
  if (!lastPwdChange) return <span style={{ color: '#c7c7cc' }}>—</span>;
  const d = Math.floor((Date.now() - new Date(lastPwdChange)) / 86400000);
  const clr = d > 90 ? '#ff3b30' : d > 60 ? '#ff9500' : '#34c759';
  const dateStr = new Date(lastPwdChange).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
  });
  return (
    <span style={{ color: clr, fontWeight: 500 }}>
      {dateStr} <span style={{ opacity: 0.5 }}>({d}d)</span>
    </span>
  );
}

function AccountSection() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [onlineList, setOnlineList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acctTab, setAcctTab] = useState('users');
  const [msg, setMsg] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pgGroups, setPgGroups] = useState([]);
  const [pgDepartments, setPgDepartments] = useState([]);
  // Đợt 6 — sessions admin (sys-only)
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  // Sprint 1.5 — SAP/IFS provisioning. Holds the temp-pwd response so we
  // can display it in the ProvisioningCard modal. Cleared on close so the
  // password isn't kept in memory longer than needed (it's already hashed
  // server-side and we don't show it again).
  const [provisioning, setProvisioning] = useState(null);
  // P0 client-version banner — keep the latest CLIENT_UPGRADE_NUDGE_SHOWN
  // + CLIENT_VERSION_MATCH_AFTER_UPGRADE audit rows around so the
  // "Phiên bản client" column can render per-operator badges. Empty
  // map = no events yet (gray badges everywhere) which is the legitimate
  // pre-banner-rollout state.
  const [clientVersionEvents, setClientVersionEvents] = useState(new Map());
  const [currentServerVersion, setCurrentServerVersion] = useState(null);

  const isSys = currentUser?.role === 'sys';
  const isAdminPlus = currentUser?.role === 'sys' || currentUser?.role === 'admin';

  // Sprint S2 — load permission groups + departments once so the Users
  // table can show dropdowns per row without N fetches.
  useEffect(() => {
    let cancelled = false;
    sharedApi
      .getPermissionGroups()
      .then((data) => {
        if (cancelled) return;
        setPgGroups(Array.isArray(data?.groups) ? data.groups : []);
        setPgDepartments(Array.isArray(data?.departments) ? data.departments : []);
      })
      .catch(() => {
        /* silent — falls back to legacy dropdowns */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadUsers();
    loadOnline();
    loadClientVersions();
  }, []);
  useEffect(() => {
    const t = setInterval(loadOnline, 30000);
    return () => clearInterval(t);
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const usersData = await authApi.getUsers();
      const list = usersData.users || usersData;
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn('Users load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadOnline() {
    try {
      const r = await costApi.getUsersStatus();
      const list = Array.isArray(r?.users) ? r.users : [];
      setOnlineList(list.filter((u) => u.online));
    } catch {
      /* silent */
    }
  }

  async function loadClientVersions() {
    // Pulls raw client-version audit rows from /api/users/client-versions.
    // Server returns gracefully empty when audit DB is offline, so we
    // don't need a separate error path for first-boot dev runs.
    try {
      const r = await authApi.getUsersClientVersions();
      const rows = Array.isArray(r?.rows) ? r.rows : [];
      setClientVersionEvents(groupClientVersionEventsByUser(rows));
      if (r?.server_version) setCurrentServerVersion(r.server_version);
    } catch {
      /* silent — badges fall back to gray when the map is empty */
    }
  }

  async function loadSessions() {
    if (!isSys) return;
    setSessionsLoading(true);
    try {
      const r = await costApi.getActiveSessions();
      setSessions(Array.isArray(r?.sessions) ? r.sessions : []);
    } catch (e) {
      flash('error', 'Failed to load sessions: ' + (e.message || 'unknown'));
    } finally {
      setSessionsLoading(false);
    }
  }

  async function handleRevokeSessions(username) {
    if (
      !confirm(
        `Revoke ALL active sessions for "${username}"?\n\nUser sẽ bị logout ngay lập tức trên mọi máy. Họ phải login lại bằng password.`
      )
    )
      return;
    try {
      const r = await costApi.revokeUserSessions(username);
      flash('success', `Revoked ${r.revoked} session(s) for ${username}`);
      await loadSessions();
    } catch (e) {
      flash('error', 'Failed to revoke: ' + (e.message || 'unknown'));
    }
  }

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleSetTtl(uid, ttlHours) {
    try {
      await costApi.setSessionTtl(uid, Number(ttlHours));
      flash('success', `Token duration updated`);
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update token: ' + (e.message || 'unknown'));
    }
  }

  async function handleTogglePerm(uid, checked) {
    try {
      const target = users.find((u) => u.id === uid);
      const nextPerms = { ...(target?.permissions || {}), canDeleteQuote: checked };
      await costApi.updateUser(uid, { permissions: nextPerms });
      flash('success', `Delete permission ${checked ? 'granted' : 'revoked'}`);
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update permission: ' + (e.message || 'unknown'));
    }
  }

  // Sprint 1.5 — SAP/IFS provisioning. Server generates a cryptographically
  // random temp pwd, marks must_change_password=true, returns the password
  // ONCE. We hand it to the ProvisioningCard modal which lets the admin
  // copy/print before closing — after that the password is gone from
  // memory and the only way to see it is to re-issue.
  async function handleGenerateTempPwd(u) {
    if (
      !confirm(
        `Generate a temporary password for "${u.username}"?\n\n` +
          `• Their existing password (if any) will stop working immediately.\n` +
          `• They'll be FORCED to change it on next login.\n` +
          `• You'll see the temp password ONCE — copy or print it before closing.`
      )
    )
      return;
    try {
      const r = await costApi.generateTempPwd(u.id);
      if (!r?.ok) throw new Error(r?.msg || 'Server rejected the request');
      setProvisioning({
        username: r.username,
        fullName: r.full_name || u.full_name || '',
        tempPassword: r.temp_password,
        // Use the URL the admin is currently accessing the server at —
        // for the typical case (admin on the same LAN as the new user)
        // this is exactly the URL the new user should type into Connection
        // Mode → Remote URL. Admin can edit on the printed card if needed.
        serverUrl: window.location.origin,
      });
      flash('success', `Temp password issued for ${u.username}`);
    } catch (e) {
      flash('error', 'Failed to generate temp password: ' + (e.message || 'unknown'));
    }
  }

  async function handleDelete(u) {
    if (!confirm(`Delete user "${u.username}"?\n\nThis action cannot be undone.`)) return;
    try {
      await costApi.deleteUser(u.id);
      flash('success', `User ${u.username} deleted`);
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to delete user: ' + (e.message || 'unknown'));
    }
  }

  async function handleEdit(u) {
    // Matches COST V1.0's authEditUserDialog — sequential prompts.
    const newFull = prompt('Full Name (VN):', u.full_name || '');
    if (newFull === null) return;
    const newEng = prompt('English Name:', u.english_name || '');
    if (newEng === null) return;
    const newIdNo = prompt('ID No.:', u.id_no || '');
    if (newIdNo === null) return;
    const newEmail = prompt('Email:', u.email || '');
    if (newEmail === null) return;
    const newPhone = prompt('Phone:', u.phone || '');
    if (newPhone === null) return;
    try {
      await costApi.updateUser(u.id, {
        full_name: newFull.trim(),
        english_name: newEng.trim(),
        id_no: newIdNo.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
      });
      flash('success', 'User updated');
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update user: ' + (e.message || 'unknown'));
    }
  }

  async function handleCreate(data) {
    // No try/catch: let the modal see the error and display it. Wrapping
    // here would be a useless re-throw (see eslint no-useless-catch).
    await costApi.createUser(data);
    flash('success', `User ${data.username} created`);
    setAddOpen(false);
    loadUsers();
  }

  async function handleChangeRole(uid, newRole) {
    try {
      await costApi.updateUser(uid, { role: newRole });
      flash('success', 'Role updated');
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update role: ' + (e.message || 'unknown'));
    }
  }

  async function handleChangeDepartment(uid, department) {
    try {
      await costApi.updateUser(uid, { department });
      flash('success', department ? `Department → ${department}` : 'Department cleared');
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update department: ' + (e.message || 'unknown'));
    }
  }

  async function handleChangePermissionGroup(uid, permission_group_id) {
    try {
      await costApi.updateUser(uid, { permission_group_id });
      flash(
        'success',
        permission_group_id
          ? `Permission group → ${permission_group_id} (active sessions revoked)`
          : 'Permission group cleared'
      );
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update permission group: ' + (e.message || 'unknown'));
    }
  }

  // Sprint pre-8.1: toggle approval chain membership. Server whitelists
  // to ['sales_mgr','finance_dir'] + sys-gated + audited. Optimistic-
  // then-reload to keep the UI responsive but authoritative.
  async function handleToggleApprovalRole(u, role) {
    const current = Array.isArray(u.approval_roles) ? u.approval_roles : [];
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    try {
      await costApi.updateUser(u.id, { approval_roles: next });
      flash('success', `${u.username}: ${role} ${next.includes(role) ? 'granted' : 'revoked'}`);
      loadUsers();
    } catch (e) {
      flash('error', 'Failed to update approval role: ' + (e.message || 'unknown'));
    }
  }

  if (loading) return <div className="tab-loading">Loading users...</div>;

  return (
    <div className="settings-panel settings-panel-wide">
      <div className="acct-header">
        <div>
          <h3 className="panel-title" style={{ margin: 0 }}>
            User Accounts
          </h3>
          <p className="panel-subtitle">
            {users.length} users · {onlineList.length} online · 5-level permissions
          </p>
        </div>
        <div className="acct-header-actions">
          <div className="acct-tabs">
            <button
              className={`acct-tab-btn ${acctTab === 'users' ? 'active' : ''}`}
              onClick={() => setAcctTab('users')}
            >
              Users
            </button>
            <button
              className={`acct-tab-btn ${acctTab === 'perms' ? 'active' : ''}`}
              onClick={() => setAcctTab('perms')}
            >
              Permissions
            </button>
            <button
              className={`acct-tab-btn ${acctTab === 'groups' ? 'active' : ''}`}
              onClick={() => setAcctTab('groups')}
            >
              Permission Groups
            </button>
            <button
              className={`acct-tab-btn ${acctTab === 'connection' ? 'active' : ''}`}
              onClick={() => setAcctTab('connection')}
            >
              Connection
            </button>
            {isSys && (
              <button
                className={`acct-tab-btn ${acctTab === 'sessions' ? 'active' : ''}`}
                onClick={() => {
                  setAcctTab('sessions');
                  loadSessions();
                }}
              >
                Sessions
              </button>
            )}
          </div>
          <button
            className="btn"
            onClick={() => {
              loadUsers();
              loadOnline();
            }}
          >
            ↻ Refresh
          </button>
          {isSys && (
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
              + Add User
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`form-msg ${msg.type}`} style={{ marginBottom: 10 }}>
          {msg.text}
        </div>
      )}

      {acctTab === 'users' ? (
        <>
          <div className="settings-card acct-table-card">
            <table className="acct-table">
              <thead>
                <tr>
                  <th className="acct-col-user">USERNAME / DISPLAY</th>
                  <th className="acct-col-fullname">FULL NAME (VN)</th>
                  <th className="acct-col-id text-center">ID NO.</th>
                  <th className="acct-col-email">EMAIL</th>
                  <th className="acct-col-phone">PHONE</th>
                  <th className="acct-col-role text-center">ROLE</th>
                  <th
                    className="acct-col-dept text-center"
                    title="Department (Sprint S2 — informational + default group assignment)"
                  >
                    DEPT.
                  </th>
                  <th
                    className="acct-col-pg text-center"
                    title="Permission Group — controls tab visibility and read/edit mode"
                  >
                    PERM. GROUP
                  </th>
                  <th className="acct-col-token text-center" title="Session token duration">
                    ⏱ TOKEN
                  </th>
                  <th className="acct-col-pwd text-center">PWD C</th>
                  <th className="acct-col-del text-center" title="Can Delete Quotes">
                    DEL?
                  </th>
                  <th
                    className="acct-col-approval text-center"
                    title="Approval chain (Cost→Sales→Finance) — who can sign off at each gate"
                  >
                    APPROVAL
                  </th>
                  <th
                    className="acct-col-client-ver text-center"
                    title="Phiên bản client của operator — xanh: khớp server, cam: cũ, xám: chưa có audit trong 7 ngày"
                  >
                    CLIENT VER
                  </th>
                  <th className="acct-col-actions text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const rc = ACCT_ROLE_COLORS[u.role] || '#64748b';
                  const isMe = u.id === currentUser?.id;
                  const ttlHours = u.session_ttl ? Math.round(u.session_ttl / 3600) : 0;
                  const permRoleAuto = ['sys', 'admin', 'cost'].includes(u.role);
                  const canDelChecked = permRoleAuto || u.permissions?.canDeleteQuote === true;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="acct-user-cell">
                          <div className="acct-user-avatar">
                            <svg
                              viewBox="0 0 24 24"
                              fill="white"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                            </svg>
                          </div>
                          <div>
                            <div className="acct-username">
                              {u.username}
                              {isMe && <span className="acct-me-badge">me</span>}
                            </div>
                            <div className="acct-display">{u.english_name || u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="acct-cell-fullname">{u.full_name || '—'}</td>
                      <td className="text-center mono">{u.id_no || '—'}</td>
                      <td className="acct-cell-muted acct-cell-ellipsis" title={u.email || ''}>
                        {u.email || '—'}
                      </td>
                      <td className="acct-cell-muted">{u.phone || '—'}</td>
                      <td className="text-center">
                        {isSys && !isMe ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u.id, e.target.value)}
                            className="acct-role-select"
                            style={{ color: rc, borderColor: rc + '55' }}
                          >
                            {Object.keys(ACCT_ROLE_COLORS).map((r) => (
                              <option key={r} value={r}>
                                {ACCT_ROLE_LABEL[r] || r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="acct-role-pill" style={{ color: rc }}>
                            {ACCT_ROLE_ICONS[u.role]} {ACCT_ROLE_LABEL[u.role] || u.role}
                          </span>
                        )}
                      </td>
                      {/* Sprint S2 — Department + Permission Group cells */}
                      <td className="text-center">
                        {isAdminPlus ? (
                          <select
                            value={u.department || ''}
                            onChange={(e) => handleChangeDepartment(u.id, e.target.value)}
                            className="acct-pg-select"
                            title={`Department for ${u.username}`}
                          >
                            <option value="">—</option>
                            {pgDepartments.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="acct-cell-muted">{u.department || '—'}</span>
                        )}
                      </td>
                      <td className="text-center">
                        {isAdminPlus ? (
                          <select
                            value={u.permission_group_id || ''}
                            onChange={(e) => handleChangePermissionGroup(u.id, e.target.value)}
                            className="acct-pg-select"
                            title={`Permission group for ${u.username}. Changing it will revoke the user's sessions.`}
                          >
                            <option value="">— (role only)</option>
                            {pgGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="acct-cell-muted">
                            {pgGroups.find((g) => g.id === u.permission_group_id)?.name || '—'}
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        {isSys ? (
                          <select
                            value={ttlHours}
                            onChange={(e) => handleSetTtl(u.id, e.target.value)}
                            className="acct-ttl-select"
                            title={`Session token duration for ${u.username}`}
                          >
                            {TTL_OPTS.map((o) => (
                              <option key={o.v} value={o.v}>
                                {o.l}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="acct-cell-muted">
                            {ttlHours > 0 ? ttlHours + 'h' : 'Def'}
                          </span>
                        )}
                      </td>
                      <td className="text-center">{pwdAgeBadge(u.lastPwdChange)}</td>
                      <td className="text-center">
                        {isAdminPlus ? (
                          <input
                            type="checkbox"
                            checked={canDelChecked}
                            disabled={permRoleAuto}
                            onChange={(e) => handleTogglePerm(u.id, e.target.checked)}
                            title={
                              permRoleAuto
                                ? 'Role already has delete access'
                                : 'Toggle delete permission'
                            }
                            style={{
                              width: 16,
                              height: 16,
                              cursor: permRoleAuto ? 'not-allowed' : 'pointer',
                              accentColor: '#0f62fe',
                            }}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-center acct-cell-approval">
                        {(() => {
                          const roles = Array.isArray(u.approval_roles) ? u.approval_roles : [];
                          const hasSales = roles.includes('sales_mgr');
                          const hasFinance = roles.includes('finance_dir');
                          if (!isSys) {
                            // Read-only badges for non-sys. Admin+ can see
                            // but only sys can grant (matches server auth).
                            if (!hasSales && !hasFinance)
                              return <span className="acct-cell-muted">—</span>;
                            return (
                              <span className="acct-approval-pills">
                                {hasSales && (
                                  <span
                                    className="acct-approval-pill acct-approval-sales"
                                    title="Sales manager approval"
                                  >
                                    S
                                  </span>
                                )}
                                {hasFinance && (
                                  <span
                                    className="acct-approval-pill acct-approval-finance"
                                    title="Finance director approval"
                                  >
                                    F
                                  </span>
                                )}
                              </span>
                            );
                          }
                          return (
                            <span className="acct-approval-pills">
                              <button
                                type="button"
                                className={`acct-approval-pill acct-approval-sales ${hasSales ? 'on' : 'off'}`}
                                onClick={() => handleToggleApprovalRole(u, 'sales_mgr')}
                                title={`Sales manager gate — ${hasSales ? 'click to revoke' : 'click to grant'}`}
                              >
                                S
                              </button>
                              <button
                                type="button"
                                className={`acct-approval-pill acct-approval-finance ${hasFinance ? 'on' : 'off'}`}
                                onClick={() => handleToggleApprovalRole(u, 'finance_dir')}
                                title={`Finance director gate — ${hasFinance ? 'click to revoke' : 'click to grant'}`}
                              >
                                F
                              </button>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-center acct-cell-client-ver">
                        {(() => {
                          const events = clientVersionEvents.get(u.username) || [];
                          const badge = getClientVersionBadge(
                            events,
                            currentServerVersion,
                            Date.now()
                          );
                          const titleParts = [];
                          if (badge.client_version)
                            titleParts.push(`Client: ${badge.client_version}`);
                          if (badge.server_version)
                            titleParts.push(`Server: ${badge.server_version}`);
                          if (badge.ts) titleParts.push(`Last event: ${badge.ts}`);
                          if (badge.kind === 'gray' && !badge.client_version)
                            titleParts.push('Chưa có dữ liệu audit trong 7 ngày qua');
                          const cls = `cui-badge cui-badge-${badge.kind}`;
                          const label =
                            badge.kind === 'gray' && !badge.client_version
                              ? '? offline'
                              : badge.kind === 'green'
                                ? `✓ ${badge.client_version}`
                                : `⚠ ${badge.client_version || '?'}`;
                          return (
                            <span className={cls} title={titleParts.join(' • ')}>
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-center">
                        <div className="acct-action-btns">
                          {(isMe || isAdminPlus) && (
                            <button
                              className="acct-sq-btn acct-sq-edit"
                              onClick={() => handleEdit(u)}
                              title="Edit profile"
                            >
                              {AcctIcon.edit}
                            </button>
                          )}
                          {/* MES-3-FIX-43: legacy "Reset password" (key icon)
                              hidden — used window.prompt() which returns null
                              in Electron. Admins use the card-icon Provisioning
                              Card flow below (works in Electron). Self-password
                              change lives in SETTINGS → My Password sub-tab. */}
                          {/* Sprint 1.5 — SAP/IFS handover. Generates a random
                            temp pwd + opens the Provisioning Card modal so
                            the admin can copy/print the credentials. Only
                            available to admins acting on OTHER users (you
                            don't reset your own pwd through this flow). */}
                          {!isMe && isAdminPlus && (
                            <button
                              className="acct-sq-btn acct-sq-card"
                              onClick={() => handleGenerateTempPwd(u)}
                              title="Generate temp password & provisioning card"
                            >
                              {AcctIcon.card}
                            </button>
                          )}
                          {(isMe || isSys) && (
                            <button
                              className="acct-sq-btn acct-sq-shield"
                              onClick={() => flash('info', '2FA / TOTP setup coming soon')}
                              title="Setup 2FA"
                            >
                              {AcctIcon.shield}
                            </button>
                          )}
                          {!isMe && isSys && (
                            <button
                              className="acct-sq-btn acct-sq-lock"
                              onClick={() => flash('info', 'Lock / unlock coming soon')}
                              title={u.locked ? 'Unlock user' : 'Lock user'}
                            >
                              {u.locked ? AcctIcon.unlock : AcctIcon.lock}
                            </button>
                          )}
                          {!isMe && isSys && (
                            <button
                              className="acct-sq-btn acct-sq-trash"
                              onClick={() => handleDelete(u)}
                              title="Delete user"
                            >
                              {AcctIcon.trash}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!isSys && (
            <div className="acct-warn-banner">
              ⚠️ Only <b>SYS</b> can create/delete users and change roles. You are logged in as{' '}
              <b>{currentUser?.role || 'unknown'}</b>.
            </div>
          )}
        </>
      ) : acctTab === 'perms' ? (
        /* Permissions Tab */
        <div className="settings-card">
          {/* Role cards */}
          <div className="perm-role-cards">
            {['sys', 'admin', 'cost', 'user', 'viewonly'].map((r) => (
              <div key={r} className="perm-role-card">
                <div
                  className="perm-role-icon"
                  style={{ background: `${ACCT_ROLE_COLORS[r]}15`, color: ACCT_ROLE_COLORS[r] }}
                >
                  {ACCT_ROLE_ICONS[r]}
                </div>
                <div className="perm-role-name">{r.toUpperCase()}</div>
                <div className="perm-role-label">{ROLE_LABELS[r]}</div>
                <div className="perm-role-level" style={{ color: ACCT_ROLE_COLORS[r] }}>
                  Level {ROLE_LEVELS[r]}
                </div>
              </div>
            ))}
          </div>

          {/* Permission Matrix */}
          <h4 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '20px 0 4px' }}>
            Permission Matrix
          </h4>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>
            Module access by role
          </p>
          <table className="perm-matrix">
            <thead>
              <tr>
                <th>MODULE / FUNCTION</th>
                {['sys', 'admin', 'cost', 'user', 'viewonly'].map((r) => (
                  <th key={r} style={{ textAlign: 'center', color: ACCT_ROLE_COLORS[r] }}>
                    {ACCT_ROLE_ICONS[r]} {r.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERM_MODULES.map((sec) => (
                <React.Fragment key={sec.section}>
                  <tr className="perm-section-row">
                    <td colSpan={6}>{sec.section}</td>
                  </tr>
                  {sec.rows.map((row) => (
                    <tr key={row.fn}>
                      <td className="perm-fn">{row.fn}</td>
                      {['sys', 'admin', 'cost', 'user', 'viewonly'].map((r) => (
                        <td key={r} className="perm-cell">
                          {row[r] === true ? (
                            <span className="perm-check">✓</span>
                          ) : row[r] === 'view' ? (
                            <span className="perm-view">👁</span>
                          ) : row[r] === 'Own' ? (
                            <span className="perm-own">Own</span>
                          ) : (
                            <span className="perm-no">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {acctTab === 'groups' && (
        <PermissionGroupsSection isAdminPlus={isAdminPlus} onFlash={flash} />
      )}

      {acctTab === 'connection' && <ConnectionInfoSection />}

      {acctTab === 'sessions' && isSys && (
        <div className="settings-card acct-table-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '1px solid var(--op-border-subtle, #e8eaed)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--op-text-secondary, #525252)' }}>
              {sessions.length} active session(s) · token prefix shown for sys audit; full token nằm
              trong cookie/localStorage của user
            </div>
            <button className="btn" onClick={loadSessions} disabled={sessionsLoading}>
              {sessionsLoading ? '⏳' : '↻'} Refresh
            </button>
          </div>
          <table className="acct-table">
            <thead>
              <tr>
                <th>USER</th>
                <th className="text-center">ROLE</th>
                <th className="text-center">2FA</th>
                <th>TOKEN</th>
                <th>EXPIRES</th>
                <th className="text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      padding: 20,
                      textAlign: 'center',
                      color: 'var(--op-text-tertiary, #6f6f6f)',
                    }}
                  >
                    {sessionsLoading ? 'Loading…' : 'No active sessions'}
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const exp = new Date(s.expires_at);
                  const remainMin = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 60000));
                  const expLbl =
                    remainMin > 60
                      ? `${Math.floor(remainMin / 60)}h ${remainMin % 60}m`
                      : `${remainMin}m`;
                  return (
                    <tr key={s.token_prefix + s.user_id}>
                      <td>
                        <strong>{s.username}</strong>
                      </td>
                      <td className="text-center">
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: 'var(--op-tag-bg, #f4f4f4)',
                          }}
                        >
                          {s.role}
                        </span>
                      </td>
                      <td className="text-center">
                        {s.totp_verified ? (
                          <span style={{ color: '#24a148' }}>✓</span>
                        ) : (
                          <span style={{ color: '#da1e28' }}>✗</span>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {s.token_prefix}…
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <span title={exp.toLocaleString()}>{expLbl}</span>
                      </td>
                      <td className="text-center">
                        <button
                          className="btn btn-sm"
                          onClick={() => handleRevokeSessions(s.username)}
                          title={`Revoke all sessions for ${s.username}`}
                          style={{ color: '#a2191f', borderColor: '#fecdd3' }}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} onCreate={handleCreate} />}

      {/* Sprint 1.5 — provisioning card modal. Renders only when an admin
          has just generated a temp password; closing clears the state so
          the password isn't kept in memory after handover is complete. */}
      <ProvisioningCard
        open={!!provisioning}
        onClose={() => setProvisioning(null)}
        username={provisioning?.username || ''}
        fullName={provisioning?.fullName || ''}
        tempPassword={provisioning?.tempPassword || ''}
        serverUrl={provisioning?.serverUrl || ''}
      />
    </div>
  );
}

// ── Add User Modal — mirrors COST V1.0's _newUserModal ──────
function AddUserModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    english_name: '',
    id_no: '',
    email: '',
    phone: '',
    role: 'user',
    canDelete: false,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.username.trim() || !form.password) {
      setErr('⚠️ Username and Password are required.');
      return;
    }
    if (form.password.length < 6) {
      setErr('❌ Password must be at least 6 chars.');
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        full_name: form.full_name.trim(),
        english_name: form.english_name.trim(),
        id_no: form.id_no.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        permissions: { canDeleteQuote: !!form.canDelete },
      });
    } catch (e) {
      setErr('❌ ' + (e.message || 'Server error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md" severity="info" ariaLabelledBy="add-user-title">
      <Modal.Header
        id="add-user-title"
        title="Create New User"
        subtitle="Required fields marked with ★"
        severity="info"
      />
      <Modal.Body>
        <form id="add-user-form" onSubmit={handleSubmit}>
          <div className="op-form-grid">
            <div className="op-form-field">
              <label>Username ★</label>
              <input
                className="op-form-input"
                type="text"
                value={form.username}
                onChange={(e) => set('username', e.target.value)}
                placeholder="Login username"
                autoFocus
              />
            </div>
            <div className="op-form-field">
              <label>Password ★</label>
              <input
                className="op-form-input"
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Min 6 chars"
              />
            </div>
            <div className="op-form-field">
              <label>Full Name (VN)</label>
              <input
                className="op-form-input"
                type="text"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
              />
            </div>
            <div className="op-form-field">
              <label>English Name</label>
              <input
                className="op-form-input"
                type="text"
                value={form.english_name}
                onChange={(e) => set('english_name', e.target.value)}
                placeholder="For NPI Owner"
              />
            </div>
            <div className="op-form-field">
              <label>ID No.</label>
              <input
                className="op-form-input"
                type="text"
                value={form.id_no}
                onChange={(e) => set('id_no', e.target.value)}
                placeholder="CCCD / Employee ID"
              />
            </div>
            <div className="op-form-field">
              <label>Email</label>
              <input
                className="op-form-input"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="email@company.com"
              />
            </div>
            <div className="op-form-field">
              <label>Phone</label>
              <input
                className="op-form-input"
                type="text"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+84..."
              />
            </div>
            <div className="op-form-field">
              <label>Role</label>
              <select
                className="op-form-input"
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
              >
                <option value="user">USER — Standard</option>
                <option value="cost">COST — Cost Engineer</option>
                <option value="admin">ADMIN — Dept Manager</option>
                <option value="sys">SYS — Super Admin</option>
                <option value="viewonly">VIEW — Read Only</option>
              </select>
            </div>
            <div className="op-form-field">
              <label>Can Delete Quotes?</label>
              <select
                className="op-form-input"
                value={form.canDelete ? '1' : '0'}
                onChange={(e) => set('canDelete', e.target.value === '1')}
              >
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
          </div>
          {err && (
            <div className="form-msg error" style={{ marginTop: 12 }}>
              {err}
            </div>
          )}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          form="add-user-form"
          className="op-btn op-btn-primary"
          disabled={busy}
        >
          {busy ? 'Creating…' : 'Create User'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// BACKUP / RESTORE SECTION
// ═══════════════════════════════════════════════════════════

function BackupSection() {
  const { hasRole } = useAuth();
  const [dataBackups, setDataBackups] = useState([]);
  const [codeBackups, setCodeBackups] = useState([]);
  const [dataDir, setDataDir] = useState('');
  const [codeDir, setCodeDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('data');
  const [msg, setMsg] = useState(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef(null);

  useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const [dataRes, codeRes] = await Promise.all([
        costApi.getBackupList().catch(() => ({ files: [], dir: '' })),
        costApi.getCodeBackupList().catch(() => ({ files: [], dir: '' })),
      ]);
      setDataBackups(dataRes.files || []);
      setCodeBackups(codeRes.files || []);
      setDataDir(dataRes.dir || '');
      setCodeDir(codeRes.dir || '');
    } catch (e) {
      console.error('Backup list failed:', e);
    } finally {
      setLoading(false);
    }
  }

  async function createDataBackup() {
    setMsg(null);
    try {
      const res = await costApi.createDataBackup();
      setMsg({ type: 'success', text: `Backup created: ${res.filename}` });
      loadBackups();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function createCodeBackup() {
    setMsg(null);
    try {
      const res = await costApi.createCodeBackup();
      const mb = res.size ? (res.size / 1024 / 1024).toFixed(1) + ' MB' : '';
      const fc = res.files ? `, ${res.files} files` : '';
      const base = `Code backup created: ${res.filename}${fc}${mb ? ' (' + mb + ')' : ''}`;
      if (res.partial && Array.isArray(res.skipped) && res.skipped.length) {
        // Partial success: surface which subtrees were skipped so the user
        // can fix the underlying cause (re-sign-in to the File Provider,
        // clear a permission issue, etc.) rather than wondering why the
        // size looks smaller than expected.
        const list = res.skipped.map((s) => `${s.entry} (${s.reason})`).join('; ');
        setMsg({ type: 'warn', text: `${base}. Skipped ${res.skipped.length}: ${list}` });
      } else {
        setMsg({ type: 'success', text: base });
      }
      loadBackups();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function restoreDataBackup(filename) {
    if (
      !confirm(
        `Restore data from "${filename}"?\n\n` +
          `This will OVERWRITE all current library data (quotes, materials, rates, ` +
          `DDL, finance, ink calc, etc.) with the contents of this backup.\n\n` +
          `A safety snapshot of the current state will be saved as pre_restore_<timestamp>.json ` +
          `before the restore runs, so you can roll back if needed.\n\n` +
          `Proceed?`
      )
    )
      return;
    setMsg(null);
    try {
      const res = await costApi.restoreBackup(filename);
      const summary = res.restored ? `${res.restored.length} datasets restored` : 'restored';
      const warn = res.partial ? ` ⚠️ ${res.failed?.length || 0} datasets failed` : '';
      setMsg({
        type: res.partial ? 'error' : 'success',
        text: `${summary}${warn}. Safety snapshot: ${res.pre_backup}`,
      });
      loadBackups();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function restoreCodeBackup(filename) {
    if (
      !confirm(
        `Restore code from "${filename}"?\n\n` +
          `⚠️  This will OVERWRITE all source files in the package (client/src, server/, ` +
          `package.json, etc.) with the contents of this snapshot.\n\n` +
          `A safety snapshot of the current source tree will be saved first.\n\n` +
          `IMPORTANT: after the restore, you may need to restart the Node server ` +
          `(since its own .js files will have been replaced while it was running).\n\n` +
          `Proceed?`
      )
    )
      return;
    setMsg(null);
    try {
      const res = await costApi.restoreCode(filename);
      setMsg({
        type: 'success',
        text: `Code restored: ${res.restored_files || '?'} files. Safety snapshot: ${res.pre_backup}. Restart the server.`,
      });
      loadBackups();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function handleUpload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setMsg({ type: 'error', text: 'Chỉ chấp nhận file .json (data backup snapshot)' });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const res = await costApi.uploadBackup(file);
      const sizeLbl =
        res.size > 1024 * 1024
          ? `${(res.size / 1024 / 1024).toFixed(1)} MB`
          : `${(res.size / 1024).toFixed(1)} KB`;
      setMsg({
        type: 'success',
        text: `Đã upload "${res.filename}" (${sizeLbl}). Click Restore trong list để áp dụng.`,
      });
      await loadBackups();
    } catch (e) {
      setMsg({ type: 'error', text: 'Upload thất bại: ' + (e.message || 'Unknown') });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  async function deleteBackup(filename) {
    const type = activeTab;
    if (!confirm(`Delete backup "${filename}"?\n\nThis cannot be undone.`)) return;
    setMsg(null);
    try {
      await costApi.deleteBackup(filename, type);
      setMsg({ type: 'success', text: `Deleted ${filename}` });
      loadBackups();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  if (loading) return <div className="tab-loading">Loading backups...</div>;

  const backups = activeTab === 'data' ? dataBackups : codeBackups;

  return (
    <div className="settings-panel">
      <h3 className="panel-title">Backup / Restore</h3>

      {/* Sprint 1.7b — admin-editable backup schedule. Sits at the top so
          operators see "next backup at 02:00, last run ✓" before they
          decide whether to run a manual backup below. */}
      {hasRole('admin') && <BackupScheduleCard onRunDone={loadBackups} />}

      <div className="ifs-tabs" style={{ marginBottom: 12 }}>
        <button
          className={`ifs-tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Data Backups
          <span className="ifs-tab-count">{dataBackups.length}</span>
        </button>
        <button
          className={`ifs-tab ${activeTab === 'code' ? 'active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          Code Backups
          <span className="ifs-tab-count">{codeBackups.length}</span>
        </button>
      </div>

      <div className="backup-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {activeTab === 'data' && (
          <>
            <button className="btn btn-primary" onClick={createDataBackup}>
              Create Data Backup
            </button>
            {hasRole('sys') && (
              <>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
                <button
                  className="btn"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                  title="Upload backup từ máy khác (USB / off-site copy)"
                >
                  {uploading ? '⏳ Uploading…' : '📤 Upload từ máy khác…'}
                </button>
              </>
            )}
          </>
        )}
        {activeTab === 'code' && hasRole('admin') && (
          <button className="btn btn-primary" onClick={createCodeBackup}>
            Create Code Backup
          </button>
        )}
      </div>

      {/* Backup folder path — mirrors the IFS dataset path row so the user can
          see (and copy) the exact on-disk location where snapshots are stored. */}
      <div
        className="di-row-path bk-path-row"
        title="Folder where backups are stored on the server"
      >
        <span className="di-path-icon">📂</span>
        <input
          type="text"
          className="di-path-input"
          value={activeTab === 'data' ? dataDir : codeDir}
          readOnly
          spellCheck={false}
        />
        <button className="di-path-copy" title="Reload backup list" onClick={() => loadBackups()}>
          ↺
        </button>
        <button
          className="di-path-copy"
          title="Copy path"
          onClick={() => {
            const p = activeTab === 'data' ? dataDir : codeDir;
            if (p) {
              navigator.clipboard?.writeText(p);
              setMsg({ type: 'success', text: 'Path copied to clipboard' });
            }
          }}
        >
          ⧉
        </button>
      </div>

      {msg && <div className={`form-msg ${msg.type}`}>{msg.text}</div>}

      <div className="settings-card">
        <div className="table-wrap">
          <table className="data-table bk-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Filename</th>
                <th className="text-right">Size</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: 0 }}>
                    <EmptyState
                      icon="💾"
                      title="No backups yet"
                      hint="Trigger a manual backup from the button above or wait for the daily auto-backup."
                    />
                  </td>
                </tr>
              ) : (
                backups.map((b, i) => {
                  const sizeLbl =
                    b.size != null
                      ? b.size > 1024 * 1024
                        ? `${(b.size / 1024 / 1024).toFixed(1)} MB`
                        : `${(b.size / 1024).toFixed(1)} KB`
                      : '—';
                  const fileLbl = activeTab === 'code' && b.files ? ` (${b.files} files)` : '';
                  return (
                    <tr key={b.filename}>
                      <td className="row-num">{i + 1}</td>
                      <td className="cell-code">
                        {b.filename}
                        {fileLbl}
                      </td>
                      <td className="text-right mono">{sizeLbl}</td>
                      <td className="cell-date">{b.date || '—'}</td>
                      <td
                        className="cell-actions"
                        style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                      >
                        {activeTab === 'data' && (
                          <a
                            href={costApi.downloadBackup(b.filename)}
                            className="btn btn-sm"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        )}
                        {hasRole('sys') && (
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              activeTab === 'data'
                                ? restoreDataBackup(b.filename)
                                : restoreCodeBackup(b.filename)
                            }
                            title={
                              activeTab === 'data'
                                ? 'Restore data from this backup'
                                : 'Restore source code from this snapshot'
                            }
                          >
                            Restore
                          </button>
                        )}
                        {hasRole('sys') && (
                          <button
                            className="btn btn-sm"
                            onClick={() => deleteBackup(b.filename)}
                            style={{ color: '#dc2626' }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SYSTEM LOGS SECTION
// ═══════════════════════════════════════════════════════════

const IFS_LABELS = {
  inventory: 'Inventory',
  finishedGoods: 'Finished Goods',
  rawMaterials: 'Raw Materials',
  bom: 'BOM / Mfg Structures',
  routing: 'Routing Ops',
};

// ═══════════════════════════════════════════════════════════════
// Sprint 1.7b — BACKUP SCHEDULE CARD
// ═══════════════════════════════════════════════════════════════
//
// Admin-editable nightly backup schedule for the Settings → Backup tab.
// Mirrors how IFS Cloud / SAP HANA expose scheduled-backup config to
// admins: enable toggle, hour-of-day, retention days, last-run summary,
// "Run now" button. Persists to a JSON config file on the server so the
// schedule survives process restarts.

function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function BackupScheduleCard({ onRunDone }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState(null);
  // Form state — synced from `status` once loaded so admin can edit
  // without losing context if a refresh happens mid-typing.
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(2);
  const [retentionDays, setRetentionDays] = useState(30);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await costApi.getBackupSchedule();
      const s = r?.status || r;
      setStatus(s);
      if (s) {
        setEnabled(!!s.enabled);
        setHour(s.hour ?? 2);
        setRetentionDays(s.retentionDays ?? 30);
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to load schedule: ' + (err.message || 'unknown') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  async function handleSave() {
    setSaving(true);
    try {
      await costApi.setBackupSchedule({
        enabled,
        hour: Number(hour),
        retentionDays: Number(retentionDays),
      });
      flash('success', 'Schedule updated. Timer re-armed.');
      await reload();
    } catch (err) {
      flash('error', 'Save failed: ' + (err.message || 'unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (
      !confirm(
        'Run backup cycle right now?\n\nThis runs the same SQLite + Library backup the scheduler would. Takes ~5–30s depending on data size. Safe to run any time — backups are atomic.'
      )
    )
      return;
    setRunning(true);
    try {
      const r = await costApi.runBackupNow();
      const ok = r?.summary?.ok;
      const dur = fmtDuration(r?.summary?.durationMs);
      flash(
        ok ? 'success' : 'error',
        ok
          ? `Backup complete (${dur}). Check the list below.`
          : `Backup FAILED: ${r?.summary?.steps?.find((s) => !s.ok)?.error || 'unknown'}`
      );
      await reload();
      onRunDone?.();
    } catch (err) {
      flash('error', 'Run failed: ' + (err.message || 'unknown'));
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="bk-sched-card bk-sched-loading">Loading schedule…</div>;

  const dirty =
    status &&
    (enabled !== !!status.enabled ||
      Number(hour) !== Number(status.hour ?? 2) ||
      Number(retentionDays) !== Number(status.retentionDays ?? 30));

  // Hour options 00-23 — show as HH:00 24-hour format.
  const hourOpts = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bk-sched-card">
      <div className="bk-sched-head">
        <div className="bk-sched-icon">⏰</div>
        <div className="bk-sched-head-text">
          <div className="bk-sched-title">Scheduled backup · Sao lưu định kỳ</div>
          <div className="bk-sched-sub">
            {status?.enabled
              ? `Next run: ${fmtTime(status.nextRunAt)} (in ${fmtDuration(status.nextRunMs)})`
              : 'Scheduler disabled — only manual backups will run'}
          </div>
        </div>
        <button
          type="button"
          className="bk-sched-run-btn"
          onClick={handleRunNow}
          disabled={running}
          title="Trigger one backup cycle right now (independent of schedule)"
        >
          {running ? '⟳ Running…' : '▶ Run now'}
        </button>
      </div>

      <div className="bk-sched-form">
        <label className="bk-sched-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>
            <b>Enable nightly backup</b>
            <br />
            <small>Server runs the backup cycle once per day at the chosen hour.</small>
          </span>
        </label>

        <label className="bk-sched-row">
          <span className="bk-sched-label">Run at hour</span>
          <select
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            disabled={!enabled}
            className="bk-sched-input"
          >
            {hourOpts.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <small className="bk-sched-hint">
            Server local time. 02:00 is the default — pick low-activity hours.
          </small>
        </label>

        <label className="bk-sched-row">
          <span className="bk-sched-label">Retention (days)</span>
          <input
            type="number"
            min="1"
            max="3650"
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
            className="bk-sched-input"
          />
          <small className="bk-sched-hint">
            Snapshots older than this are pruned after each run (min 10 most-recent always kept).
          </small>
        </label>
      </div>

      <div className="bk-sched-last-run">
        <b>Last run:</b>{' '}
        {status?.lastRun ? (
          <>
            <span className={`bk-sched-badge ${status.lastRun.ok ? 'ok' : 'fail'}`}>
              {status.lastRun.ok ? '✓ OK' : '✗ FAILED'}
            </span>{' '}
            {fmtTime(status.lastRun.startedAt)}{' '}
            <small>
              ({fmtDuration(status.lastRun.durationMs)}, {status.lastRun.steps?.length || 0} steps)
            </small>
          </>
        ) : (
          <small>Never run on this server</small>
        )}
        {status?.lastError && (
          <div className="bk-sched-err">
            <b>Last error:</b> {status.lastError}
          </div>
        )}
      </div>

      <div className="bk-sched-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
        </button>
        {dirty && (
          <button type="button" className="btn" onClick={reload} disabled={saving}>
            Discard
          </button>
        )}
      </div>

      {msg && (
        <div className={`bk-sched-msg bk-sched-msg-${msg.type}`} role="status">
          {msg.text}
        </div>
      )}
    </div>
  );
}

function LogsSection() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importStatus, setImportStatus] = useState(null);

  useEffect(() => {
    loadLogs();
    const t = setInterval(loadLogs, 30000);
    return () => clearInterval(t);
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const [statusRes, importRes] = await Promise.all([
        costApi.getUsersStatus().catch(() => ({ users: [] })),
        api.get('/import/status').catch(() => null),
      ]);
      // Server returns `users: [{id, username, role, online, last_seen, full_name}, ...]`
      const list = Array.isArray(statusRes?.users) ? statusRes.users : [];
      // Only keep users who are actually online (filtered by the online flag)
      setOnlineUsers(list.filter((u) => u && u.online));
      setImportStatus(importRes);
    } catch (e) {
      console.error('Logs load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="tab-loading">Loading system info...</div>;

  return (
    <div className="settings-panel">
      <h3 className="panel-title">System Logs</h3>

      {/* Online Users */}
      <section className="log-section">
        <h4>
          Online Users{' '}
          {onlineUsers.length > 0 && <span className="log-count-badge">{onlineUsers.length}</span>}
        </h4>
        <div className="settings-card">
          {onlineUsers.length === 0 ? (
            <p className="empty-state" style={{ padding: 12 }}>
              No users online
            </p>
          ) : (
            <div className="online-grid">
              {onlineUsers.map((u) => (
                <div key={u.id} className="online-user">
                  <span className="status-dot online" />
                  <span className="online-user-name">{u.full_name || u.username}</span>
                  {u.role && <span className={`role-badge role-${u.role}`}>{u.role}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* IFS Data Status */}
      {importStatus && (
        <section className="log-section">
          <h4>IFS Data Status</h4>
          <div className="settings-card">
            <div className="data-status-grid">
              {Object.entries(importStatus).map(([key, info]) => (
                <div key={key} className={`data-status-item ${info.exists ? 'ds-ok' : 'ds-fail'}`}>
                  <div className="ds-row-top">
                    <span className={`ds-dot ${info.exists ? 'ok' : 'fail'}`} />
                    <span className="ds-label">
                      {IFS_LABELS[key] || key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className={`ds-badge ${info.exists ? 'ok' : 'fail'}`}>
                      {info.exists ? 'OK' : 'Not found'}
                    </span>
                  </div>
                  {info.exists && (
                    <div className="ds-row-meta">
                      <span className="ds-size">{info.sizeHuman}</span>
                      <span className="ds-date">
                        {new Date(info.modified).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Data Import — per-dataset upload / backup / reset */}
      <DataImportSection importStatus={importStatus} onRefresh={loadLogs} />

      {/* Sprint 36 — Audit log viewer. Sys-only access (server returns
          403 for lesser roles). Leverages the Sprint 31 filter API:
          event substring / user exact / since ISO. */}
      <AuditLogSection />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUDIT LOG SECTION (Sprint 36) — filterable viewer over
// /api/auth/audit-log. Uses the SQLite-backed endpoint
// (Sprint 30 migration). Non-sys users get 403 and the section
// surfaces an empty-state notice instead of crashing.
// ═══════════════════════════════════════════════════════════

function AuditLogSection() {
  const { user } = useAuth();
  const isSys = user?.role === 'sys';

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Two-tier state: "draft" filters track the inputs (instant), "applied"
  // filters drive the request (debounced 400 ms after user stops typing).
  // Manual Apply button is still wired for users who want immediate feedback.
  const [evFilter, setEvFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [sinceFilter, setSinceFilter] = useState(''); // <input type=date>
  const [limit, setLimit] = useState(100);
  const [appliedEv, setAppliedEv] = useState('');
  const [appliedUser, setAppliedUser] = useState('');
  const [appliedSince, setAppliedSince] = useState('');

  // Debounce: when any draft filter changes, wait 400 ms then promote to applied.
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedEv(evFilter);
      setAppliedUser(userFilter);
      setAppliedSince(sinceFilter);
    }, 400);
    return () => clearTimeout(t);
  }, [evFilter, userFilter, sinceFilter]);

  const loadAudit = React.useCallback(async () => {
    if (!isSys) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (appliedEv.trim()) params.set('event', appliedEv.trim());
      if (appliedUser.trim()) params.set('user', appliedUser.trim());
      if (appliedSince) {
        params.set('since', new Date(appliedSince).toISOString());
      }
      const res = await api.get(`/auth/audit-log?${params.toString()}`);
      setEntries(Array.isArray(res.entries) ? res.entries : []);
    } catch (e) {
      setError(e?.message || 'Load failed');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [isSys, limit, appliedEv, appliedUser, appliedSince]);

  useEffect(() => {
    loadAudit(); /* fire on applied-filter change only */
  }, [loadAudit]);

  if (!isSys) {
    return (
      <section className="log-section">
        <h4>Audit Log</h4>
        <div className="settings-card">
          <p className="empty-state" style={{ padding: 12 }}>
            Audit log requires sys role.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="log-section">
      <h4>
        Audit Log
        {entries.length > 0 && <span className="log-count-badge">{entries.length}</span>}
      </h4>
      <div className="settings-card" style={{ padding: 12 }}>
        <div
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'end' }}
        >
          <label style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b' }}>Event contains</span>
            <input
              type="text"
              value={evFilter}
              onChange={(e) => setEvFilter(e.target.value)}
              placeholder="e.g. LOGIN / APPROVE"
              style={{ padding: '4px 8px', width: 160 }}
            />
          </label>
          <label style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b' }}>User (exact)</span>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="username"
              style={{ padding: '4px 8px', width: 140 }}
            />
          </label>
          <label style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b' }}>Since</span>
            <input
              type="date"
              value={sinceFilter}
              onChange={(e) => setSinceFilter(e.target.value)}
              style={{ padding: '4px 8px' }}
            />
          </label>
          <label style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: '#64748b' }}>Limit</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ padding: '4px 8px' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={5000}>5000 (max)</option>
            </select>
          </label>
          <button
            className="op-btn op-btn-primary op-btn-sm"
            onClick={loadAudit}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Apply'}
          </button>
          <button
            className="op-btn op-btn-ghost op-btn-sm"
            onClick={() => {
              setEvFilter('');
              setUserFilter('');
              setSinceFilter('');
              setLimit(100);
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '6px 10px',
              marginBottom: 8,
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #991b1b',
              borderRadius: 2,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {entries.length === 0 && !loading && !error ? (
          <p className="empty-state" style={{ padding: 12 }}>
            No matching audit entries.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>Timestamp</th>
                  <th style={{ padding: '4px 6px' }}>Event</th>
                  <th style={{ padding: '4px 6px' }}>User</th>
                  <th style={{ padding: '4px 6px' }}>IP</th>
                  <th style={{ padding: '4px 6px' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${e.ts}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td
                      style={{
                        padding: '4px 6px',
                        whiteSpace: 'nowrap',
                        color: '#64748b',
                        fontFamily: 'monospace',
                      }}
                    >
                      {new Date(e.ts).toLocaleString('vi-VN')}
                    </td>
                    <td style={{ padding: '4px 6px', fontWeight: 600 }}>{e.event}</td>
                    <td style={{ padding: '4px 6px' }}>{e.user || '-'}</td>
                    <td style={{ padding: '4px 6px', color: '#64748b', fontFamily: 'monospace' }}>
                      {e.ip || '-'}
                    </td>
                    <td style={{ padding: '4px 6px', color: '#475569', wordBreak: 'break-word' }}>
                      {e.detail || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// DATA IMPORT SECTION — per-dataset upload / backup / reset
// ═══════════════════════════════════════════════════════════

const DATA_IMPORT_DATASETS = [
  {
    key: 'inventory',
    label: 'IFS Inventory',
    desc: 'Current stock levels synced from IFS',
    accept: '.csv,.xlsx,.xls',
    upload: (file) => importApi.uploadInventory(file),
    clear: () => importApi.clearInventory(),
    fetch: () => sharedApi.getInventory(),
    filename: 'inventory',
  },
  {
    key: 'finishedGoods',
    label: 'Finished Goods',
    desc: 'FG master data (part numbers, descriptions)',
    accept: '.csv,.xlsx,.xls',
    upload: (file) => importApi.uploadFinishedGoods(file),
    clear: () => importApi.clearFinishedGoods(),
    fetch: () => sharedApi.getProducts(),
    filename: 'finished_goods',
  },
  {
    key: 'rawMaterials',
    label: 'Raw Materials',
    desc: 'Raw material master data',
    accept: '.csv,.xlsx,.xls',
    upload: (file) => importApi.uploadRawMaterials(file),
    clear: () => importApi.clearRawMaterials(),
    fetch: () => sharedApi.getMaterials(),
    filename: 'raw_materials',
  },
  {
    key: 'bom',
    label: 'BOM / Mfg Structures',
    desc: 'Bill of materials for manufactured parts',
    accept: '.csv,.xlsx,.xls',
    upload: (file) => importApi.uploadBom(file),
    clear: () => importApi.clearBom(),
    fetch: () => sharedApi.getBOM(),
    filename: 'bom',
  },
  {
    key: 'routing',
    label: 'Routing Operations',
    desc: 'Process routing + work center assignments',
    accept: '.csv,.xlsx,.xls',
    upload: (file) => importApi.uploadRouting(file),
    clear: () => importApi.clearRouting(),
    fetch: () => sharedApi.getRouting(),
    filename: 'routing',
  },
];

function DataImportSection({ importStatus, onRefresh }) {
  const { hasRole } = useAuth();
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState(null);
  // Editable destination path per dataset — defaults to the server's
  // reported absolute path, user can override to save elsewhere.
  const [paths, setPaths] = useState({});
  const fileRefs = useRef({});
  const canEdit = hasRole('admin');

  // Seed path inputs from importStatus when it arrives / refreshes.
  useEffect(() => {
    if (!importStatus) return;
    setPaths((prev) => {
      const next = { ...prev };
      for (const ds of DATA_IMPORT_DATASETS) {
        const info = importStatus[ds.key];
        // Only seed if the user hasn't typed a custom value yet.
        if (!next[ds.key] && info?.absPath) next[ds.key] = info.absPath;
      }
      return next;
    });
  }, [importStatus]);

  function flash(type, text) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function setBusyFor(key, flag) {
    setBusy((prev) => ({ ...prev, [key]: flag }));
  }

  async function handleUpload(ds, file) {
    if (!file) return;
    setBusyFor(ds.key, 'import');
    try {
      await ds.upload(file);
      flash('success', `${ds.label} imported successfully`);
      onRefresh?.();
    } catch (e) {
      flash('error', `${ds.label} import failed: ${e.message || 'unknown'}`);
    } finally {
      setBusyFor(ds.key, null);
    }
  }

  async function handleBackup(ds) {
    // Server-side backup: copies the dataset's data file to the path
    // shown in the editable input. If the user leaves it at the default
    // (the original file path), the server picks a sibling folder with
    // a timestamped filename so the original isn't overwritten.
    setBusyFor(ds.key, 'backup');
    try {
      const info = importStatus?.[ds.key];
      const typed = (paths[ds.key] || '').trim();
      // If the user left the input as the current data file path,
      // pass undefined so the server auto-generates a timestamp name.
      const destPath = typed && typed !== info?.absPath ? typed : undefined;
      const r = await importApi.backup(ds.key, destPath);
      if (r?.ok) {
        flash('success', `${ds.label} backup saved to ${r.path}`);
      } else {
        throw new Error(r?.error || 'Backup failed');
      }
    } catch (e) {
      flash('error', `${ds.label} backup failed: ${e.message || 'unknown'}`);
    } finally {
      setBusyFor(ds.key, null);
    }
  }

  async function handleClear(ds) {
    if (
      !confirm(
        `Reset "${ds.label}" data?\n\nThe current dataset will be cleared. The server will auto-backup to /data/Backup/Data/ before wiping.\n\nThis cannot be undone via UI — restore must go through the server's Backup folder.`
      )
    )
      return;
    setBusyFor(ds.key, 'clear');
    try {
      await ds.clear();
      flash('success', `${ds.label} data cleared (backup kept on server)`);
      onRefresh?.();
    } catch (e) {
      flash('error', `${ds.label} clear failed: ${e.message || 'unknown'}`);
    } finally {
      setBusyFor(ds.key, null);
    }
  }

  return (
    <section className="log-section">
      <h4>Data Import</h4>
      <p className="di-hint">
        Each dataset below can be imported from a CSV/XLSX file, backed up as a local JSON snapshot,
        or reset. Import and reset require <b>Admin</b>+ role.
      </p>
      {msg && (
        <div className={`form-msg ${msg.type}`} style={{ marginBottom: 10 }}>
          {msg.text}
        </div>
      )}
      <div className="settings-card di-card">
        <div className="di-list">
          {DATA_IMPORT_DATASETS.map((ds) => {
            const info = importStatus?.[ds.key];
            const state = busy[ds.key];
            return (
              <div key={ds.key} className="di-row">
                <div className="di-row-info">
                  <div className="di-row-title">
                    <span className={`ds-dot ${info?.exists ? 'ok' : 'fail'}`} />
                    <span className="di-label">{ds.label}</span>
                    {info?.exists && <span className="di-size">{info.sizeHuman}</span>}
                  </div>
                  <div className="di-row-desc">{ds.desc}</div>
                  <div
                    className="di-row-path"
                    title="Path used by both Import (source) and Backup (destination). Click to edit."
                  >
                    <span className="di-path-icon">📂</span>
                    <input
                      type="text"
                      className="di-path-input"
                      value={paths[ds.key] || ''}
                      placeholder={info?.absPath || info?.path || '(file not found — set a path)'}
                      onChange={(e) => setPaths((prev) => ({ ...prev, [ds.key]: e.target.value }))}
                      spellCheck={false}
                    />
                    <button
                      className="di-path-copy"
                      title="Reset to default path"
                      disabled={!info?.absPath}
                      onClick={() => setPaths((prev) => ({ ...prev, [ds.key]: info.absPath }))}
                    >
                      ↺
                    </button>
                    <button
                      className="di-path-copy"
                      title="Copy path"
                      onClick={() => {
                        const p = paths[ds.key] || info?.absPath || info?.path || '';
                        if (p) navigator.clipboard?.writeText(p);
                        flash('success', 'Path copied to clipboard');
                      }}
                    >
                      ⧉
                    </button>
                  </div>
                </div>
                <div className="di-row-actions">
                  <input
                    ref={(el) => {
                      fileRefs.current[ds.key] = el;
                    }}
                    type="file"
                    accept={ds.accept}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(ds, f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    className="di-btn di-btn-import"
                    disabled={!canEdit || state === 'import'}
                    onClick={() => fileRefs.current[ds.key]?.click()}
                    title="Import CSV / XLSX"
                  >
                    {state === 'import' ? '⟳' : '↑'} Import
                  </button>
                  <button
                    className="di-btn di-btn-backup"
                    disabled={!info?.exists || state === 'backup'}
                    onClick={() => handleBackup(ds)}
                    title="Download as JSON"
                  >
                    {state === 'backup' ? '⟳' : '↓'} Backup
                  </button>
                  <button
                    className="di-btn di-btn-clear"
                    disabled={!canEdit || !info?.exists || state === 'clear'}
                    onClick={() => handleClear(ds)}
                    title="Wipe dataset (server auto-backs up)"
                  >
                    {state === 'clear' ? '⟳' : '✕'} Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
