/**
 * Site access enforcement middleware.
 *
 * Allows ops to restrict which users can access which manufacturing
 * sites (VN, 41 RDC, 41 Flexo, 55 site, 49 site, 54 site, India).
 *
 * Behavior:
 *   - User.sites undefined/missing/[] → no restriction (all sites allowed).
 *     Preserves existing admin behavior — they see everything.
 *   - User.sites = ['VN', '41 RDC'] → requests must carry an acceptable
 *     site param via either:
 *       a) req.query.site
 *       b) req.body.site
 *       c) explicit middleware variant that reads from a URL param
 *   - Requests with no site param → allowed (read-only endpoints that
 *     don't filter by site; middleware just checks if present).
 *   - Requests with a site NOT in user.sites → 403 with clear error.
 *
 * Must run AFTER authMiddleware (needs req.user populated).
 */

export function enforceSiteAccess(req, res, next) {
  // authMiddleware wraps the real user as req.user.user.
  // If no auth, let the auth middleware reject. We don't re-check here.
  const user = req.user?.user || req.user;
  if (!user) return next();

  const restrictedSites = Array.isArray(user.sites) ? user.sites : [];
  // Empty or missing = unrestricted (legacy admin behavior)
  if (restrictedSites.length === 0) return next();

  // Extract the site claim from wherever the route tends to put it.
  const siteFromQuery = typeof req.query?.site === 'string' ? req.query.site : null;
  const siteFromBody = req.body && typeof req.body.site === 'string' ? req.body.site : null;
  const site = siteFromQuery || siteFromBody;

  // Requests that don't specify a site are allowed through — the route
  // itself decides whether to serve global data. Enforcement only kicks
  // in when the user explicitly names a site they shouldn't access.
  if (!site) return next();

  if (!restrictedSites.includes(site)) {
    return res.status(403).json({
      ok: false,
      error: 'site_access_denied',
      message: `You don't have access to site "${site}". Allowed: ${restrictedSites.join(', ')}`,
    });
  }
  next();
}

/**
 * Return the set of sites the user is allowed to see, or null for
 * unrestricted. Handy for routes that want to pre-filter results
 * (e.g. "list only quotes for my sites").
 */
export function allowedSitesFor(user) {
  if (!user) return null;
  const u = user.user || user; // unwrap req.user if caller passed wrapper
  const sites = Array.isArray(u.sites) ? u.sites : [];
  return sites.length === 0 ? null : sites;
}
