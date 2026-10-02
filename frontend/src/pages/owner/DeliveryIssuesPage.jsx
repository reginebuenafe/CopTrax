import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuArrowLeft, LuArrowUpDown, LuCheck, LuCircleAlert, LuCircleCheck, LuEye,
  LuFileText, LuLoader, LuRefreshCw, LuScale, LuSearch, LuTrash2, LuTruck, LuUser, LuX,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function fmtDate(value, includeTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function fmt2(n) { return Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function fullName(person) {
  return `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "—";
}

function deliverySupplierName(delivery) {
  if (!delivery) return "—";
  return delivery.delivery_source === "Walkin"
    ? fullName(delivery.walkin_supplier)
    : fullName(delivery.supplier);
}

function issueTitle(note) {
  const title = note?.trim().replace(/\s+/g, " ") || "Untitled issue";
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

function issueId(index, total) {
  return `ISS-${String(total - index).padStart(4, "0")}`;
}

// Current recorded value this issue is about, read live from the delivery
// (not from the issue report itself) so it always reflects the latest state —
// including an already-applied correction, if this issue was somehow reopened.
function currentRecordedValue(issue) {
  if (issue.issue_type === "Weight Correction") {
    return issue.delivery?.weighing_records?.[0]?.net_weight_kg;
  }
  if (issue.issue_type === "MC Correction") {
    return issue.delivery?.laboratory_inspections?.[0]?.moisture_content_pct;
  }
  return null;
}

const STATUS_STYLES = {
  Open: "bg-red-50 text-red-700",
  "In Review": "bg-amber-50 text-amber-700",
  Resolved: "bg-green-pale text-green-dark",
};

const TYPE_STYLES = {
  "Weight Correction": "bg-blue-50 text-blue-700",
  "MC Correction": "bg-purple-50 text-purple-700",
  General: "bg-beige text-brown-mid",
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
  const [correctionModal, setCorrectionModal] = useState(null); // the issue being corrected
  const [previewPhoto, setPreviewPhoto] = useState(null); // { url, label }
  const [cleaningUpId, setCleaningUpId] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function fetchIssues() {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("delivery_issue_reports")
      .select(`
        issue_report_id, issue_note, status, issue_type, created_at,
        reviewed_at, evidence_removed_at,
        photo1:evidence_photo_1_file_id(file_id, file_url, file_name),
        photo2:evidence_photo_2_file_id(file_id, file_url, file_name),
        delivery:delivery_id(
          delivery_id, delivery_date, delivery_source,
          supplier:supplier_id(first_name, last_name),
          walkin_supplier:walkin_supplier_id(first_name, last_name),
          weighing_records(net_weight_kg),
          laboratory_inspections(moisture_content_pct),
          quality_results(result)
        ),
        reporter:reported_by(first_name, last_name, roles(role_name)),
        corrections:delivery_corrections(old_value, corrected_value, date_resolved)
      `)
      .order("created_at", { ascending: false });

    if (queryError) {
      console.error("Failed to load issue reports:", queryError);
      setError("Could not load issue reports. Please try again.");
      setIssues([]);
    } else {
      setIssues(data ?? []);
    }
    setLoading(false);
  }

  async function resolveIssue(issue) {
    // Plain resolve — only ever offered for legacy 'General' issues. Weight
    // Correction / MC Correction issues can ONLY be resolved by successfully
    // applying a correction (see CorrectionModal below).
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

  // Best-effort, safely retryable: delete the Storage objects, then clear
  // the DB references. Never runs before a correction has committed, and a
  // failure here never touches the already-applied correction or the
  // Resolved status — it can simply be retried later via the same button.
  async function cleanUpEvidence(issue) {
    const paths = [issue.photo1?.file_url, issue.photo2?.file_url].filter(Boolean);
    if (paths.length === 0) return;

    setCleaningUpId(issue.issue_report_id);
    const { error: removeErr } = await supabase.storage.from("documents").remove(paths);
    if (removeErr) {
      console.error("Evidence cleanup: storage removal failed, will remain retryable:", removeErr);
      showToast("Could not delete evidence photos from storage. You can retry later.", "error");
      setCleaningUpId(null);
      return;
    }

    const { error: clearErr } = await supabase.rpc("clear_issue_evidence", { p_issue_report_id: issue.issue_report_id });
    if (clearErr) {
      console.error("Evidence cleanup: clear_issue_evidence failed:", clearErr);
      showToast("Evidence photos were deleted, but the issue record could not be updated. Please refresh and retry.", "error");
      setCleaningUpId(null);
      return;
    }

    setCleaningUpId(null);
    showToast("Evidence photos removed after resolution.");
    fetchIssues();
  }

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = issues
      .map((issue, index) => ({ issue, index, id: issueId(index, issues.length) }))
      .filter(({ issue, id }) => {
        if (statusFilter !== "All" && issue.status !== statusFilter) return false;
        if (typeFilter !== "All" && issue.issue_type !== typeFilter) return false;
        if (!query) return true;
        return [id, issue.issue_note, issue.delivery?.delivery_id, deliverySupplierName(issue.delivery), fullName(issue.reporter)]
          .some(value => value?.toLowerCase?.().includes(query));
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
      {toast && (
        <div className={`fixed left-3 right-3 top-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold sm:left-auto sm:right-5 sm:max-w-sm
          ${toast.type === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-pale border border-green-mid/30 text-green-dark"}`}>
          {toast.type === "error" ? <LuCircleAlert className="w-4 h-4" /> : <LuCheck className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col gap-2 mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-brown-dark">Issue Reports</h1>
          <p className="text-sm text-brown-light mt-0.5">Review evidence and resolve issues reported by staff.</p>
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
          <option value="Weight Correction">Issue Type: Weight Correction</option>
          <option value="MC Correction">Issue Type: MC Correction</option>
          <option value="General">Issue Type: General</option>
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
          {filteredIssues.map(({ issue, id }) => {
            const currentValue = currentRecordedValue(issue);
            const correction = issue.corrections?.[0];
            const hasEvidence = issue.photo1 || issue.photo2;
            const evidenceCleared = !!issue.evidence_removed_at;
            const canCorrect = issue.issue_type === "Weight Correction" || issue.issue_type === "MC Correction";

            return (
              <article key={issue.issue_report_id} className={`bg-white border border-beige-dark/40 border-l-2 rounded-xl p-4 ${issue.status === "Resolved" ? "border-l-green-mid" : "border-l-red-300"}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[issue.status] ?? STATUS_STYLES.Open}`}>{issue.status === "Resolved" ? "Resolved" : "Open"}</span>
                    <span className="text-xs font-bold text-brown-mid">{id}</span>
                    <span className="text-xs text-brown-light">Reported {fmtDate(issue.created_at, true)}</span>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_STYLES[issue.issue_type] ?? TYPE_STYLES.General}`}>{issue.issue_type}</span>
                </div>

                <h2 className="text-sm font-bold text-brown-dark leading-5">{issueTitle(issue.issue_note)}</h2>

                <div className="mt-3 pt-3 border-t border-beige-dark/30 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs min-w-0">
                  <div className="flex items-start gap-2 text-brown-mid">
                    <LuTruck className="w-4 h-4 text-brown-light mt-0.5 shrink-0" />
                    <span>
                      <span className="block font-semibold text-brown-dark">Linked Delivery</span>
                      <span className="block mt-0.5">{fmtDate(issue.delivery?.delivery_date)} · {deliverySupplierName(issue.delivery)}</span>
                      <span className="block mt-0.5 break-all">ID: {issue.delivery?.delivery_id ?? "—"}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-brown-mid">
                    <LuUser className="w-4 h-4 text-brown-light mt-0.5 shrink-0" />
                    <span>
                      <span className="block font-semibold text-brown-dark">Submitted by {fullName(issue.reporter)}</span>
                      <span className="block mt-0.5">{issue.reporter?.roles?.role_name ?? "—"}</span>
                    </span>
                  </div>
                  {canCorrect && (
                    <div className="flex items-start gap-2 text-brown-mid sm:col-span-2">
                      <LuScale className="w-4 h-4 text-brown-light mt-0.5 shrink-0" />
                      <span>
                        <span className="block font-semibold text-brown-dark">Current recorded value</span>
                        <span className="block mt-0.5">
                          {currentValue == null ? "—" : issue.issue_type === "Weight Correction" ? `${fmt2(currentValue)} kg` : `${fmt2(currentValue)}cc`}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {hasEvidence && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {issue.photo1 && <EvidenceThumb file={issue.photo1} label="Evidence 1" onOpen={setPreviewPhoto} />}
                    {issue.photo2 && <EvidenceThumb file={issue.photo2} label="Evidence 2" onOpen={setPreviewPhoto} />}
                  </div>
                )}
                {evidenceCleared && (
                  <p className="mt-3 text-xs italic text-brown-light">Evidence photos removed after resolution.</p>
                )}

                {issue.status === "Resolved" && correction && (
                  <div className="mt-3 bg-green-pale/60 border border-green-mid/20 rounded-lg px-3 py-2 text-xs text-green-dark font-semibold">
                    {issue.issue_type}: {fmt2(correction.old_value)}{issue.issue_type === "MC Correction" ? "cc" : " kg"} → {fmt2(correction.corrected_value)}{issue.issue_type === "MC Correction" ? "cc" : " kg"}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-beige-dark/30 flex flex-wrap gap-2 justify-end">
                  <button type="button" onClick={() => navigate(`/dashboard/owner/deliveries?deliveryId=${encodeURIComponent(issue.delivery?.delivery_id ?? "")}`)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-beige-dark bg-white text-brown-mid text-xs font-semibold hover:bg-beige transition-colors">
                    <LuEye className="w-3.5 h-3.5" /> View Delivery
                  </button>

                  {issue.status !== "Resolved" && canCorrect && (
                    <button type="button" onClick={() => setCorrectionModal(issue)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-dark text-white text-xs font-semibold hover:bg-green-mid transition-colors">
                      <LuCheck className="w-3.5 h-3.5" /> {issue.issue_type === "Weight Correction" ? "Correct Weight" : "Correct MC"}
                    </button>
                  )}

                  {issue.status !== "Resolved" && !canCorrect && (
                    <button type="button" onClick={() => resolveIssue(issue)} disabled={resolvingId === issue.issue_report_id}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-dark text-white text-xs font-semibold hover:bg-green-mid disabled:opacity-60 transition-colors">
                      <LuCheck className="w-3.5 h-3.5" /> {resolvingId === issue.issue_report_id ? "Resolving..." : "Resolve Issue"}
                    </button>
                  )}

                  {issue.status === "Resolved" && hasEvidence && !evidenceCleared && (
                    <button type="button" onClick={() => cleanUpEvidence(issue)} disabled={cleaningUpId === issue.issue_report_id}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-white text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-60 transition-colors">
                      {cleaningUpId === issue.issue_report_id ? <LuLoader className="w-3.5 h-3.5 animate-spin" /> : <LuTrash2 className="w-3.5 h-3.5" />}
                      {cleaningUpId === issue.issue_report_id ? "Cleaning up..." : "Clean Up Evidence"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {previewPhoto && <PhotoPreviewModal file={previewPhoto} onClose={() => setPreviewPhoto(null)} />}

      {correctionModal && (
        <CorrectionModal
          issue={correctionModal}
          currentValue={currentRecordedValue(correctionModal)}
          onClose={() => setCorrectionModal(null)}
          onApplied={() => {
            setCorrectionModal(null);
            showToast(`${correctionModal.issue_type} applied. Issue marked Resolved.`);
            fetchIssues();
          }}
        />
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

// ── Evidence thumbnail (click → large preview via a short-lived signed URL) ──
function EvidenceThumb({ file, label, onOpen }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(file.file_url, 300);
      if (!cancelled) setThumbUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [file.file_url]);

  if (!thumbUrl) {
    return <div className="w-20 h-20 rounded-lg bg-beige animate-pulse" />;
  }

  return (
    <button type="button" onClick={() => onOpen({ url: thumbUrl, label })}
      className="w-20 h-20 rounded-lg overflow-hidden border border-beige-dark/40 hover:border-green-mid transition-colors">
      <img src={thumbUrl} alt={label} className="w-full h-full object-cover" />
    </button>
  );
}

function PhotoPreviewModal({ file, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute -top-10 right-0 text-white hover:text-beige"><LuX className="w-6 h-6" /></button>
        <img src={file.url} alt={file.label} className="max-w-full max-h-[90vh] rounded-xl object-contain" />
      </div>
    </div>
  );
}

// ── BO correction modal: pre-filled current value → review → Confirm ────────
function CorrectionModal({ issue, currentValue, onClose, onApplied }) {
  const isWeight = issue.issue_type === "Weight Correction";
  const unit = isWeight ? "kg" : "cc";
  const [step, setStep] = useState("form"); // "form" | "review"
  const [value, setValue] = useState(currentValue != null ? String(currentValue) : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const correctedValue = Number(value);

  function validate() {
    if (value === "" || isNaN(correctedValue)) return "Please enter the corrected value.";
    if (correctedValue <= 0) return "The corrected value must be greater than 0.";
    if (!isWeight && correctedValue > 20.2) return "A corrected MC above 20.2cc would reject this delivery and is not supported by this flow.";
    return "";
  }

  function handleContinue(e) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError("");
    setStep("review");
  }

  async function handleConfirm() {
    if (submitting) return; // guard against a double/rapid click on Confirm Correction
    setSubmitting(true);
    setError("");

    const { error: rpcError } = await supabase.rpc("apply_delivery_correction", {
      p_issue_report_id: issue.issue_report_id,
      p_corrected_value: correctedValue,
    });

    if (rpcError) {
      setError(rpcError.message ?? "Failed to apply correction. Please try again.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onApplied();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-beige-dark/40 w-full max-w-md max-h-[92vh] overflow-y-auto p-6 relative">
        <button onClick={onClose} disabled={submitting} className="absolute top-4 right-4 text-brown-light hover:text-brown-dark disabled:opacity-50">
          <LuX className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-pale rounded-xl flex items-center justify-center shrink-0">
            <LuScale className="w-5 h-5 text-green-dark" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brown-dark">{step === "form" ? (isWeight ? "Correct Weight" : "Correct MC") : "Review Correction"}</h2>
            <p className="text-brown-light text-sm">{step === "form" ? "Enter the corrected value based on the submitted evidence." : "This cannot be undone once confirmed."}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {step === "form" ? (
          <form onSubmit={handleContinue} className="space-y-4">
            <div className="bg-beige rounded-xl px-4 py-3 text-sm">
              <p className="text-brown-light text-xs font-semibold uppercase tracking-wide mb-1">Current recorded value</p>
              <p className="font-bold text-brown-dark">{currentValue != null ? `${fmt2(currentValue)} ${unit}` : "—"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Corrected {isWeight ? "Weight (kg)" : "MC (cc)"} <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.01" min="0.01" required value={value} onChange={e => setValue(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-beige-dark bg-white text-sm text-brown-dark
                  focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all">
                Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-beige rounded-xl divide-y divide-beige-dark/30 text-sm">
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-brown-light">{isWeight ? "Current Weight" : "Current MC"}</span>
                <span className="font-semibold text-brown-dark">{fmt2(currentValue)} {unit}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-brown-light">{isWeight ? "Corrected Weight" : "Corrected MC"}</span>
                <span className="font-bold text-green-dark">{fmt2(correctedValue)} {unit}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("form")} disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all disabled:opacity-50">
                <LuArrowLeft className="w-4 h-4" /> Cancel
              </button>
              <button type="button" onClick={handleConfirm} disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-dark text-white font-bold text-sm hover:bg-green-dark/90 transition-all disabled:opacity-60">
                {submitting && <LuLoader className="w-4 h-4 animate-spin" />}
                Confirm Correction
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
