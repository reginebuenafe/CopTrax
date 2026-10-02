import { useState } from "react";
import { LuX, LuUpload, LuCircleAlert, LuCheck, LuLoader } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { validateEvidenceFile, uploadEvidencePhoto } from "../utils/issueEvidence";

/**
 * ReportCorrectionModal — shared "Report Issue" modal used by Weighing Staff
 * (Weight Correction) and Laboratory Staff (MC Correction). Requires a
 * reason/description plus TWO evidence photos before the report can be
 * submitted; uploads both photos to the existing private `documents`
 * Storage bucket (see utils/issueEvidence.js) and only then calls
 * `onSubmit({ note, photo1FileId, photo2FileId })`, which the calling page
 * uses to insert the typed `delivery_issue_reports` row (it already knows
 * the delivery_id and issue_type).
 *
 * Props:
 *   title, subtitle        – modal heading copy
 *   photo1Label/Hint       – e.g. "Photo of Correct Weight" / "...the scale/display"
 *   photo2Label/Hint       – e.g. "Photo of Paper Receipt" / "...showing the correct weight"
 *   onClose                – () => void
 *   onSubmit               – async ({ note, photo1FileId, photo2FileId }) => void
 */
export default function ReportCorrectionModal({ title, subtitle, photo1Label, photo1Hint, photo2Label, photo2Hint, onClose, onSubmit }) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [photo1, setPhoto1] = useState(null); // { file, previewUrl }
  const [photo2, setPhoto2] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function pickPhoto(setter) {
    return e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const validationError = validateEvidenceFile(file);
      if (validationError) { setError(validationError); return; }
      setError("");
      setter({ file, previewUrl: URL.createObjectURL(file) });
    };
  }

  async function handleSubmit() {
    if (submitting) return; // guard against a double/rapid click while the upload is in flight
    const trimmedNote = note.trim();
    if (!trimmedNote) { setError("Describe the problem before submitting."); return; }
    if (!photo1) { setError(`${photo1Label} is required.`); return; }
    if (!photo2) { setError(`${photo2Label} is required.`); return; }

    setError("");
    setSubmitting(true);
    try {
      const [photo1FileId, photo2FileId] = await Promise.all([
        uploadEvidencePhoto(user.id, photo1.file, "evidence-1"),
        uploadEvidencePhoto(user.id, photo2.file, "evidence-2"),
      ]);
      await onSubmit({ note: trimmedNote, photo1FileId, photo2FileId });
    } catch (err) {
      setError(err?.message || "Could not save the issue report. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-brown-dark/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-card max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-brown-dark">{title}</h3>
          <button type="button" onClick={onClose} disabled={submitting} className="text-brown-light hover:text-brown-dark disabled:opacity-50"><LuX /></button>
        </div>
        {subtitle && <p className="text-sm text-brown-light mb-4">{subtitle}</p>}

        {error && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <label className="block text-sm font-medium text-brown-dark mb-1.5">Reason / Description <span className="text-red-500">*</span></label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
          placeholder="Describe what is incorrect and what the correct value should be..."
          className="w-full px-4 py-2.5 rounded-xl border border-beige-dark bg-white text-brown-dark text-sm
            placeholder-brown-light/50 focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid transition-all resize-none mb-4" />

        <PhotoPicker label={photo1Label} hint={photo1Hint} value={photo1} onChange={pickPhoto(setPhoto1)} disabled={submitting} />
        <div className="mb-4" />
        <PhotoPicker label={photo2Label} hint={photo2Hint} value={photo2} onChange={pickPhoto(setPhoto2)} disabled={submitting} />

        <button type="button" onClick={handleSubmit} disabled={submitting}
          className="w-full mt-5 py-2.5 rounded-xl bg-red-700 text-white font-semibold text-sm hover:bg-red-800 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
          {submitting && <LuLoader className="w-4 h-4 animate-spin" />}
          Submit Issue Report
        </button>
      </div>
    </div>
  );
}

function PhotoPicker({ label, hint, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-brown-dark mb-1.5">{label} <span className="text-red-500">*</span></label>
      {hint && <p className="text-xs text-brown-light mb-2">{hint}</p>}
      {value ? (
        <div className="relative rounded-xl overflow-hidden border-2 border-green-mid/40">
          <img src={value.previewUrl} alt={label} className="w-full object-cover max-h-40" />
          <div className="absolute bottom-2 left-2 bg-green-dark text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <LuCheck className="w-3 h-3" /> Photo attached
          </div>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-beige-dark rounded-xl py-4 text-sm font-semibold text-brown-mid hover:bg-beige transition-all cursor-pointer ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <LuUpload className="w-4 h-4" /> Upload Photo
          <input type="file" accept="image/*" className="hidden" onChange={onChange} disabled={disabled} />
        </label>
      )}
    </div>
  );
}
