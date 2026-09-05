import { createElement, useState, useEffect, useCallback, useRef } from "react";
import { Link, NavLink, useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  LuUsers, LuLogOut, LuMenu, LuX, LuChevronLeft, LuChevronRight, LuBadgeCheck,
  LuLayoutDashboard, LuFileText, LuTruck,
  LuWallet, LuPackage, LuStar, LuMessageSquare, LuFileChartColumn, LuSettings,
  LuBot,
} from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../../components/NotificationBell";
import BrandLogo from "../../components/BrandLogo";
import { supabase } from "../../lib/supabase";

const NAV_ITEMS = [
  { to: "/dashboard/owner", label: "Overview", icon: LuLayoutDashboard, end: true },
  { to: "/dashboard/owner/users", label: "User Management", icon: LuUsers },
  { to: "/dashboard/owner/conversations", label: "Negotiations", icon: LuMessageSquare },
  { to: "/dashboard/owner/contracts", label: "Contracts", icon: LuFileText },
  { to: "/dashboard/owner/deliveries", label: "Deliveries", icon: LuTruck },
  { to: "/dashboard/owner/payments", label: "Payments", icon: LuWallet },
  { to: "/dashboard/owner/inventory", label: "Inventory", icon: LuPackage },
  { to: "/dashboard/owner/suppliers", label: "Supplier Ratings", icon: LuStar },
  { to: "/dashboard/owner/reports", label: "Reports", icon: LuFileChartColumn },
];

const SIDEBAR_FULL = 256;
const SIDEBAR_MINI = 64;

export default function OwnerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("coptrax_owner_sidebar_collapsed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("coptrax_owner_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Unread chat messages dot ─────────────────────────────────────────────
  const [hasUnread, setHasUnread] = useState(false);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const LAST_VISIT_KEY = user?.id ? `coptrax_bo_convs_last_visit_${user.id}` : null;

  const checkUnread = useCallback(async () => {
    if (!user?.id || !LAST_VISIT_KEY) return;
    const lastVisit = localStorage.getItem(LAST_VISIT_KEY) ?? new Date(0).toISOString();

    // Step 1: get conversation IDs for this BO
    const { data: convs } = await supabase
      .from("conversations")
      .select("conversation_id")
      .eq("business_owner_id", user.id);
    if (!convs?.length) { setHasUnread(false); return; }

    const convIds = convs.map(c => c.conversation_id);

    // Step 2: count messages from non-BO senders sent after last visit
    const { count } = await supabase
      .from("messages")
      .select("message_id", { count: "exact", head: true })
      .neq("sender_id", user.id)
      .gt("sent_at", lastVisit)
      .in("conversation_id", convIds);

    setHasUnread((count ?? 0) > 0);
  }, [user?.id, LAST_VISIT_KEY]);

  // Mark as read when BO is on the conversations page
  useEffect(() => {
    if (!LAST_VISIT_KEY) return;
    if (location.pathname.startsWith("/dashboard/owner/conversations")) {
      localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
      setHasUnread(false);
    }
  }, [location.pathname, LAST_VISIT_KEY]);

  // Initial check + realtime subscription for new messages
  useEffect(() => {
    if (!user?.id) return;
    checkUnread();

    const channel = supabase
      .channel(`bo-unread-dot-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (
            payload.new?.sender_id !== user.id &&
            !pathnameRef.current.startsWith("/dashboard/owner/conversations")
          ) {
            setHasUnread(true);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase.channel("online-business-owners", {
      config: { presence: { key: user.id } },
    });
    channel.subscribe((status) => {
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

  // ── AI Features dropdown ─────────────────────────────────────────────────
  const [aiAutoGlobal, setAiAutoGlobal] = useState(false);
  const [aiSaving, setAiSaving]         = useState(false);
  const [aiFaqGlobal, setAiFaqGlobal]   = useState(false);
  const [aiFaqSaving, setAiFaqSaving]   = useState(false);
  const [aiMenuOpen, setAiMenuOpen]     = useState(false);
  const aiMenuRef = useRef(null);

  useEffect(() => {
    async function loadAiConfig() {
      const [autoRes, faqRes] = await Promise.all([
        supabase.from("app_config").select("value").eq("key", "ai_auto_negotiate_global").maybeSingle(),
        supabase.from("app_config").select("value").eq("key", "ai_faq_global").maybeSingle(),
      ]);
      setAiAutoGlobal(autoRes.data?.value === "true");
      setAiFaqGlobal(faqRes.data?.value === "true");
    }
    loadAiConfig();
  }, []);

  useEffect(() => {
    if (!aiMenuOpen) return;
    function handleClickOutside(e) {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target)) {
        setAiMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [aiMenuOpen]);

  async function toggleAiAutoGlobal() {
    setAiSaving(true);
    const next = !aiAutoGlobal;
    setAiAutoGlobal(next);
    await supabase.from("app_config")
      .upsert({ key: "ai_auto_negotiate_global", value: String(next) }, { onConflict: "key" });
    setAiSaving(false);
  }

  async function toggleAiFaqGlobal() {
    setAiFaqSaving(true);
    const next = !aiFaqGlobal;
    setAiFaqGlobal(next);
    await supabase.from("app_config")
      .upsert({ key: "ai_faq_global", value: String(next) }, { onConflict: "key" });
    setAiFaqSaving(false);
  }

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || "BO";

  // ── Profile dropdown (Settings + Sign Out) ───────────────────────────────
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

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
          <div className="w-9 h-9 shrink-0 bg-green-dark rounded-xl flex items-center justify-center shadow-sm p-1.5">
            <BrandLogo className="w-full h-full" size="100%" />
          </div>
          <div className={`overflow-hidden transition-[opacity,max-width] duration-300 ease-in-out whitespace-nowrap
            ${collapsed ? "lg:opacity-0 lg:max-w-0" : "opacity-100 max-w-[160px]"}`}>
            <p className="font-extrabold text-[#4E342E] text-sm leading-none">CopTrax</p>
            <p className="text-[#9A8176] text-[10px] mt-0.5">Business Owner</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-[#8B7368] hover:text-[#4E342E] shrink-0 p-1"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex-1 px-2 py-3 space-y-1 overflow-x-hidden ${collapsed ? "lg:overflow-y-hidden lg:py-2 lg:space-y-0.5" : "overflow-y-auto"}`}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
                  <span className="relative shrink-0">
                    {createElement(Icon, {
                      className: `transition-all duration-200
                        ${collapsed ? "lg:w-5 lg:h-5 w-5 h-5" : "w-5 h-5"}
                        ${isActive ? "text-white" : "text-[#A18D82] group-hover:text-[#6D5147]"}`,
                    })}
                    {label === "Negotiations" && hasUnread && collapsed && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white hidden lg:block" />
                    )}
                  </span>
                  <span className={`flex-1 whitespace-nowrap transition-[opacity,max-width] duration-300 ease-in-out
                    ${collapsed ? "lg:opacity-0 lg:max-w-0 lg:overflow-hidden" : "opacity-100 max-w-[160px]"}`}>
                    {label}
                    {label === "Negotiations" && hasUnread && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-green-500 align-middle" />
                    )}
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
          px-3 py-3.5 sm:px-5 flex items-center gap-3
          transition-[left] duration-300 ease-in-out">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-brown-mid hover:text-brown-dark transition-colors"
          >
            <LuMenu className="w-5 h-5" />
          </button>
          <div className="flex-1" />

          {/* ── AI Features button + dropdown ── */}
          <div className="relative" ref={aiMenuRef}>
            <button
              onClick={() => setAiMenuOpen(o => !o)}
              title="AI Features"
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all border
                ${aiMenuOpen
                  ? "bg-green-pale border-green-mid/40 text-green-dark"
                  : "bg-beige border-beige-dark/50 text-brown-mid hover:bg-beige-dark/40 hover:text-brown-dark"
                }`}
            >
              <LuBot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI</span>
              {(aiAutoGlobal || aiFaqGlobal) && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-mid" />
              )}
            </button>

            {aiMenuOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-beige-dark/30 bg-white shadow-card-hover overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-beige-dark/20">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-green-pale">
                    <LuBot className="h-3 w-3 text-green-dark" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brown-light">AI Features</p>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-pale px-2 py-0.5 text-[9px] font-bold text-green-dark">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-mid" />
                    {(aiAutoGlobal || aiFaqGlobal) ? "Running" : "Idle"}
                  </span>
                </div>

                {/* Toggle rows */}
                <div className="px-4 py-2.5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-brown-dark leading-none">Auto-Negotiate</p>
                      <p className={`text-[10px] mt-0.5 font-medium ${aiAutoGlobal ? "text-green-dark" : "text-brown-light"}`}>
                        {aiAutoGlobal ? "● Active" : "○ Off"}
                      </p>
                    </div>
                    <button
                      onClick={toggleAiAutoGlobal}
                      disabled={aiSaving}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                        aiAutoGlobal ? "bg-green-mid" : "bg-beige-dark"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${aiAutoGlobal ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-brown-dark leading-none">FAQ Assistant</p>
                      <p className={`text-[10px] mt-0.5 font-medium ${aiFaqGlobal ? "text-green-dark" : "text-brown-light"}`}>
                        {aiFaqGlobal ? "● Active" : "○ Off"}
                      </p>
                    </div>
                    <button
                      onClick={toggleAiFaqGlobal}
                      disabled={aiFaqSaving}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                        aiFaqGlobal ? "bg-green-mid" : "bg-beige-dark"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${aiFaqGlobal ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <NotificationBell />
          {/* User info card — click to reveal Settings / Sign Out */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen(o => !o)}
              className={`flex min-w-0 items-center gap-2.5 pl-2.5 pr-2.5 sm:pl-3 sm:pr-3 py-1.5 rounded-full border-2 transition-colors
                ${profileMenuOpen ? "bg-[#FAF6EE] border-[#D9C7A3]" : "border-[#E8DCC8] hover:bg-[#FAF6EE]"}`}
            >
              <div className="w-7 h-7 rounded-full bg-green-dark
                flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                {initials}
              </div>
              <div className="hidden sm:flex min-w-0 items-center gap-2">
                <div className="min-w-0 text-left">
                  <p className="text-brown-dark text-sm font-semibold leading-none truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-brown-light text-[11px] mt-0.5 truncate">{profile?.email}</p>
                </div>
                {/* Owner badge */}
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full
                  bg-green-pale border border-green-light/40 text-green-dark text-[11px] font-semibold whitespace-nowrap shrink-0">
                  <LuBadgeCheck className="w-3.5 h-3.5 text-green-dark" />
                  Owner
                </span>
              </div>
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-beige-dark/30 bg-white shadow-card-hover overflow-hidden">
                {/* Profile summary — shown here so it's visible even on mobile where the header hides it */}
                <div className="sm:hidden px-4 pt-3 pb-2 border-b border-beige-dark/20">
                  <p className="text-brown-dark text-sm font-semibold leading-none truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-brown-light text-[11px] mt-1 truncate">{profile?.email}</p>
                  <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                    bg-green-pale border border-green-light/40 text-green-dark text-[11px] font-semibold">
                    <LuBadgeCheck className="w-3.5 h-3.5 text-green-dark" />
                    Owner
                  </span>
                </div>
                <NavLink
                  to="/dashboard/owner/settings"
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

                {/* Legal / support footer */}
                <div className="flex flex-nowrap items-center justify-center gap-x-2 px-4 py-2.5 border-t border-beige-dark/20 bg-[#FBF7EF]">
                  <Link
                    to="/help"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setProfileMenuOpen(false)}
                    className="text-[11px] font-medium text-brown-light hover:text-brown-dark hover:underline transition-colors whitespace-nowrap"
                  >
                    Help
                  </Link>
                  <span className="text-[11px] text-brown-light/50">&middot;</span>
                  <Link
                    to="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setProfileMenuOpen(false)}
                    className="text-[11px] font-medium text-brown-light hover:text-brown-dark hover:underline transition-colors whitespace-nowrap"
                  >
                    Privacy
                  </Link>
                  <span className="text-[11px] text-brown-light/50">&middot;</span>
                  <Link
                    to="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setProfileMenuOpen(false)}
                    className="text-[11px] font-medium text-brown-light hover:text-brown-dark hover:underline transition-colors whitespace-nowrap"
                  >
                    Terms
                  </Link>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 pb-5 pt-[76px] sm:px-6 sm:pb-6 lg:px-8 lg:pb-8 lg:pt-[84px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
