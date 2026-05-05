"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState(false);

  const passwordsMatch = password === confirm;
  const showMismatch = confirmTouched && confirm.length > 0 && !passwordsMatch;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.session) {
      // Email confirmation disabled — user is immediately logged in
      router.push("/dashboard");
      router.refresh();
    } else {
      // Email confirmation required
      setAwaitingEmail(true);
      setLoading(false);
    }
  }

  if (awaitingEmail) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-[400px]">
          <div className="bg-card border border-edge rounded-xl p-8 text-center">
            <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={22} className="text-brand" strokeWidth={1.75} />
            </div>
            <h2 className="text-white font-semibold text-[15px] mb-2">Check your email</h2>
            <p className="text-muted text-sm leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-white font-medium">{email}</span>.
              Click it to activate your account.
            </p>
            <Link
              href="/auth/login"
              className="inline-block mt-6 text-[13px] text-brand hover:text-brand-hover font-medium transition-colors"
            >
              Back to sign in
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
          <h2 className="text-white font-semibold text-[15px] mb-0.5">Create your account</h2>
          <p className="text-muted text-sm mb-6">Start underwriting deals with AI</p>

          <form onSubmit={handleSignup} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-[13px] font-medium text-white/70 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-surface border border-edge rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-white/70 mb-1.5">
                Password
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

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm" className="block text-[13px] font-medium text-white/70 mb-1.5">
                Confirm password
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
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-muted mt-5">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-brand hover:text-brand-hover font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
