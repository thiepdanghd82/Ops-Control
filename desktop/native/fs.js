/**
 * Sandboxed filesystem helpers — open/save dialog + read/write file.
 *
 * Renderer KHÔNG được quyền truy cập node `fs` trực tiếp (security).
 * File này expose 4 thao tác đủ dùng cho Ops Control:
 *
 *   - showSaveDialog → user chọn nơi save (PDF quote, Excel report)
 *   - showOpenDialog → user chọn file import (xlsx, csv)
 *   - writeFile      → ghi buffer / string xuống đường dẫn user vừa pick
 *   - readFile       → đọc file user vừa pick
 *
 * Quan trọng: chỉ chấp nhận đường dẫn user vừa được dialog trả về
 * trong cùng phiên. Tránh trường hợp renderer arbitrary path traversal
 * như `/etc/passwd`. Ta lưu whitelist các path đã được dialog trả ra.
 *
 * Mở rộng tương lai: với file lớn (> 10 MB) nên stream chunks qua
 * MessagePort thay vì load nguyên buffer vào IPC.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dialog, BrowserWindow, app } = require('electron');

// In-memory whitelist các path mà dialog đã trả về — renderer chỉ
// được read/write những path này. Reset mỗi lần app restart.
const allowedPaths = new Set();

function rememberPath(p) {
  if (typeof p === 'string' && p.length > 0) {
    allowedPaths.add(path.normalize(p));
  }
}

function isAllowed(p) {
  if (typeof p !== 'string') return false;
  const norm = path.normalize(p);
  if (allowedPaths.has(norm)) return true;
  // Cho phép cả path bên trong userData (cho cache, logs, exports default)
  const userData = path.normalize(app.getPath('userData'));
  return norm.startsWith(userData + path.sep);
}

function register(ipcMain, log) {
  ipcMain.handle('ops:fs.showSaveDialog', async (evt, opts = {}) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const result = await dialog.showSaveDialog(win, {
      title: opts.title || 'Lưu tệp',
      defaultPath: opts.defaultPath,
      filters: opts.filters || [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Excel', extensions: ['xlsx', 'xls'] },
        { name: 'Tất cả', extensions: ['*'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (!result.canceled && result.filePath) {
      rememberPath(result.filePath);
    }
    return result;
  });

  ipcMain.handle('ops:fs.showOpenDialog', async (evt, opts = {}) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const result = await dialog.showOpenDialog(win, {
      title: opts.title || 'Chọn tệp',
      defaultPath: opts.defaultPath,
      filters: opts.filters || [
        { name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Hình ảnh', extensions: ['png', 'jpg', 'jpeg'] },
        { name: 'Tất cả', extensions: ['*'] },
      ],
      properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (!result.canceled) {
      for (const p of result.filePaths) rememberPath(p);
    }
    return result;
  });

  ipcMain.handle('ops:fs.writeFile', async (_evt, filePath, data) => {
    if (!isAllowed(filePath)) {
      throw new Error(
        `Path not allowed: ${filePath} (must come from showSaveDialog or be inside userData)`
      );
    }
    // data có thể là Buffer (Uint8Array sau IPC marshalling) hoặc string
    const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(String(data), 'utf8');
    await fs.promises.writeFile(filePath, buf);
    log.info(`[fs] Wrote ${buf.length} bytes to ${filePath}`);
    return { ok: true, bytes: buf.length, path: filePath };
  });

  ipcMain.handle('ops:fs.readFile', async (_evt, filePath) => {
    if (!isAllowed(filePath)) {
      throw new Error(`Path not allowed: ${filePath}`);
    }
    const buf = await fs.promises.readFile(filePath);
    // Trả về như Uint8Array — renderer có thể tự decode
    return new Uint8Array(buf);
  });
}

module.exports = { register };
