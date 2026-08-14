import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRoles, redirectTo = "/login" }) {
  const { session, role, accountStatus, isLoading, sessionExpired } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="w-8 h-8 border-4 border-green-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    // Distinguish between "never logged in" and "session was terminated"
    const loginUrl = sessionExpired
      ? `${redirectTo}?reason=expired`
      : redirectTo;
    return <Navigate to={loginUrl} replace />;
  }

  if (accountStatus === "Pending")  return <Navigate to="/pending-approval" replace />;
  if (accountStatus === "Rejected") return <Navigate to="/login?reason=rejected" replace />;
  if (accountStatus === "Deleted")  return <Navigate to="/login?reason=deleted" replace />;

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
