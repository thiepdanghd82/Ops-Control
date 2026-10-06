/**
 * Which peers may set the client IP through X-Forwarded-For (2026-10-06).
 *
 * Only a proxy on this machine: deploy.sh's optional nginx proxies to
 * 127.0.0.1, so its hop is loopback and the client it forwards becomes
 * req.ip. Everyone else — LAN clients reaching the desktop SERVER (:3100) or
 * the NSSM install (:3000) directly — is their own socket address, whatever
 * header they send. The previous hop count of 1 trusted ANY first hop, so a
 * client connecting directly could name its own IP: forged audit-log IPs and
 * per-IP rate limits slipped by rotating the header.
 *
 * A deployment behind a proxy on ANOTHER machine must list that proxy's
 * address or subnet here (Express `trust proxy` syntax), or every client
 * reads as the proxy.
 */
export const TRUST_PROXY = 'loopback';
