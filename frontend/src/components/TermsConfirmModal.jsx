import { Link } from "react-router-dom";
import { LuShieldCheck, LuX, LuCheck } from "react-icons/lu";

/**
 * Confirmation popup shown when a prospective Supplier clicks "Create an
 * account" on the Login page, before they're taken into the registration
 * form. Requires checking the box (Terms & Conditions + Privacy Policy)
 * before the "Create Account" action is enabled.
 */
export default function TermsConfirmModal({ agreed, onAgreedChange, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-3xl shadow-card w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-beige-dark/20">
          <div className="flex items-center gap-2">
            <LuShieldCheck className="w-4 h-4 text-green-dark" />
            <h3 className="font-bold text-brown-dark text-sm">Before You Continue</h3>
          </div>
          <button onClick={onCancel} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm text-brown-mid leading-relaxed mb-4">
            Please confirm the following before creating your CopTrax account.
          </p>
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-beige-dark bg-beige/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => onAgreedChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-brown-light text-green-dark focus:ring-green-mid accent-green-dark"
            />
            <span className="text-sm text-brown-mid leading-relaxed">
              I have read and agree to the{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer"
                className="text-green-mid font-semibold hover:text-green-dark transition-colors">
                Terms &amp; Conditions
              </Link>{" "}
              and acknowledge the{" "}
              <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer"
                className="text-green-mid font-semibold hover:text-green-dark transition-colors">
                Privacy Policy
              </Link>.
            </span>
          </label>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button type="button" onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!agreed}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            <LuCheck className="w-4 h-4" /> Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
