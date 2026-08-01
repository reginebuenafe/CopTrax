import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRoles, redirectTo = "/login" }) {
  const { session, role, accountStatus, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="w-8 h-8 border-4 border-green-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No session — may be expired or never logged in
  if (!session) {
    const wasAuthed = !!location.state?.from;
    return <Navigate to={`${redirectTo}?reason=expired`} replace />;
  }

  if (accountStatus === "Pending") return <Navigate to="/pending-approval" replace />;
  if (accountStatus === "Rejected") return <Navigate to="/login?reason=rejected" replace />;
  if (accountStatus === "Deleted") return <Navigate to="/login?reason=deleted" replace />;

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
