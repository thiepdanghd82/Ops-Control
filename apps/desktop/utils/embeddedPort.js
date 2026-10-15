/**
 * embeddedPort — the one port the embedded server listens on.
 *
 * LAN clients are configured with http://<server-ip>:<port>, so the port
 * must not move. main.js used to scan 3100–3199 and take the first free
 * one, so a busy 3100 (another program, or the previous instance not yet
 * closed) silently moved the server and broke every client. The port is now
 * fixed — the setup wizard's Network step (store key `serverPort`), else
 * 3100 — and a busy port is waited on briefly, then reported, never swapped.
 */

'use strict';
const net = require('node:net');

const DEFAULT_SERVER_PORT = 3100;

function resolveServerPort(stored) {
  const p = Number(stored);
  return Number.isInteger(p) && p >= 1024 && p <= 65535 ? p : DEFAULT_SERVER_PORT;
}

// Bind-test on 0.0.0.0: the server binds every interface, so a 127.0.0.1
// test can pass while *:port is already taken.
function isPortFree(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });
}

async function acquireServerPort(port, { attempts = 20, delayMs = 500, probe = isPortFree } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (await probe(port)) return port;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  const err = new Error(
    `Cổng ${port} đang bị một chương trình khác sử dụng nên server không khởi động được. ` +
      `Các máy trạm kết nối vào đúng cổng này, vì vậy server không tự chuyển sang cổng khác. ` +
      `Hãy đóng chương trình đang giữ cổng ${port} (xem bằng: lsof -nP -iTCP:${port} -sTCP:LISTEN) rồi mở lại app.`
  );
  err.code = 'EADDRINUSE';
  throw err;
}

module.exports = { DEFAULT_SERVER_PORT, resolveServerPort, isPortFree, acquireServerPort };
