import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuArrowUpDown, LuCheck, LuCircleAlert, LuCircleCheck, LuEye,
  LuFileText, LuRefreshCw, LuSearch, LuTruck, LuUser,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function fmtDate(value, includeTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function fullName(person) {
  return `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "—";
}

function issueType(issue) {
  const note = issue.issue_note?.toLowerCase() ?? "";
  return /weigh|weight|moisture|pca|wet|dry|condition/.test(note) ? "Weighing" : "Delivery";
}

function issueTitle(note) {
  const title = note?.trim().replace(/\s+/g, " ") || "Untitled issue";
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

function issueId(index, total) {
  return `ISS-${String(total - index).padStart(4, "0")}`;
}

const STATUS_STYLES = {
  Open: "bg-red-50 text-red-700",
  "In Review": "bg-amber-50 text-amber-700",
  Resolved: "bg-green-pale text-green-dark",
};

export default function DeliveryIssuesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [sort, setSort] = useState("newest");
  const [resolvingId, setResolvingId] = useState(null);

  async function fetchIssues() {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("delivery_issue_reports")
      .select(`
        issue_report_id, issue_note, status, created_at,
        delivery:delivery_id(
          delivery_id, delivery_date, delivery_source,
          supplier:supplier_id(first_name, last_name)
        ),
        reporter:reported_by(first_name, last_name, roles(role_name))
      `)
      .order("created_at", { ascending: false });

    if (queryError) {
      setError("Could not load issue reports. Please try again.");
      setIssues([]);
    } else {
      setIssues(data ?? []);
    }
    setLoading(false);
  }

  async function resolveIssue(issue) {
    setResolvingId(issue.issue_report_id);
    setError("");
    const { data, error: updateError } = await supabase
      .from("delivery_issue_reports")
      .update({
        status: "Resolved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("issue_report_id", issue.issue_report_id)
      .select("issue_report_id, status, reviewed_by, reviewed_at")
      .single();

    if (updateError) {
      setError("Could not resolve this issue. Please try again.");
    } else {
      setIssues(current => current.map(item => item.issue_report_id === issue.issue_report_id
        ? { ...item, ...data }
        : item));
    }
    setResolvingId(null);
  }

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = issues
      .map((issue, index) => ({ issue, index, id: issueId(index, issues.length), type: issueType(issue) }))
      .filter(({ issue, id, type }) => {
        if (statusFilter !== "All" && issue.status !== statusFilter) return false;
        if (typeFilter !== "All" && type !== typeFilter) return false;
        if (!query) return true;
        return [id, issue.issue_note, issue.delivery?.delivery_id, fullName(issue.delivery?.supplier), fullName(issue.reporter)]
          .some(value => value?.toLowerCase().includes(query));
      });

    return result.sort((a, b) => sort === "oldest"
      ? new Date(a.issue.created_at) - new Date(b.issue.created_at)
      : new Date(b.issue.created_at) - new Date(a.issue.created_at));
  }, [issues, search, sort, statusFilter, typeFilter]);

  const openCount = issues.filter(issue => issue.status !== "Resolved").length;
  const resolvedCount = issues.filter(issue => issue.status === "Resolved").length;

  useEffect(() => {
    const timer = setTimeout(fetchIssues, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full pt-4">
      <div className="flex flex-col gap-2 mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-brown-dark">Issue Reports</h1>
          <p className="text-sm text-brown-light mt-0.5">Review and resolve issues reported by staff and suppliers.</p>
        </div>
        <button type="button" onClick={fetchIssues} disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-beige-dark bg-white text-brown-mid text-xs font-semibold hover:bg-beige disabled:opacity-60 transition-all">
          <LuRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <SummaryCard icon={LuFileText} value={issues.length} label="Total Issues" detail="All reported issues" color="bg-beige text-brown-mid" />
        <SummaryCard icon={LuCircleAlert} value={openCount} label="Open" detail="Require review" color="bg-red-50 text-red-700" />
        <SummaryCard icon={LuCircleCheck} value={resolvedCount} label="Resolved" detail="Successfully closed" color="bg-green-pale text-green-dark" />
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 mb-3 text-xs"><LuCircleAlert className="w-3.5 h-3.5 shrink-0" /> {error}</div>}

      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search reports..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid"
          />
        </div>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="px-3 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark focus:outline-none focus:ring-2 focus:ring-green-mid/30">
          <option value="All">Status: All</option>
          <option value="Open">Status: Open</option>
          <option value="In Review">Status: In Review</option>
          <option value="Resolved">Status: Resolved</option>
        </select>
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="px-3 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark focus:outline-none focus:ring-2 focus:ring-green-mid/30">
          <option value="All">Issue Type: All</option>
          <option value="Weighing">Issue Type: Weighing</option>
          <option value="Delivery">Issue Type: Delivery</option>
        </select>
        <div className="relative">
          <LuArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brown-light pointer-events-none" />
          <select value={sort} onChange={event => setSort(event.target.value)} className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark focus:outline-none focus:ring-2 focus:ring-green-mid/30">
            <option value="newest">Sort by: Newest</option>
            <option value="oldest">Sort by: Oldest</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-3 border-green-dark border-t-transparent rounded-full animate-spin" /></div>
      ) : filteredIssues.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-14 text-center px-4">
          <div className="w-12 h-12 bg-beige rounded-2xl flex items-center justify-center mb-3"><LuCircleAlert className="w-6 h-6 text-brown-light" /></div>
          <p className="text-brown-dark font-semibold">{issues.length ? "No matching reports" : "No issue reports yet"}</p>
          <p className="text-brown-light text-sm mt-1">{issues.length ? "Try adjusting your search or filters." : "Issues reported by weighers and lab staff will appear here."}</p>
        </div>
      ) : (
        <div className="w-full space-y-3">
          <p className="text-xs text-brown-light">{filteredIssues.length} {filteredIssues.length === 1 ? "report" : "reports"}</p>
          {filteredIssues.map(({ issue, id, type }) => (
            <article key={issue.issue_report_id} className={`bg-white border border-beige-dark/40 border-l-2 rounded-xl p-4 ${issue.status === "Resolved" ? "border-l-green-mid" : "border-l-red-300"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[issue.status] ?? STATUS_STYLES.Open}`}>{issue.status === "Resolved" ? "Resolved" : "Open"}</span>
                  <span className="text-xs font-bold text-brown-mid">{id}</span>
                  <span className="text-xs text-brown-light">Reported {fmtDate(issue.created_at, true)}</span>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${type === "Weighing" ? "bg-green-pale text-green-dark" : "bg-blue-50 text-blue-700"}`}>{type}</span>
              </div>
              <h2 className="text-sm font-bold text-brown-dark leading-5">{issueTitle(issue.issue_note)}</h2>
              <div className="mt-3 pt-3 border-t border-beige-dark/30 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs min-w-0">
                  <div className="flex items-start gap-2 text-brown-mid"><LuTruck className="w-4 h-4 text-brown-light mt-0.5 shrink-0" /><span><span className="block font-semibold text-brown-dark">Linked Delivery</span><span className="block mt-0.5">{fmtDate(issue.delivery?.delivery_date)} · {issue.delivery?.delivery_source ?? "Delivery"}</span><span className="block mt-0.5 break-all">ID: {issue.delivery?.delivery_id ?? "—"}</span></span></div>
                  <div className="flex items-start gap-2 text-brown-mid"><LuUser className="w-4 h-4 text-brown-light mt-0.5 shrink-0" /><span><span className="block font-semibold text-brown-dark">Reported by {fullName(issue.reporter)}</span><span className="block mt-0.5">{issue.reporter?.roles?.role_name ?? "—"}</span></span></div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button type="button" onClick={() => navigate(`/dashboard/owner/deliveries?deliveryId=${encodeURIComponent(issue.delivery?.delivery_id ?? "")}`)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-beige-dark bg-white text-brown-mid text-xs font-semibold hover:bg-beige transition-colors"><LuEye className="w-3.5 h-3.5" /> View Delivery</button>
                  {issue.status !== "Resolved" && <button type="button" onClick={() => resolveIssue(issue)} disabled={resolvingId === issue.issue_report_id} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-dark text-white text-xs font-semibold hover:bg-green-mid disabled:opacity-60 transition-colors"><LuCheck className="w-3.5 h-3.5" /> {resolvingId === issue.issue_report_id ? "Resolving..." : "Resolve Issue"}</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, value, label, detail, color }) {
  return (
    <div className="bg-white border border-beige-dark/40 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>{createElement(Icon, { className: "w-5 h-5" })}</div>
      <div className="min-w-0"><p className="text-2xl font-black text-brown-dark leading-none">{value}</p><p className="text-sm font-semibold text-brown-dark mt-1">{label}</p><p className="text-xs text-brown-light mt-0.5">{detail}</p></div>
    </div>
  );
}
