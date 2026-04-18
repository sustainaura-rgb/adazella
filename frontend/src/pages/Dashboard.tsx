import { useAuth } from "@/hooks/useAuth";
import { Zap, LogOut, Link2 } from "lucide-react";

export default function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[rgb(var(--border))] bg-[rgb(var(--bg-surface))] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
            <Zap className="text-white" size={18} strokeWidth={2.5} />
          </div>
          <div className="text-lg font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            AdPilot
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{user?.email}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-slate-500 hover:text-red-500 flex items-center gap-1"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto p-6">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 mx-auto bg-brand-100 dark:bg-brand-500/10 rounded-full flex items-center justify-center mb-4">
            <Link2 className="text-brand-600" size={28} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to AdPilot!</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            To get started, connect your Amazon Ads account. We'll pull your campaigns and start monitoring performance.
          </p>
          <button className="px-6 py-2.5 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-brand-500/30 transition">
            Connect Amazon Account
          </button>
          <p className="text-xs text-slate-400 mt-4">
            (Amazon OAuth integration — coming in Phase 1.6)
          </p>
        </div>
      </main>
    </div>
  );
}
