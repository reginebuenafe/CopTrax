import { useEffect, useState } from "react";
import {
  LuUsers, LuCheck, LuX, LuUser, LuMail, LuPhone,
  LuMapPin, LuClock, LuChevronDown, LuSearch, LuCircleAlert,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_TABS = ["Pending", "Active", "Rejected"];

const ROLE_COLORS = {
  "Supplier":         "bg-blue-50 text-blue-700",
  "Weigher":          "bg-orange-50 text-orange-700",
  "Laboratory Staff": "bg-purple-50 text-purple-700",
  "Business Owner":   "bg-green-pale text-green-dark",
};

export default function UserApprovalsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("Pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { action: 'approve'|'reject', target: user }
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [tab]);

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("user_id, first_name, last_name, email, phone, address, account_status, created_at, roles!inner(role_name)")
      .eq("account_status", tab)
      .neq("roles.role_name", "Business Owner")
      .order("created_at", { ascending: false });

    if (!error) setUsers(data ?? []);
    setLoading(false);
  }

  async function handleDecision(targetUser, action) {
    setProcessing(true);
    const newStatus = action === "approve" ? "Active" : "Rejected";

    const { error } = await supabase
      .from("users")
      .update({
        account_status: newStatus,
        approved_by: action === "approve" ? user.id : null,
        approved_at: action === "approve" ? new Date().toISOString() : null,
      })
      .eq("user_id", targetUser.user_id);

    setProcessing(false);
    setModal(null);

    if (error) {
      showToast("error", "Something went wrong. Please try again.");
      return;
    }

    showToast(
      "success",
      action === "approve"
        ? `${targetUser.first_name} ${targetUser.last_name}'s account has been approved.`
        : `${targetUser.first_name} ${targetUser.last_name}'s account has been rejected.`
    );
    fetchUsers();
  }

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.roles?.role_name?.toLowerCase().includes(q)
    );
  });

  const pendingCount = tab === "Pending" ? filtered.length : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
          <LuUsers className="w-5 h-5 text-green-dark" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brown-dark">User Approvals</h1>
          <p className="text-brown-light text-sm">Review and manage staff account requests</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1 bg-beige rounded-xl p-1">
          {STATUS_TABS.map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === t
                  ? "bg-white text-brown-dark shadow-sm"
                  : "text-brown-light hover:text-brown-dark"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
          <input
            type="text"
            placeholder="Search by name, email, role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all"
          />
        </div>

        {tab === "Pending" && pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-200">
            <LuClock className="w-3.5 h-3.5" /> {pendingCount} awaiting review
          </span>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4">
              <LuUsers className="w-7 h-7 text-brown-light" />
            </div>
            <p className="text-brown-dark font-semibold">No {tab.toLowerCase()} accounts</p>
            <p className="text-brown-light text-sm mt-1">
              {tab === "Pending" ? "No new account requests right now." : `No ${tab.toLowerCase()} accounts found.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beige-dark/30 bg-beige/40">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">Role</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide hidden md:table-cell">Contact</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide hidden lg:table-cell">Registered</th>
                  {tab === "Pending" && (
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-beige-dark/20">
                {filtered.map(u => (
                  <tr key={u.user_id} className="hover:bg-beige/30 transition-colors duration-150">
                    {/* Name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-dark to-green-mid flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {[u.first_name?.[0], u.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-semibold text-brown-dark">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-brown-light text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.roles?.role_name] ?? "bg-beige text-brown-mid"}`}>
                        {u.roles?.role_name ?? "—"}
                      </span>
                    </td>

                    {/* Contact */}
                    <td className="px-5 py-4 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {u.phone && (
                          <p className="flex items-center gap-1.5 text-brown-mid text-xs">
                            <LuPhone className="w-3 h-3 text-brown-light" /> {u.phone}
                          </p>
                        )}
                        {u.address && (
                          <p className="flex items-center gap-1.5 text-brown-mid text-xs">
                            <LuMapPin className="w-3 h-3 text-brown-light" />
                            <span className="truncate max-w-[180px]">{u.address}</span>
                          </p>
                        )}
                        {!u.phone && !u.address && <span className="text-brown-light/50">—</span>}
                      </div>
                    </td>

                    {/* Registered */}
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <p className="text-brown-mid text-xs">
                        {new Date(u.created_at).toLocaleDateString("en-PH", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                      <p className="text-brown-light text-xs">
                        {new Date(u.created_at).toLocaleTimeString("en-PH", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </td>

                    {/* Actions (Pending tab only) */}
                    {tab === "Pending" && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModal({ action: "approve", target: u })}
                            className="inline-flex items-center gap-1.5 bg-green-pale text-green-dark text-xs font-semibold
                              px-3 py-1.5 rounded-lg hover:bg-green-light/20 transition-all duration-200"
                          >
                            <LuCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => setModal({ action: "reject", target: u })}
                            className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 text-xs font-semibold
                              px-3 py-1.5 rounded-lg hover:bg-red-100 transition-all duration-200"
                          >
                            <LuX className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-sm p-7 animate-fade-in-up">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
              modal.action === "approve" ? "bg-green-pale" : "bg-red-50"
            }`}>
              {modal.action === "approve"
                ? <LuCheck className="w-6 h-6 text-green-dark" />
                : <LuCircleAlert className="w-6 h-6 text-red-500" />
              }
            </div>

            <h3 className="text-lg font-bold text-brown-dark text-center mb-2">
              {modal.action === "approve" ? "Approve Account?" : "Reject Account?"}
            </h3>
            <p className="text-brown-light text-sm text-center mb-6">
              {modal.action === "approve"
                ? <>This will activate <span className="font-semibold text-brown-dark">{modal.target.first_name} {modal.target.last_name}</span>'s account and allow them to log in.</>
                : <>This will reject <span className="font-semibold text-brown-dark">{modal.target.first_name} {modal.target.last_name}</span>'s registration. They will not be able to access CopTrax.</>
              }
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={processing}
                className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm
                  hover:bg-beige transition-all duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDecision(modal.target, modal.action)}
                disabled={processing}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 disabled:opacity-50
                  ${modal.action === "approve"
                    ? "bg-gradient-to-r from-green-dark to-green-mid hover:shadow-glow-green"
                    : "bg-red-500 hover:bg-red-600"
                  }`}
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {modal.action === "approve" ? "Approving…" : "Rejecting…"}
                  </span>
                ) : modal.action === "approve" ? "Yes, Approve" : "Yes, Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-card-hover text-sm font-medium animate-fade-in-up
          ${toast.type === "success" ? "bg-white border border-green-pale text-green-dark" : "bg-white border border-red-100 text-red-600"}`}>
          {toast.type === "success"
            ? <LuCheck className="w-4 h-4 shrink-0" />
            : <LuCircleAlert className="w-4 h-4 shrink-0" />
          }
          {toast.message}
        </div>
      )}
    </div>
  );
}
