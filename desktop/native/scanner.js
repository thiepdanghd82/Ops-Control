/**
 * USB-HID barcode scanner bridge.
 *
 * Hai kiểu scanner phổ biến trong nhà máy:
 *
 *   1. "Keyboard wedge" — scanner mô phỏng bàn phím, gõ thẳng vào
 *      ô input đang focus rồi gửi Enter. KHÔNG cần module native;
 *      client tự lắng nghe `keydown` là đủ. (Đa số Honeywell, Symbol,
 *      Datalogic mặc định mode này.)
 *
 *   2. "Raw HID" — scanner gửi packet HID thuần, OS không inject làm
 *      keypress. Cần đọc qua node-hid. Phù hợp khi:
 *        • Cần phân biệt scan từ scanner vs keyboard typing
 *        • Cần đọc cả khi app không focus (kiosk mode)
 *        • Scanner gắn cố định cho 1 station, không muốn UX "ghost typing"
 *
 * File này implement mode 2 (Raw HID). Mode 1 không cần code phía
 * native — client chỉ cần `addEventListener('keydown')` + debounce.
 *
 * Reference: https://github.com/node-hid/node-hid
 */

'use strict';

let HID = null;
try {
  HID = require('node-hid');
} catch (err) {
  // node-hid không build được trên máy này — handler sẽ throw.
}

let activeDevice = null;
let activeBuffer = '';

// USB HID Usage Tables — phần Keyboard mapping. Chỉ encode đủ ASCII
// in được + Enter. Scanner thường chỉ phát ASCII printable + CR.
// Tham chiếu: HID Usage Tables 1.4, section 10 (Keyboard/Keypad page).
const HID_KEY_MAP = {
  4: 'a', 5: 'b', 6: 'c', 7: 'd', 8: 'e', 9: 'f', 10: 'g', 11: 'h',
  12: 'i', 13: 'j', 14: 'k', 15: 'l', 16: 'm', 17: 'n', 18: 'o', 19: 'p',
  20: 'q', 21: 'r', 22: 's', 23: 't', 24: 'u', 25: 'v', 26: 'w', 27: 'x',
  28: 'y', 29: 'z',
  30: '1', 31: '2', 32: '3', 33: '4', 34: '5',
  35: '6', 36: '7', 37: '8', 38: '9', 39: '0',
  40: '\n', // Enter — terminator
  44: ' ',
  45: '-', 46: '=', 47: '[', 48: ']', 49: '\\',
  51: ';', 52: "'", 53: '`', 54: ',', 55: '.', 56: '/',
};

function decodeHidPacket(buf) {
  // Boot keyboard report: byte0 = modifier, byte1 = reserved, byte2..7 = keys
  // Scanner thường chỉ phát 1 ký tự mỗi packet, nhưng vẫn handle multi.
  if (buf.length < 3) return '';
  const modifier = buf[0];
  const shift = (modifier & 0x22) !== 0; // Left or Right Shift
  let out = '';
  for (let i = 2; i < Math.min(buf.length, 8); i++) {
    const code = buf[i];
    if (code === 0) continue;
    let ch = HID_KEY_MAP[code];
    if (!ch) continue;
    if (shift && /[a-z]/.test(ch)) ch = ch.toUpperCase();
    if (shift && /[0-9]/.test(ch)) {
      // shift+number = symbol theo US layout
      ch = ')!@#$%^&*('[parseInt(ch, 10)];
    }
    out += ch;
  }
  return out;
}

function register(ipcMain, log) {
  ipcMain.handle('ops:scanner.listDevices', async () => {
    if (!HID) throw new Error('node-hid module not available');
    // Filter chỉ giữ thiết bị có usagePage = 0x01 (Generic Desktop)
    // và usage = 0x06 (Keyboard) — đa số scanner báo cáo như keyboard.
    return HID.devices().filter((d) => {
      // Một số driver không expose usage; ta giữ luôn nếu manufacturer
      // string chứa keyword scanner phổ biến.
      const isKeyboardLike = d.usagePage === 0x01 && d.usage === 0x06;
      const looksLikeScanner = /honeywell|symbol|datalogic|zebra|newland|opticon/i
        .test(`${d.manufacturer || ''} ${d.product || ''}`);
      return isKeyboardLike || looksLikeScanner;
    }).map((d) => ({
      vendorId: d.vendorId,
      productId: d.productId,
      manufacturer: d.manufacturer,
      product: d.product,
      serialNumber: d.serialNumber,
      path: d.path,
    }));
  });

  ipcMain.handle('ops:scanner.open', async (evt, vendorId, productId) => {
    if (!HID) throw new Error('node-hid module not available');
    if (activeDevice) {
      try { activeDevice.close(); } catch (_) { /* swallow */ }
      activeDevice = null;
    }
    activeBuffer = '';

    activeDevice = new HID.HID(vendorId, productId);
    activeDevice.on('data', (buf) => {
      const decoded = decodeHidPacket(buf);
      if (!decoded) return;

      for (const ch of decoded) {
        if (ch === '\n') {
          // Terminator — emit barcode hoàn chỉnh
          if (activeBuffer.length > 0) {
            evt.sender.send('ops:scanner.scan', {
              code: activeBuffer,
              timestamp: Date.now(),
            });
            activeBuffer = '';
          }
        } else {
          activeBuffer += ch;
        }
      }
    });
    activeDevice.on('error', (err) => {
      log.error('[scanner] Error:', err);
      try { activeDevice?.close(); } catch (_) { /* swallow */ }
      activeDevice = null;
    });

    log.info(`[scanner] Opened HID ${vendorId}:${productId}`);
    return { ok: true, vendorId, productId };
  });

  ipcMain.handle('ops:scanner.close', async () => {
    if (activeDevice) {
      try { activeDevice.close(); } catch (_) { /* swallow */ }
      activeDevice = null;
      activeBuffer = '';
      log.info('[scanner] Closed');
    }
    return { ok: true };
  });
}

module.exports = { register };
