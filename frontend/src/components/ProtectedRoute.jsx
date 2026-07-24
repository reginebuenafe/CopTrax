import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/**
 * Wraps a route and enforces:
 *  - authenticated session
 *  - optional role check
 *  - account must be Active (not Pending/Rejected)
 *
 * Props:
 *   allowedRoles?: string[]   — if omitted, any authenticated role is allowed
 *   redirectTo?: string       — where to send unauthenticated users (default: /login)
 */
export default function ProtectedRoute({ children, allowedRoles, redirectTo = "/login" }) {
  const { session, role, accountStatus, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="w-8 h-8 border-4 border-green-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to={redirectTo} replace />;

  if (accountStatus === "Pending") return <Navigate to="/pending-approval" replace />;
  if (accountStatus === "Rejected") return <Navigate to="/login?reason=rejected" replace />;

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
