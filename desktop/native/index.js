/**
 * Native bridge registry — kết nối IPC channels với phần cứng.
 *
 * Mỗi module (printer/zebra/scale/scanner) tự handle phần native.
 * File này chỉ orchestrate: gọi register() cho từng module.
 *
 * Nếu một native module không cài được trên hệ thống user (ví dụ
 * `serialport` thiếu build tool), ta degrade gracefully — IPC handler
 * trả về error có ý nghĩa thay vì crash main process.
 */

'use strict';

const path = require('node:path');
const { dialog } = require('electron');

function safeLoad(modulePath, name, log) {
  try {
    return require(modulePath);
  } catch (err) {
    log.warn(`[native] Failed to load ${name}: ${err.message}`);
    return null;
  }
}

function registerNativeBridges(ipcMain, log) {
  const printer = safeLoad('./printer', 'printer', log);
  const zebra = safeLoad('./zebra', 'zebra', log);
  const scale = safeLoad('./scale', 'scale', log);
  const scanner = safeLoad('./scanner', 'scanner', log);
  const cache = safeLoad('./cache', 'cache', log);
  const fsBridge = safeLoad('./fs', 'fs', log);
  const importBridge = safeLoad('./import', 'import', log);

  if (printer) printer.register(ipcMain, log);
  if (zebra) zebra.register(ipcMain, log);
  if (scale) scale.register(ipcMain, log);
  if (scanner) scanner.register(ipcMain, log);
  if (cache) cache.register(ipcMain, log);
  if (fsBridge) fsBridge.register(ipcMain, log);
  if (importBridge) importBridge.register(ipcMain, log);

  // Auto-update IPC
  ipcMain.handle('ops:updater.check', () => {
    const { initAutoUpdater } = require('../auto-update.js');
    initAutoUpdater(true);
  });
  ipcMain.handle('ops:updater.download', async () => {
    const { autoUpdater } = require('electron-updater');
    return autoUpdater.downloadUpdate();
  });
  ipcMain.handle('ops:updater.install', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall(false, true);
  });
  // Note: 2 require trên chỉ chạy khi user click menu — sau khi app ready.
  // Không bị eager-init bug như khi require ở top-level.

  log.info('[native] Bridges registered');
}

module.exports = { registerNativeBridges };
