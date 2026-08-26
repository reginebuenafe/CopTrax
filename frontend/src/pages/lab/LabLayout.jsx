import { useState, useEffect } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LuLogOut, LuMenu, LuX, LuChevronRight, LuChevronLeft,
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

const SIDEBAR_FULL = 256;
const SIDEBAR_MINI = 64;

export default function LabLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("coptrax_lab_sidebar_collapsed") === "true"
  );
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("coptrax_lab_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || "LS";

  return (
    <div className="min-h-screen bg-beige flex"
      style={{ "--sidebar-w": `${collapsed ? SIDEBAR_MINI : SIDEBAR_FULL}px` }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-screen bg-[#FFFEFB] border-r border-[#E4D5BD] z-40
        shadow-[2px_0_12px_rgba(93,64,55,0.06)] flex flex-col transition-all duration-300
        w-64 lg:w-[var(--sidebar-w)]
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>

        {/* Brand */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-[#E4D5BD] shrink-0 ${collapsed ? "justify-center lg:px-2" : ""}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-green-dark to-green-light rounded-xl flex items-center justify-center shadow-sm p-1.5 shrink-0">
            <BrandLogo className="w-full h-full" size="100%" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-extrabold text-[#4E342E] text-sm leading-none">CopTrax</p>
              <p className="text-[#9A8176] text-[10px] mt-0.5">Laboratory Staff</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-[#9A8176] hover:text-[#4E342E]">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 group
                ${collapsed ? "justify-center px-0 py-3" : "px-3.5 py-2.5"}
                ${isActive ? "bg-green-pale text-green-dark font-semibold" : "text-[#765D52] hover:bg-[#F7F0E5] hover:text-[#4E342E]"}`}>
              {({ isActive }) => (
                <>
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-green-dark" : "text-[#9A8176] group-hover:text-[#765D52]"}`} />
                  {!collapsed && <span className="flex-1">{label}</span>}
                  {!collapsed && isActive && <LuChevronRight className="w-3.5 h-3.5 text-green-mid" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
        {!collapsed ? (
          <div className="px-3 py-4 border-t border-[#E4D5BD] shrink-0">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-beige">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#4E342E] text-sm font-semibold truncate">{profile?.first_name} {profile?.last_name}</p>
                <p className="text-[#9A8176] text-[11px] truncate">{profile?.email}</p>
              </div>
            </div>
            <button onClick={handleSignOut}
              className="mt-2 w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium
                text-[#765D52] hover:bg-red-50 hover:text-red-600 transition-all duration-200">
              <LuLogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 border-t border-[#E4D5BD] gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <button onClick={handleSignOut} title="Sign Out"
              className="p-2 rounded-xl text-[#765D52] hover:bg-red-50 hover:text-red-600 transition-all">
              <LuLogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Collapse toggle (desktop only) */}
      <button onClick={() => setCollapsed(c => !c)}
        style={{ position: "fixed", top: "50%", left: "calc(var(--sidebar-w) - 10px)", transform: "translateY(-50%)", zIndex: 50 }}
        className="hidden lg:flex h-6 w-5 items-center justify-center rounded-full
          bg-white text-[#2E7D32] border border-gray-300 shadow-sm hover:bg-green-pale transition-all"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <LuChevronRight className="w-3 h-3" /> : <LuChevronLeft className="w-3 h-3" />}
      </button>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 ml-0 lg:ml-[var(--sidebar-w)] transition-all duration-300">
        <header className="fixed top-0 right-0 left-0 lg:left-[var(--sidebar-w)] z-20
          bg-white/80 backdrop-blur-md border-b border-beige-dark/30 px-5 py-3.5 flex items-center gap-3 transition-all duration-300">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-brown-mid hover:text-brown-dark transition-colors">
            <LuMenu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>
        <main className="flex-1 p-5 sm:p-6 lg:p-8 mt-[57px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
