import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Signup() {
  const nav = useNavigate();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 max-w-md text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            We sent a verification link to <strong>{email}</strong>. Click the link to activate your account.
          </p>
          <button onClick={() => nav("/login")} className="text-brand-600 font-semibold hover:underline">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 via-white to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Zap className="text-white" size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
              AdPilot
            </div>
            <div className="text-xs text-slate-500">Amazon Ads Automation</div>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-bold mb-1">Start your free trial</h1>
          <p className="text-sm text-slate-500 mb-6">14 days full access. No credit card required.</p>

          <button
            onClick={handleGoogle}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-xs text-slate-400">OR</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Your name</label>
              <input
                type="text" required
                value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Work email</label>
              <input
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password (min 8 chars)</label>
              <input
                type="password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </div>
            {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-brand-500/30 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              Create account
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-400 text-center">
            By signing up, you agree to our{" "}
            <a href="/terms" className="underline">Terms</a> &{" "}
            <a href="/privacy" className="underline">Privacy Policy</a>
          </p>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
