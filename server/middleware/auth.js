/**
 * Auth Middleware — uses local session store (no Python dependency)
 */
import { getSessionUser, getTokenFromHeader } from '../services/authService.js';

export function authMiddleware(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = getSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user info matching the format used by shared/planning routes
  req.user = {
    ok: true,
    user: user,
    role: user.role,
    modules: user.modules || { cost: true, planning: true },
  };
  next();
}

/**
 * Role-based access control
 * @param {number} minLevel - Minimum role level required (1=viewonly, 5=sys)
 */
export function requireRole(minLevel) {
  const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

  return (req, res, next) => {
    const userRole = req.user?.user?.role || req.user?.role;
    const userLevel = ROLE_LEVELS[userRole] || 0;
    if (userLevel < minLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Module access control
 * @param {string} moduleName - Module name ('cost' or 'planning')
 */
export function requireModule(moduleName) {
  return (req, res, next) => {
    const modules = req.user?.user?.modules || req.user?.modules || { cost: true, planning: true };
    if (!modules[moduleName]) {
      return res.status(403).json({ error: `No access to ${moduleName} module` });
    }
    next();
  };
}
