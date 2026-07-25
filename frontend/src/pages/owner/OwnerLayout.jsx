import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LuLeaf, LuUsers, LuLogOut, LuMenu, LuX, LuChevronRight,
  LuLayoutDashboard, LuFileText, LuTruck, LuFlaskConical,
  LuWallet, LuPackage, LuStar, LuMessageSquare, LuFileChartColumn,
} from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../../components/NotificationBell";

const NAV_ITEMS = [
  { to: "/dashboard/owner", label: "Overview", icon: LuLayoutDashboard, end: true },
  { to: "/dashboard/owner/users", label: "User Management", icon: LuUsers },
  { to: "/dashboard/owner/conversations", label: "Negotiations", icon: LuMessageSquare },
  { to: "/dashboard/owner/contracts", label: "Contracts", icon: LuFileText },
  { to: "/dashboard/owner/deliveries", label: "Deliveries", icon: LuTruck },
  { to: "/dashboard/owner/quality", label: "Quality Results", icon: LuFlaskConical },
  { to: "/dashboard/owner/payments", label: "Payments", icon: LuWallet },
  { to: "/dashboard/owner/inventory", label: "Inventory", icon: LuPackage },
  { to: "/dashboard/owner/suppliers", label: "Supplier Ratings", icon: LuStar },
  { to: "/dashboard/owner/reports", label: "Reports", icon: LuFileChartColumn },
];

export default function OwnerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || "BO";

  return (
    <div className="min-h-screen bg-beige flex">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-beige-dark/40 shadow-card z-40
          flex flex-col transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-beige-dark/30">
          <div className="w-9 h-9 bg-gradient-to-br from-green-dark to-green-light rounded-xl flex items-center justify-center shadow-sm">
            <LuLeaf className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-green-dark text-sm leading-none">CopTrax</p>
            <p className="text-brown-light text-[10px] mt-0.5">Business Owner</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-brown-light hover:text-brown-dark"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                ${isActive
                  ? "bg-green-pale text-green-dark font-semibold"
                  : "text-brown-mid hover:bg-beige hover:text-brown-dark"}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-green-dark" : "text-brown-light group-hover:text-brown-mid"}`} />
                  <span className="flex-1">{label}</span>
                  {isActive && <LuChevronRight className="w-3.5 h-3.5 text-green-mid" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
        <div className="px-3 py-4 border-t border-beige-dark/30">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-beige">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-brown-dark text-sm font-semibold truncate">
                {profile?.first_name} {profile?.last_name}
              </p>
              <p className="text-brown-light text-[11px] truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-2 w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium
              text-brown-mid hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LuLogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-beige-dark/30 px-5 py-3.5 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-brown-mid hover:text-brown-dark transition-colors"
          >
            <LuMenu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
