import { createElement, useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import {
  LuLeaf, LuLogOut, LuMenu, LuX, LuChevronLeft, LuChevronRight, LuBadgeCheck,
  LuLayoutDashboard, LuFileText, LuTruck,
  LuWallet, LuStar, LuSettings,
} from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import NotificationBell from "../../components/NotificationBell";
import NegotiationChatWidget from "../../components/NegotiationChatWidget";

const NAV_ITEMS = [
  { to: "/dashboard/supplier", label: "Overview", icon: LuLayoutDashboard, end: true },
  { to: "/dashboard/supplier/contracts", label: "My Contracts", icon: LuFileText },
  { to: "/dashboard/supplier/deliveries", label: "Deliveries", icon: LuTruck },
  { to: "/dashboard/supplier/payments", label: "Payments", icon: LuWallet },
  { to: "/dashboard/supplier/rating", label: "My Rating", icon: LuStar },
  { to: "/dashboard/supplier/settings", label: "Settings", icon: LuSettings },
];

const SIDEBAR_FULL = 256;
const SIDEBAR_MINI = 64;

export default function SupplierLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);   // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("coptrax_sidebar_collapsed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("coptrax_sidebar_collapsed", String(collapsed));
  }, [collapsed]);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isFullChatRoute = location.pathname.startsWith("/dashboard/supplier/conversations");

  // Announce Supplier presence from every dashboard page, not only chat.
  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase.channel("online-suppliers", {
      config: { presence: { key: user.id } },
    });
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") {
        channel.track({ user_id: user.id, online_at: new Date().toISOString() });
      }
    });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || "SP";

  return (
    <div
      className="min-h-screen bg-beige overflow-x-hidden"
      style={{ "--sidebar-w": `${collapsed ? SIDEBAR_MINI : SIDEBAR_FULL}px` }}
    >

      {/* ── Mobile backdrop ─────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-[#FFFEFB] border-r border-[#E4D5BD] z-40 shadow-[2px_0_12px_rgba(93,64,55,0.06)]
          flex flex-col overflow-hidden
          w-64 lg:w-[var(--sidebar-w)]
          transition-[width,transform] duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[#E7DCC9] shrink-0">
          <div className="w-9 h-9 shrink-0 bg-gradient-to-br from-green-dark to-green-light rounded-xl flex items-center justify-center shadow-sm">
            <LuLeaf className="w-4.5 h-4.5 text-white" />
          </div>
          <div className={`overflow-hidden transition-[opacity,max-width] duration-300 ease-in-out whitespace-nowrap
            ${collapsed ? "lg:opacity-0 lg:max-w-0" : "opacity-100 max-w-[160px]"}`}>
            <p className="font-extrabold text-[#4E342E] text-sm leading-none">CopTrax</p>
            <p className="text-[#9A8176] text-[10px] mt-0.5">Supplier Portal</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-[#8B7368] hover:text-[#4E342E] shrink-0 p-1"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 overflow-y-auto overflow-x-hidden space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to} end={end}
              title={collapsed ? label : undefined}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center rounded-xl text-sm font-medium
                 transition-all duration-200 group overflow-hidden
                 ${collapsed
                  ? "gap-3 px-3 py-2.5 lg:gap-0 lg:p-0 lg:w-11 lg:h-11 lg:mx-auto lg:justify-center"
                  : "gap-3 px-3 py-2.5"
                 }
                 ${isActive
                  ? "bg-[#2E7D32] text-white font-semibold shadow-sm"
                  : "text-[#765D52] hover:bg-[#F7F0E5] hover:text-[#4E342E]"}`
              }
            >
              {({ isActive }) => (
                <>
                  {createElement(Icon, {
                    className: `shrink-0 transition-all duration-200
                      ${collapsed ? "lg:w-6 lg:h-6 w-4.5 h-4.5" : "w-4.5 h-4.5"}
                      ${isActive ? "text-white" : "text-[#A18D82] group-hover:text-[#6D5147]"}`,
                  })}
                  <span className={`flex-1 whitespace-nowrap transition-[opacity,max-width] duration-300 ease-in-out
                    ${collapsed ? "lg:opacity-0 lg:max-w-0 lg:overflow-hidden" : "opacity-100 max-w-[160px]"}`}>
                    {label}
                  </span>
                  {isActive && (
                    <LuChevronRight className={`w-3.5 h-3.5 text-white/70 shrink-0
                      ${collapsed ? "lg:hidden" : ""}`} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer — sign out only */}
        <div className="border-t border-[#E7DCC9] shrink-0 px-2 py-3 overflow-hidden">
          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign Out" : undefined}
            className={`flex items-center rounded-xl text-sm font-medium
              text-[#765D52] hover:bg-red-50 hover:text-red-600 transition-all duration-200
              ${collapsed
                ? "w-full gap-2.5 px-3.5 py-2.5 lg:w-11 lg:h-11 lg:mx-auto lg:gap-0 lg:p-0 lg:justify-center"
                : "w-full gap-2.5 px-3.5 py-2.5"
              }`}
          >
            <LuLogOut className={`shrink-0 transition-all duration-200 ${collapsed ? "lg:w-5.5 lg:h-5.5 w-4 h-4" : "w-4 h-4"}`} />
            <span className={`whitespace-nowrap transition-[opacity,max-width] duration-300 ease-in-out overflow-hidden
              ${collapsed ? "lg:opacity-0 lg:max-w-0" : "opacity-100 max-w-[160px]"}`}>
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* ── Collapse toggle — floats on the sidebar/content boundary (desktop only) ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          left: "calc(var(--sidebar-w) - 10px)",
        }}
        className="hidden lg:flex fixed top-[68px] z-50 w-5 h-5
          items-center justify-center rounded-full
          bg-white text-[#2E7D32] border border-gray-300
          shadow-[0_1px_6px_rgba(0,0,0,0.22)]
          hover:scale-110 transition-[left,transform,box-shadow] duration-300 ease-in-out"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed
          ? <LuChevronRight className="w-3 h-3" />
          : <LuChevronLeft className="w-3 h-3" />
        }
      </button>

      {/* ── Main content ────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-screen transition-[margin-left] duration-300 ease-in-out
          ml-0 lg:ml-[var(--sidebar-w)]"
      >
        <header className="fixed top-0 right-0 left-0 lg:left-[var(--sidebar-w)] z-20
          bg-white/80 backdrop-blur-md border-b border-beige-dark/30
          px-5 py-3.5 flex items-center gap-3
          transition-[left] duration-300 ease-in-out">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-brown-mid hover:text-brown-dark transition-colors"
          >
            <LuMenu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
          {/* User info card */}
          <div className="flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-full border-2 border-[#E8DCC8] hover:bg-[#FAF6EE] transition-colors">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-dark to-green-mid
              flex items-center justify-center text-white text-[11px] font-bold shrink-0">
              {initials}
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-brown-dark text-sm font-semibold leading-none truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-brown-light text-[11px] mt-0.5 truncate">{profile?.email}</p>
              </div>
              {/* Verified badge */}
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full
                bg-blue-50 border border-blue-200 text-blue-600 text-[11px] font-semibold whitespace-nowrap shrink-0">
                <LuBadgeCheck className="w-3.5 h-3.5" />
                Verified
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 px-5 pb-5 pt-[76px] sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 lg:pt-[84px]">
          <Outlet />
        </main>
      </div>
      {!isFullChatRoute && <NegotiationChatWidget />}
    </div>
  );
}
