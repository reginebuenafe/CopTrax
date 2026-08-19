import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LuLogOut, LuMenu, LuX, LuChevronRight,
  LuFlaskConical, LuClipboardList, LuSettings,
} from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../../components/NotificationBell";
import BrandLogo from "../../components/BrandLogo";

const NAV_ITEMS = [
  { to: "/dashboard/lab", label: "Inspection Queue", icon: LuFlaskConical, end: true },
  { to: "/dashboard/lab/history", label: "Inspection History", icon: LuClipboardList },
  { to: "/dashboard/lab/settings", label: "Settings", icon: LuSettings },
];

export default function LabLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || "LS";

  return (
    <div className="min-h-screen bg-beige flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-beige-dark/40 shadow-card z-40
        flex flex-col transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto`}>

        <div className="flex items-center gap-3 px-5 py-5 border-b border-beige-dark/30">
          <div className="w-9 h-9 bg-gradient-to-br from-green-dark to-green-light rounded-xl flex items-center justify-center shadow-sm p-1.5">
            <BrandLogo className="w-full h-full" size="100%" />
          </div>
          <div>
            <p className="font-extrabold text-green-dark text-sm leading-none">CopTrax</p>
            <p className="text-brown-light text-[10px] mt-0.5">Laboratory Staff</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-brown-light hover:text-brown-dark">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                ${isActive ? "bg-green-pale text-green-dark font-semibold" : "text-brown-mid hover:bg-beige hover:text-brown-dark"}`
              }>
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

        <div className="px-3 py-4 border-t border-beige-dark/30">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-beige">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-brown-dark text-sm font-semibold truncate">{profile?.first_name} {profile?.last_name}</p>
              <p className="text-brown-light text-[11px] truncate">{profile?.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut}
            className="mt-2 w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium
              text-brown-mid hover:bg-red-50 hover:text-red-600 transition-all duration-200">
            <LuLogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-beige-dark/30 px-5 py-3.5 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-brown-mid hover:text-brown-dark transition-colors">
            <LuMenu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>
        <main className="flex-1 p-5 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
