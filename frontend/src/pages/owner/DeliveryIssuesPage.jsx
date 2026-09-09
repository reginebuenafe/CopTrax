import { useEffect, useState } from "react";
import { LuCircleAlert, LuRefreshCw, LuClock, LuTruck } from "react-icons/lu";
import { supabase } from "../../lib/supabase";

function fmtDate(value, includeTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function fullName(person) {
  return `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "—";
}

const STATUS_STYLES = {
  Open: "bg-red-50 text-red-700",
  "In Review": "bg-amber-50 text-amber-700",
  Resolved: "bg-green-pale text-green-dark",
};

export default function DeliveryIssuesPage() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    const timer = setTimeout(fetchIssues, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="pt-6">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-brown-dark">Issue Reports</h1>
          <p className="text-brown-light text-sm mt-0.5">Reported problems with delivery and weighing entries</p>
        </div>
        <button type="button" onClick={fetchIssues} disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-mid text-sm font-semibold hover:bg-beige disabled:opacity-60 transition-all">
          <LuRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 mb-5 text-sm"><LuCircleAlert className="w-4 h-4 shrink-0" /> {error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-3 border-green-dark border-t-transparent rounded-full animate-spin" /></div>
      ) : issues.length === 0 ? (
        <div className="bg-white border border-beige-dark/40 rounded-xl flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-14 h-14 bg-beige rounded-2xl flex items-center justify-center mb-4"><LuCircleAlert className="w-7 h-7 text-brown-light" /></div>
          <p className="text-brown-dark font-semibold">No issue reports yet</p>
          <p className="text-brown-light text-sm mt-1">Issues reported by weighers and lab staff will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-brown-light">{issues.length} reported {issues.length === 1 ? "issue" : "issues"}</p>
          {issues.map(issue => (
            <article key={issue.issue_report_id} className="bg-white border border-beige-dark/40 rounded-xl p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[issue.status] ?? STATUS_STYLES.Open}`}>{issue.status ?? "Open"}</span>
                    <span className="text-xs text-brown-light">Reported {fmtDate(issue.created_at, true)}</span>
                  </div>
                  <p className="text-sm leading-6 text-brown-dark whitespace-pre-wrap break-words">{issue.issue_note}</p>
                </div>
                <div className="w-full lg:max-w-sm bg-beige rounded-xl p-4 text-sm space-y-2.5 shrink-0">
                  <p className="text-xs text-brown-light font-semibold uppercase tracking-wide">Linked Delivery</p>
                  <p className="flex items-start gap-2 text-brown-mid"><LuTruck className="w-4 h-4 text-brown-light mt-0.5 shrink-0" /><span className="min-w-0 break-words"><span className="block font-semibold text-brown-dark">{fullName(issue.delivery?.supplier)}</span><span className="block text-xs mt-0.5">{fmtDate(issue.delivery?.delivery_date)} · {issue.delivery?.delivery_source ?? "Delivery"}</span><span className="block text-xs mt-0.5 break-all">ID: {issue.delivery?.delivery_id ?? "—"}</span></span></p>
                  <p className="flex items-start gap-2 text-brown-mid"><LuClock className="w-4 h-4 text-brown-light mt-0.5 shrink-0" /><span>Reported by <span className="font-semibold text-brown-dark">{fullName(issue.reporter)}</span> <span className="text-brown-light">({issue.reporter?.roles?.role_name ?? "—"})</span></span></p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
