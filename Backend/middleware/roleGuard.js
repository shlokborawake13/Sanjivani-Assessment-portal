/**
 * Role guard middleware factory.
 * Usage: roleGuard('admin') or roleGuard('admin', 'manager')
 */
export function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.profile) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const userRole = req.user.profile.role
    if (!allowedRoles.includes(userRole)) {
      console.warn(`[RoleGuard] DENIED: user ${req.user.id} has role="${userRole}", required=${allowedRoles.join('|')}`)
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}. Your role: ${userRole}`
      })
    }

    next()
  }
}
