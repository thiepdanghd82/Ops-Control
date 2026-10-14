/**
 * Electronic scale bridge — RS232 / USB-Serial.
 *
 * Cân điện tử công nghiệp (Mettler Toledo, Ohaus, A&D, Cas) thường
 * có cổng RS232 hoặc USB virtual COM. Mỗi hãng dùng protocol riêng,
 * thường là ASCII text "12.345 kg\r\n" gửi liên tục hoặc theo lệnh
 * "P\r" / "S\r".
 *
 * File này implement protocol chung nhất:
 *   - Mở serial port với baudRate (9600 mặc định, một số 4800)
 *   - Lắng nghe data event, parse line theo regex
 *   - Push weight qua IPC sự kiện 'ops:scale.weight'
 *
 * Cấu hình protocol cụ thể (regex parse, command "S\r" hay "P\r")
 * nên để Ops Control config được trong settings — KHÔNG hardcode.
 */

'use strict';

let SerialPort = null;
let ReadlineParser = null;
try {
  ({ SerialPort } = require('serialport'));
  ({ ReadlineParser } = require('@serialport/parser-readline'));
} catch (err) {
  // Module không cài được → handler sẽ throw error có ý nghĩa
}

let activePort = null;
let activeParser = null;
let lastWeight = null;

// Protocol mặc định: trích số float từ chuỗi (handle "12.345 kg",
// "  12.345kg ST", "+0012.345g GS", ...). Operator có thể override
// regex từ Ops Control settings.
const DEFAULT_WEIGHT_REGEX = /([+-]?\d+(?:\.\d+)?)\s*(kg|g|lb)?/i;

function parseWeight(line, regex = DEFAULT_WEIGHT_REGEX) {
  const m = line.match(regex);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return null;
  return { value, unit: (m[2] || 'kg').toLowerCase(), raw: line };
}

function register(ipcMain, log) {
  ipcMain.handle('ops:scale.listPorts', async () => {
    if (!SerialPort) throw new Error('serialport module not available');
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      productId: p.productId,
      vendorId: p.vendorId,
      serialNumber: p.serialNumber,
    }));
  });

  ipcMain.handle('ops:scale.open', async (evt, portPath, baudRate = 9600) => {
    if (!SerialPort) throw new Error('serialport module not available');
    if (activePort) {
      activePort.close();
      activePort = null;
    }
    return new Promise((resolve, reject) => {
      activePort = new SerialPort({ path: portPath, baudRate }, (err) => {
        if (err) {
          log.error('[scale] open failed:', err);
          activePort = null;
          return reject(err);
        }
        activeParser = activePort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        activeParser.on('data', (line) => {
          const weight = parseWeight(line);
          if (weight) {
            lastWeight = weight;
            evt.sender.send('ops:scale.weight', weight);
          }
        });
        log.info(`[scale] Opened ${portPath} @ ${baudRate}`);
        resolve({ ok: true, path: portPath, baudRate });
      });
    });
  });

  ipcMain.handle('ops:scale.close', async () => {
    if (activePort) {
      activePort.close();
      activePort = null;
      activeParser = null;
      log.info('[scale] Closed');
    }
    return { ok: true };
  });

  ipcMain.handle('ops:scale.read', async () => {
    return lastWeight || { value: 0, unit: 'kg', raw: 'no-data' };
  });
}

module.exports = { register };
