/**
 * networkInfo.js — server-side LAN IP detection for the connection-info
 * admin dashboard (Phase A.2).
 *
 * Pattern extracted from desktop/main.js:188+206 (which already calls
 * os.networkInterfaces() for port-conflict checks). Centralised here so
 * GET /api/server-info, future scripts, and any LAN-discovery work can
 * share the same heuristic.
 *
 * Pure helpers — only Node's built-in os module. No I/O. Easily testable.
 */

import os from 'node:os';

/**
 * Heuristic interface preference: ethernet > wifi > everything else.
 * Lower number = higher preference. Used to sort candidates so the
 * "auto-pick" of pickServerUrl() matches what an operator on a typical
 * LAN expects.
 */
export function prefRank(iface) {
  if (/^(en|eth)/i.test(iface)) return 0;
  if (/^(wlan|wlp|wl|wifi)/i.test(iface)) return 1;
  if (/^(bridge|vbox|tun|utun|docker|veth|vnic)/i.test(iface)) return 9;
  return 5;
}

/**
 * Enumerate all IPv4 non-internal addresses with their interface name.
 * Returns [] if no LAN IPs detected (e.g. server running fully offline).
 *
 * Sort order: ethernet > wifi > generic > virtual (per prefRank).
 */
export function listLanIPv4(_ifacesProvider) {
  // Provider hook is for tests — production always uses os.networkInterfaces().
  const ifaces = (_ifacesProvider || os.networkInterfaces)();
  const out = [];
  for (const [name, addrs] of Object.entries(ifaces || {})) {
    for (const a of addrs || []) {
      if (a && a.family === 'IPv4' && !a.internal) {
        out.push({ iface: name, address: a.address, netmask: a.netmask });
      }
    }
  }
  return out.sort((a, b) => prefRank(a.iface) - prefRank(b.iface));
}

/**
 * Pick the best LAN URL given a port. Returns null if no IP detected.
 * Matches the desktop/main.js auto-pick semantics so a server discovered
 * via `pickServerUrl(3000)` is reachable from any LAN client.
 */
export function pickServerUrl(port, _ifacesProvider) {
  const list = listLanIPv4(_ifacesProvider);
  if (!list.length) return null;
  return `http://${list[0].address}:${port}`;
}
