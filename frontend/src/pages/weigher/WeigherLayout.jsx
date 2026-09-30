import { useState, useEffect, useRef, createElement } from "react";
import { Link, NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LuLogOut, LuMenu, LuX, LuChevronRight, LuChevronLeft, LuBadgeCheck,
  LuTruck, LuClipboardList, LuSettings,
} from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../../components/NotificationBell";
import BrandLogo from "../../components/BrandLogo";

const NAV_ITEMS = [
  { to: "/dashboard/weigher", label: "New Delivery", icon: LuTruck, end: true },
  { to: "/dashboard/weigher/history", label: "Delivery History", icon: LuClipboardList },
];

const SIDEBAR_FULL = 256;
const SIDEBAR_MINI = 64;

export default function WeigherLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("coptrax_weigher_sidebar_collapsed") === "true"
  );
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("coptrax_weigher_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleClickOutside(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || "WG";

  return (
    <div className="min-h-screen bg-beige flex"
      style={{ "--sidebar-w": `${collapsed ? SIDEBAR_MINI : SIDEBAR_FULL}px` }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-screen h-[100dvh] bg-[#FFFEFB] border-r border-[#E4D5BD] z-40
        shadow-[2px_0_12px_rgba(93,64,55,0.06)] flex flex-col transition-all duration-300
        w-64 lg:w-[var(--sidebar-w)]
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>

        {/* Brand */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-[#E4D5BD] shrink-0 ${collapsed ? "justify-center lg:px-2" : ""}`}>
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <BrandLogo className="w-full h-full" size="100%" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-extrabold text-[#4E342E] text-sm leading-none">CopTrax</p>
              <p className="text-[#9A8176] text-[10px] mt-0.5">Weigher</p>
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
                ${isActive ? "bg-[#2E7D32] text-white font-semibold shadow-sm" : "text-[#765D52] hover:bg-[#F7F0E5] hover:text-[#4E342E]"}`}>
              {({ isActive }) => (
                <>
                  {createElement(Icon, { className: `w-4.5 h-4.5 shrink-0 ${isActive ? "text-white" : "text-[#9A8176] group-hover:text-[#765D52]"}` })}
                  {!collapsed && <span className="flex-1">{label}</span>}
                  {!collapsed && isActive && <LuChevronRight className="w-3.5 h-3.5 text-white/70" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

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
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen(o => !o)}
              className={`flex min-w-0 items-center gap-2.5 pl-2.5 pr-2.5 sm:pl-3 sm:pr-3 py-1.5 rounded-full border-2 transition-colors
                ${profileMenuOpen ? "bg-[#FAF6EE] border-[#D9C7A3]" : "border-[#E8DCC8] hover:bg-[#FAF6EE]"}`}
            >
              <div className="w-7 h-7 rounded-full bg-green-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                {initials}
              </div>
              <div className="hidden sm:flex min-w-0 items-center gap-2">
                <div className="min-w-0 text-left">
                  <p className="text-brown-dark text-sm font-semibold leading-none truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-brown-light text-[11px] mt-0.5 truncate">{profile?.email}</p>
                </div>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-pale border border-green-light/40 text-green-dark text-[11px] font-semibold whitespace-nowrap shrink-0">
                  <LuBadgeCheck className="w-3.5 h-3.5 text-green-dark" />
                  Weigher
                </span>
              </div>
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-beige-dark/30 bg-white shadow-card-hover overflow-hidden">
                <div className="sm:hidden px-4 pt-3 pb-2 border-b border-beige-dark/20">
                  <p className="text-brown-dark text-sm font-semibold leading-none truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-brown-light text-[11px] mt-1 truncate">{profile?.email}</p>
                  <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-pale border border-green-light/40 text-green-dark text-[11px] font-semibold">
                    <LuBadgeCheck className="w-3.5 h-3.5 text-green-dark" />
                    Weigher
                  </span>
                </div>
                <NavLink
                  to="/dashboard/weigher/settings"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#765D52] hover:bg-[#F7F0E5] hover:text-[#4E342E] transition-colors"
                >
                  <LuSettings className="w-4 h-4 shrink-0" />
                  Settings
                </NavLink>
                <button
                  onClick={() => { setProfileMenuOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#765D52] hover:bg-red-50 hover:text-red-600 transition-colors border-t border-beige-dark/20"
                >
                  <LuLogOut className="w-4 h-4 shrink-0" />
                  Sign Out
                </button>
                <div className="flex flex-nowrap items-center justify-center gap-x-2 px-4 py-2.5 border-t border-beige-dark/20 bg-[#FBF7EF]">
                  <Link to="/help" onClick={() => setProfileMenuOpen(false)} className="text-[11px] font-medium text-brown-light hover:text-brown-dark hover:underline transition-colors whitespace-nowrap">Help</Link>
                  <span className="text-[11px] text-brown-light/50">&middot;</span>
                  <Link to="/privacy-policy" onClick={() => setProfileMenuOpen(false)} className="text-[11px] font-medium text-brown-light hover:text-brown-dark hover:underline transition-colors whitespace-nowrap">Privacy</Link>
                  <span className="text-[11px] text-brown-light/50">&middot;</span>
                  <Link to="/terms" onClick={() => setProfileMenuOpen(false)} className="text-[11px] font-medium text-brown-light hover:text-brown-dark hover:underline transition-colors whitespace-nowrap">Terms</Link>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-5 sm:p-6 lg:p-8 mt-[57px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
