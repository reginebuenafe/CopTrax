import { useEffect, useRef, useState, useCallback } from "react";
import { LuBell, LuCheck, LuCheckCheck } from "react-icons/lu";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

const TYPE_STYLES = {
  "Proposal Accepted":   "bg-green-pale text-green-dark",
  "Proposal Rejected":   "bg-red-50 text-red-600",
  "Counteroffer Received":"bg-blue-50 text-blue-600",
  "Counteroffer":        "bg-blue-50 text-blue-600",
  "Contract Signed":     "bg-green-pale text-green-dark",
  "Contract Activated":  "bg-green-pale text-green-dark",
  "Contract Completed":  "bg-green-pale text-green-dark",
  "Contract Breached":   "bg-red-50 text-red-600",
  "Delivery Accepted":   "bg-blue-50 text-blue-600",
  "Delivery Rejected":   "bg-red-50 text-red-600",
  "Weekly Payment Ready":"bg-amber-50 text-amber-700",
  "Payment Released":    "bg-emerald-50 text-emerald-700",
  "Deadline Reminder":   "bg-orange-50 text-orange-600",
  "Merge Pending":       "bg-purple-50 text-purple-600",
  "Merge Ready":         "bg-amber-50 text-amber-700",
  "Merge Completed":     "bg-green-pale text-green-dark",
  "Other":               "bg-beige text-brown-mid",
};

function getDisplayType(notification) {
  if (
    notification.notification_type === "Contract Signed"
    && /^Your proposal\b/i.test(notification.message)
  ) {
    return "Proposal Accepted";
  }
  if (notification.notification_type === "Counteroffer") {
    return "Counteroffer Received";
  }
  return notification.notification_type;
}

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
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("notification_id, notification_type, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const notifs = data ?? [];
    setNotifications(notifs);
    setUnreadCount(notifs.filter(n => !n.is_read).length);
  }, [user]);

  useEffect(() => {
    const initialFetchTimer = window.setTimeout(fetchNotifications, 0);

    if (!user) return () => window.clearTimeout(initialFetchTimer);

    // Real-time subscription
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev].slice(0, 30));
          setUnreadCount(c => c + 1);
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialFetchTimer);
      supabase.removeChannel(channel);
    };
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
        <div className="fixed left-3 right-3 top-[68px] z-50 w-auto overflow-hidden rounded-2xl border border-beige-dark/30 bg-white shadow-card sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
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
              const displayType = getDisplayType(n);
              return (
                <li
                  key={n.notification_id}
                  className={`px-4 py-3 transition-colors ${n.is_read ? "bg-white" : "bg-green-pale/30"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${TYPE_STYLES[displayType] ?? TYPE_STYLES["Other"]}`}>
                      {displayType}
                    </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-brown-dark text-xs leading-relaxed">{n.message}</p>
                    <p className="text-brown-light text-[11px] mt-1">{fmtRelative(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <button onClick={() => markOneRead(n.notification_id)}
                      className="shrink-0 text-green-dark hover:text-green-mid transition-colors mt-0.5"
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
    </div>
  );
}
