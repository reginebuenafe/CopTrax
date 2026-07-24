import { Link } from "react-router-dom";
import { LuLeaf, LuClock, LuMail } from "react-icons/lu";

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-light/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-green-mid/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-green-dark to-green-light rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <LuLeaf className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-green-dark tracking-tight">CopTrax</h1>
          <p className="text-brown-light text-sm mt-1">NERC Copra Trading — Staff Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-8">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <LuClock className="w-8 h-8 text-amber-500" />
          </div>

          <h2 className="text-xl font-bold text-brown-dark mb-3">Account Pending Approval</h2>

          <p className="text-brown-light text-sm leading-relaxed mb-5">
            Your registration has been submitted successfully.
            A Business Owner at NERC Copra Trading will review your account shortly.
            You will be able to log in once your account is approved.
          </p>

          <div className="bg-green-pale rounded-2xl px-4 py-3 flex items-start gap-3 text-left mb-6">
            <LuMail className="w-4 h-4 text-green-mid mt-0.5 shrink-0" />
            <p className="text-green-dark text-sm">
              You may close this page. Come back and{" "}
              <Link to="/login" className="font-semibold underline underline-offset-2">
                try logging in
              </Link>{" "}
              after your account has been approved.
            </p>
          </div>

          <Link
            to="/"
            className="inline-block w-full bg-gradient-to-r from-green-dark to-green-mid text-white
                       font-bold py-3 rounded-xl shadow-md hover:shadow-glow-green transition-all duration-300 text-sm"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
