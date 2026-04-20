import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    nav("/dashboard");
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
          <h1 className="text-2xl font-bold mb-1">Set new password</h1>
          <p className="text-sm text-slate-500 mb-6">Choose a strong password (8+ characters).</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">New password</label>
              <input
                type="password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              />
            </div>
            {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
