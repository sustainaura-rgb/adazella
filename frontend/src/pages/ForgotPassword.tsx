import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [done, setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 max-w-md text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            We sent a password reset link to <strong>{email}</strong>.
          </p>
          <Link to="/login" className="text-brand-600 font-semibold hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
            <Zap className="text-white" size={24} strokeWidth={2.5} />
          </div>
          <div className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            AdPilot
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-bold mb-1">Reset your password</h1>
          <p className="text-sm text-slate-500 mb-6">We'll email you a reset link.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
              <input
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </div>
            {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              Send reset link
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Remember it?{" "}
            <Link to="/login" className="text-brand-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
