/**
 * Auto-update — wrapper quanh electron-updater
 *
 * Update channel mặc định là "latest", trỏ về http://10.102.3.61/updates/
 * (cấu hình trong package.json > build.publish).
 *
 * Workflow:
 *   1. App khởi động → silent check (sau 5s)
 *   2. Có update → tự download trong nền
 *   3. Download xong → hiện thông báo, hỏi user khởi động lại
 *   4. User chọn "Restart now" → app.quit() → installer chạy
 *
 * Code-signing là tiền đề: Windows installer phải được ký
 * (Sectigo/DigiCert EV cert), nếu không SmartScreen sẽ chặn.
 * Trong dev/PoC mặc định verifyUpdateCodeSignature=false để test.
 */

'use strict';

const { dialog, BrowserWindow, app } = require('electron');
const log = require('electron-log/main');

// electron-updater@6 initialise eagerly — accessing autoUpdater touches
// the Electron `app` adapter. Nếu require trước khi app ready thì sẽ
// throw "Cannot read properties of undefined (reading 'getVersion')".
// Lazy init qua getter — chỉ load khi `initAutoUpdater` được gọi
// (mà nơi gọi đảm bảo đã `app.whenReady()`).
let _autoUpdater = null;
function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  _autoUpdater = require('electron-updater').autoUpdater;
  _autoUpdater.logger = log;
  _autoUpdater.autoDownload = true;
  _autoUpdater.autoInstallOnAppQuit = true;
  return _autoUpdater;
}

let initialized = false;
let lastStatus = { state: 'idle' };

function broadcast(status) {
  lastStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('ops:updater.status', status);
    }
  }
}

function attachListeners() {
  if (initialized) return;
  initialized = true;
  const autoUpdater = getAutoUpdater();

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Checking for updates...');
    broadcast({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version);
    broadcast({ state: 'available', version: info.version, releaseNotes: info.releaseNotes });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] No update available');
    broadcast({ state: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err);
    broadcast({ state: 'error', message: err.message });
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[updater] Download progress: ${progress.percent.toFixed(1)}%`);
    broadcast({
      state: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] Update downloaded:', info.version);
    broadcast({ state: 'downloaded', version: info.version });

    const win = BrowserWindow.getAllWindows()[0];
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Ops Control — Cập nhật sẵn sàng',
        message: `Phiên bản ${info.version} đã tải xong.`,
        detail:
          'Khởi động lại để cài đặt phiên bản mới.\n\nNếu chọn "Để sau", bản cập nhật sẽ tự cài khi anh thoát Ops Control.',
        buttons: ['Khởi động lại', 'Để sau'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          getAutoUpdater().quitAndInstall(false, true);
        }
      });
  });
}

/**
 * Trigger update check.
 * @param {boolean} userInitiated - True nếu user click menu "Kiểm tra cập nhật".
 *   Khi true, hiện dialog "không có update" để user biết đã check.
 *   Khi false (silent), không bao giờ làm phiền user nếu không có update.
 */
function initAutoUpdater(userInitiated = false) {
  attachListeners();

  if (!app.isPackaged) {
    log.info('[updater] Skipping update check in dev mode');
    if (userInitiated) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Ops Control',
        message: 'Auto-update không hoạt động trong chế độ dev.',
      });
    }
    return;
  }

  getAutoUpdater()
    .checkForUpdates()
    .then((result) => {
      if (userInitiated && result?.updateInfo?.version === app.getVersion()) {
        const win = BrowserWindow.getAllWindows()[0];
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Ops Control',
          message: 'Đang dùng phiên bản mới nhất.',
          detail: `v${app.getVersion()}`,
        });
      }
    })
    .catch((err) => {
      log.error('[updater] checkForUpdates failed:', err);
      if (userInitiated) {
        const win = BrowserWindow.getAllWindows()[0];
        dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Ops Control',
          message: 'Không kiểm tra được cập nhật.',
          detail: err.message,
        });
      }
    });
}

module.exports = { initAutoUpdater, getStatus: () => lastStatus };
