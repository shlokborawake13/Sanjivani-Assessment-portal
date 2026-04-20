import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

/**
 * ProtectedRoute with role-based access control.
 * @param {string[]} allowedRoles - Roles that can access this route.
 *   If not provided, any authenticated user can access.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.role)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // If specific roles are required, check them
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Redirect to home on role mismatch
    return <Navigate to="/" replace />
  }

  return children
}
