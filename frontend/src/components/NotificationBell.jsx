import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  LuBell, LuCheck, LuCheckCheck,
  LuTruck, LuFileText, LuWallet, LuPackage, LuTriangleAlert,
  LuCalendarClock, LuStar, LuUserCheck, LuMessageCircle, LuX,
} from "react-icons/lu";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

// Map notification type → { icon, bg, text }
const TYPE_ICON = {
  "Contract Signed":      { icon: LuFileText,      bg: "bg-green-pale",  text: "text-green-dark" },
  "Contract Activated":   { icon: LuFileText,      bg: "bg-green-pale",  text: "text-green-dark" },
  "Contract Completed":   { icon: LuFileText,      bg: "bg-blue-50",     text: "text-blue-600" },
  "Contract Breached":    { icon: LuTriangleAlert, bg: "bg-red-50",      text: "text-red-600" },
  "Delivery Accepted":    { icon: LuTruck,         bg: "bg-green-pale",  text: "text-green-dark" },
  "Delivery Rejected":    { icon: LuTruck,         bg: "bg-red-50",      text: "text-red-600" },
  "Weekly Payment Ready": { icon: LuWallet,        bg: "bg-amber-50",    text: "text-amber-700" },
  "Payment Released":     { icon: LuWallet,        bg: "bg-emerald-50",  text: "text-emerald-700" },
  "Deadline Reminder":    { icon: LuCalendarClock, bg: "bg-orange-50",   text: "text-orange-600" },
  "Merge Pending":        { icon: LuPackage,       bg: "bg-purple-50",   text: "text-purple-600" },
  "Merge Ready":          { icon: LuPackage,       bg: "bg-amber-50",    text: "text-amber-700" },
  "Merge Completed":      { icon: LuPackage,       bg: "bg-green-pale",  text: "text-green-dark" },
  "Inventory Capacity Warning": { icon: LuPackage, bg: "bg-orange-50", text: "text-orange-600" },
  "Supplier Approved":    { icon: LuUserCheck,     bg: "bg-purple-50",   text: "text-purple-600" },
  "Supplier Rated":       { icon: LuStar,          bg: "bg-amber-50",    text: "text-amber-700" },
  "Supplier Assistance Requested": { icon: LuMessageCircle, bg: "bg-blue-50", text: "text-blue-600" },
};
const FALLBACK_ICON = { icon: LuBell, bg: "bg-beige", text: "text-brown-mid" };

function fmtRelative(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("notification_id, notification_type, message, related_entity_type, related_entity_id, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const notifs = data ?? [];
    setNotifications(notifs);
    setUnreadCount(notifs.filter(n => !n.is_read).length);
  }, [user]);

  useEffect(() => {
    (async () => { await fetchNotifications(); })();

    if (!user) return;

    // Real-time subscription
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev].slice(0, 30));
          setUnreadCount(c => c + 1);

          // Small transient toast for a Supplier assistance request, in
          // addition to the persistent bell entry above. The bell/unread
          // count is the source of truth — this toast just surfaces it
          // immediately while the BO has CopTrax open.
          if (payload.new?.notification_type === "Supplier Assistance Requested") {
            const toastId = payload.new.notification_id;
            setToasts(prev => [...prev, payload.new]);
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.notification_id !== toastId));
            }, 8000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markAllRead() {
    if (unreadCount === 0) return;
    await supabase.from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function markOneRead(notifId) {
    await supabase.from("notifications").update({ is_read: true }).eq("notification_id", notifId);
    setNotifications(prev => prev.map(n => n.notification_id === notifId ? { ...n, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  }

  // Opens the EXISTING conversation a "Supplier Assistance Requested"
  // notification points to (never creates a new one), and marks the
  // notification read since the Business Owner has now acknowledged it.
  function openRelatedChat(n) {
    if (n.related_entity_type === "conversations" && n.related_entity_id) {
      if (!n.is_read) markOneRead(n.notification_id);
      setToasts(prev => prev.filter(t => t.notification_id !== n.notification_id));
      setOpen(false);
      navigate(`/dashboard/owner/conversations/${n.related_entity_id}`);
    }
  }

  function dismissToast(notifId) {
    setToasts(prev => prev.filter(t => t.notification_id !== notifId));
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-brown-mid hover:text-brown-dark transition-colors p-1.5 rounded-lg hover:bg-beige"
        aria-label="Notifications"
      >
        <LuBell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-card border border-beige-dark/30 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-beige-dark/20">
            <div className="flex items-center gap-2">
              <LuBell className="w-4 h-4 text-brown-mid" />
              <p className="font-bold text-brown-dark text-sm">Notifications</p>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded-full">{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brown-light hover:text-green-dark transition-colors">
                <LuCheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <ul className="max-h-96 overflow-y-auto divide-y divide-beige-dark/10">
            {notifications.length === 0 ? (
              <li className="py-10 text-center text-brown-light text-sm px-4">
                <LuBell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet
              </li>
            ) : notifications.map(n => {
              const meta  = TYPE_ICON[n.notification_type] ?? FALLBACK_ICON;
              const NIcon = meta.icon;
              return (
                <li
                  key={n.notification_id}
                  className={`px-4 py-2.5 transition-colors ${n.is_read ? "bg-white" : "bg-green-pale/20"}`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* small icon */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${meta.bg}`}>
                      <NIcon className={`w-3.5 h-3.5 ${meta.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-snug ${n.is_read ? "text-brown-mid" : "text-brown-dark"}`}>
                        {n.notification_type}
                      </p>
                      <p className="text-[11px] text-brown-mid leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-brown-light mt-0.5">{fmtRelative(n.created_at)}</p>
                      {n.notification_type === "Supplier Assistance Requested" && n.related_entity_type === "conversations" && (
                        <button
                          onClick={() => openRelatedChat(n)}
                          className="mt-1.5 text-[11px] font-semibold text-green-dark hover:text-green-mid transition-colors"
                        >
                          Open Chat →
                        </button>
                      )}
                    </div>
                    {!n.is_read && (
                      <button onClick={() => markOneRead(n.notification_id)}
                        className="shrink-0 text-green-dark hover:text-green-mid transition-colors mt-1"
                        aria-label="Mark as read">
                        <LuCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Transient "Supplier needs assistance" toasts — the persistent
          notification stays in the bell above regardless of this toast's
          lifetime. Portalled to <body> so it floats above every layout. */}
      {toasts.length > 0 && createPortal(
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[90vw] max-w-sm">
          {toasts.map(t => (
            <div key={t.notification_id} className="bg-white border border-beige-dark/40 rounded-xl shadow-card p-4">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <LuMessageCircle className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brown-dark">Supplier needs assistance</p>
                  <p className="text-xs text-brown-mid mt-0.5">{t.message}</p>
                  <button
                    onClick={() => openRelatedChat(t)}
                    className="mt-2 text-xs font-semibold text-white bg-green-dark hover:bg-green-dark/90 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Open Chat
                  </button>
                </div>
                <button onClick={() => dismissToast(t.notification_id)} className="shrink-0 text-brown-light hover:text-brown-dark transition-colors" aria-label="Dismiss">
                  <LuX className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
