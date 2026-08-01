import { useEffect, useState } from "react";
import {
  LuUsers, LuCheck, LuX, LuPhone,
  LuMapPin, LuClock, LuSearch, LuCircleAlert,
  LuIdCard, LuCamera, LuPenLine, LuLoader, LuEye,
  LuUserPlus,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import CreateStaffModal from "../../components/CreateStaffModal";

const STATUS_TABS = ["Pending", "Active", "Rejected"];

const ROLE_COLORS = {
  "Supplier":         "bg-blue-50 text-blue-700",
  "Weigher":          "bg-orange-50 text-orange-700",
  "Laboratory Staff": "bg-purple-50 text-purple-700",
  "Business Owner":   "bg-green-pale text-green-dark",
};

// ── Document viewer modal ─────────────────────────────────────────────────────
function DocumentsModal({ targetUser, onClose, onApprove, onReject, processing }) {
  const [docs,      setDocs]      = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docErr,    setDocErr]    = useState("");

  useEffect(() => {
    async function loadDocs() {
      setLoadingDocs(true);
      try {
        // 1. Fetch user_verify record
        const { data: verify, error: vErr } = await supabase
          .from("user_verify")
          .select(`
            verify_id, verify_status,
            gov_id:gov_id_file_id(file_id, file_name, file_url, file_category),
            esign:esign_file_id(file_id, file_name, file_url, file_category)
          `)
          .eq("user_id", targetUser.user_id)
          .maybeSingle();

        if (vErr) throw new Error(vErr.message);

        // 2. Fetch face ID (stored in file_uploads with category 'Face ID')
        const { data: faceFiles } = await supabase
          .from("file_uploads")
          .select("file_id, file_name, file_url, file_category")
          .eq("uploaded_by", targetUser.user_id)
          .eq("file_category", "Face ID")
          .limit(1)
          .maybeSingle();

        // 3. Generate signed URLs (1-hour expiry) for each file
        async function signUrl(path) {
          if (!path) return null;
          const { data, error } = await supabase.storage
            .from("documents")
            .createSignedUrl(path, 3600);
          return error ? null : data.signedUrl;
        }

        const [govUrl, faceUrl, esignUrl] = await Promise.all([
          signUrl(verify?.gov_id?.file_url),
          signUrl(faceFiles?.file_url),
          signUrl(verify?.esign?.file_url),
        ]);

        setDocs({
          govId:   { ...verify?.gov_id,  url: govUrl },
          faceId:  { ...faceFiles,       url: faceUrl },
          esign:   { ...verify?.esign,   url: esignUrl },
          hasVerify: !!verify,
        });
      } catch (err) {
        setDocErr(err.message);
      }
      setLoadingDocs(false);
    }
    loadDocs();
  }, [targetUser.user_id]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-beige-dark/20">
          <div>
            <h3 className="text-lg font-bold text-brown-dark">
              {targetUser.first_name} {targetUser.last_name}
            </h3>
            <p className="text-brown-light text-xs">{targetUser.email}</p>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loadingDocs ? (
            <div className="flex items-center justify-center py-16">
              <LuLoader className="w-7 h-7 animate-spin text-green-dark" />
            </div>
          ) : docErr ? (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {docErr}
            </div>
          ) : !docs?.hasVerify ? (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
              <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              No verification documents submitted. This account registered before document upload was required.
            </div>
          ) : (
            <>
              {/* Gov ID */}
              <DocSection
                icon={<LuIdCard className="w-4 h-4 text-green-dark" />}
                title="Government-Issued ID"
                subtitle={docs.govId?.file_name?.replace(".jpg", "") ?? "—"}
                url={docs.govId?.url}
              />

              {/* Selfie with ID */}
              <DocSection
                icon={<LuCamera className="w-4 h-4 text-green-dark" />}
                title="Selfie Holding Government ID"
                subtitle="Confirm face matches the ID"
                url={docs.faceId?.url}
              />

              {/* E-Signature */}
              <DocSection
                icon={<LuPenLine className="w-4 h-4 text-green-dark" />}
                title="Handwritten E-Signature (3× on white paper)"
                subtitle="3 signatures on a white bond paper"
                url={docs.esign?.url}
              />
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-5 border-t border-beige-dark/20 flex gap-3">
          <button onClick={onClose} disabled={processing}
            className="flex-1 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all disabled:opacity-50">
            Close
          </button>
          <button onClick={onReject} disabled={processing}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {processing ? <LuLoader className="w-4 h-4 animate-spin" /> : <LuX className="w-4 h-4" />}
            Reject
          </button>
          <button onClick={onApprove} disabled={processing}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {processing ? <LuLoader className="w-4 h-4 animate-spin" /> : <LuCheck className="w-4 h-4" />}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function DocSection({ icon, title, subtitle, url }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <div>
          <p className="text-sm font-semibold text-brown-dark">{title}</p>
          {subtitle && <p className="text-xs text-brown-light">{subtitle}</p>}
        </div>
      </div>
      {url ? (
        <div className="rounded-2xl overflow-hidden border border-beige-dark bg-beige">
          <img src={url} alt={title} className="w-full max-h-64 object-contain" />
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-beige-dark bg-beige flex items-center justify-center py-8 text-brown-light text-sm">
          No photo submitted
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserApprovalsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("Pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState(null); // target user
  const [createModal, setCreateModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchUsers(); }, [tab]);

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

    const { error } = await supabase.from("users").update({
      account_status: newStatus,
      approved_by:    action === "approve" ? user.id : null,
      approved_at:    action === "approve" ? new Date().toISOString() : null,
    }).eq("user_id", targetUser.user_id);

    // Update user_verify record
    if (!error) {
      await supabase.from("user_verify")
        .update({ verify_status: action === "approve" ? "Approved" : "Rejected", review_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("user_id", targetUser.user_id);
    }

    setProcessing(false);
    setReviewModal(null);

    if (error) { showToast("error", "Something went wrong. Please try again."); return; }

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
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center">
            <LuUsers className="w-5 h-5 text-green-dark" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-brown-dark">User Management</h1>
            <p className="text-brown-light text-sm">Review Supplier registrations and manage staff accounts</p>
          </div>
        </div>
        <button onClick={() => setCreateModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:shadow-glow-green transition-all shrink-0">
          <LuUserPlus className="w-4 h-4" /> Create Staff Account
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1 bg-beige rounded-xl p-1">
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setSearch(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === t ? "bg-white text-brown-dark shadow-sm" : "text-brown-light hover:text-brown-dark"
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
          <input type="text" placeholder="Search by name, email, role…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark
              placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all" />
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
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-brown-light uppercase tracking-wide">
                    {tab === "Pending" ? "Review" : "Status"}
                  </th>
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
                          <p className="font-semibold text-brown-dark">{u.first_name} {u.last_name}</p>
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
                        {new Date(u.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-brown-light text-xs">
                        {new Date(u.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      {tab === "Pending" ? (
                        <button onClick={() => setReviewModal(u)}
                          className="inline-flex items-center gap-1.5 bg-green-pale text-green-dark text-xs font-semibold
                            px-3 py-1.5 rounded-lg hover:bg-green-light/20 transition-all duration-200">
                          <LuEye className="w-3.5 h-3.5" /> Review Documents
                        </button>
                      ) : (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.account_status === "Active" ? "bg-green-pale text-green-dark" : "bg-red-50 text-red-600"
                        }`}>
                          {u.account_status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Document review modal */}
      {reviewModal && (
        <DocumentsModal
          targetUser={reviewModal}
          processing={processing}
          onClose={() => setReviewModal(null)}
          onApprove={() => handleDecision(reviewModal, "approve")}
          onReject={()  => handleDecision(reviewModal, "reject")}
        />
      )}

      {/* Create staff account modal */}
      {createModal && (
        <CreateStaffModal
          onClose={() => setCreateModal(false)}
          onCreated={(firstName, lastName, role) => {
            setCreateModal(false);
            showToast("success", `${firstName} ${lastName}'s ${role} account has been created.`);
            if (tab === "Active") fetchUsers();
          }}
        />
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
