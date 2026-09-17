import { Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../Navbar";
import Footer from "../Footer";

// Same role destinations used by the existing login flow.
const ROLE_DASHBOARDS = {
  "Business Owner": "/dashboard/owner",
  Supplier: "/dashboard/supplier",
  Weigher: "/dashboard/weigher",
  "Laboratory Staff": "/dashboard/lab",
};

// Scoped to Help, Privacy, and Terms; other public pages keep their own shell.
export default function SupportPageLayout() {
  const { session, user, role, isLoading } = useAuth();
  const signedIn = Boolean(user);
  // Wait for session restoration to avoid flashing the public nav for signed-in users.
  const showPublicNavbar = session === null;
  const returnTo = signedIn ? (ROLE_DASHBOARDS[role] ?? "/login") : "/";

  return (
    <>
      {showPublicNavbar && <Navbar />}
      <main className="min-h-screen">
        <Outlet context={{
          showPublicNavbar,
          returnTo,
          returnLabel: signedIn ? "Back to Dashboard" : "Back to Homepage",
          navigationPending: isLoading,
        }} />
      </main>
      <Footer />
    </>
  );
}
