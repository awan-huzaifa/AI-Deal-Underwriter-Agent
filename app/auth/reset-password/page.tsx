"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordsMatch = password === confirm;
  const showMismatch = confirmTouched && confirm.length > 0 && !passwordsMatch;

  useEffect(() => {
    const supabase = createClient();

    // Handle hash-based recovery token (Supabase implicit flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also cover the PKCE code-exchange flow (user arrives via /auth/callback redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      // Brief pause so the user sees the success state before redirect
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    }
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="bg-card border border-edge rounded-xl p-8 text-center">
            <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={22} className="text-brand" strokeWidth={1.75} />
            </div>
            <h2 className="text-white font-semibold text-[15px] mb-2">Password updated</h2>
            <p className="text-muted text-sm">Redirecting you to the dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  // Guard — no valid recovery session
  if (!ready) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="bg-card border border-edge rounded-xl p-8 text-center">
            <p className="text-muted text-sm mb-4">
              This link is invalid or has expired. Request a new one.
            </p>
            <Link
              href="/auth/forgot-password"
              className="text-[13px] text-brand hover:text-brand-hover font-medium transition-colors"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 bg-brand rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-brand/30">
            <span className="text-white font-bold text-base tracking-tight">D</span>
          </div>
          <h1 className="text-white font-semibold text-xl tracking-tight">Deal UW</h1>
          <p className="text-muted text-sm mt-1">Real Estate Underwriting Platform</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-edge rounded-xl p-7">
          <h2 className="text-white font-semibold text-[15px] mb-0.5">Set a new password</h2>
          <p className="text-muted text-sm mb-6">Must be at least 6 characters.</p>

          <form onSubmit={handleReset} className="space-y-4">
            {/* New password */}
            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-white/70 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full bg-surface border border-edge rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div>
              <label htmlFor="confirm" className="block text-[13px] font-medium text-white/70 mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={() => setConfirmTouched(true)}
                  placeholder="Re-enter your password"
                  className={`w-full bg-surface border rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 transition-colors ${
                    showMismatch
                      ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/20"
                      : "border-edge focus:border-brand focus:ring-brand/20"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {showMismatch && (
                <p className="text-[12px] text-red-400 mt-1.5">Passwords do not match.</p>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <p className="text-[13px] text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || showMismatch}
              className="w-full bg-brand hover:bg-brand-hover text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {loading ? "Updating password…" : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
