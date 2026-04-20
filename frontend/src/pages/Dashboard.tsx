import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Zap, LogOut, Link2, CheckCircle2, AlertCircle, Loader2, Package } from "lucide-react";

interface Me {
  user: { id: string; email: string };
  workspace: { id: string; name: string; plan: string; trial_ends_at: string; target_acos: number };
  amazon_connection: {
    id: string;
    profile_id: string;
    marketplace_id: string;
    account_name: string | null;
    status: string;
    last_fetch_at: string | null;
  } | null;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const oauthSuccess = searchParams.get("amazon_connected");
  const oauthError = searchParams.get("amazon_error");

  useEffect(() => {
    if (oauthSuccess || oauthError) {
      setTimeout(() => {
        searchParams.delete("amazon_connected");
        searchParams.delete("amazon_error");
        setSearchParams(searchParams, { replace: true });
      }, 4000);
    }
  }, [oauthSuccess, oauthError, searchParams, setSearchParams]);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get<Me>("/api/me");
        setMe(data);
      } catch (err) {
        console.error("Failed to load /api/me", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleConnectAmazon() {
    setConnecting(true);
    setConnectError(null);
    try {
      const { data } = await api.get<{ url: string }>("/api/oauth/amazon/start");
      window.location.href = data.url;
    } catch (err: any) {
      setConnectError(err.response?.data?.error || err.message || "Failed to start Amazon connect");
      setConnecting(false);
    }
  }

  async function handleDisconnectAmazon() {
    if (!confirm("Disconnect your Amazon account? You can reconnect anytime.")) return;
    try {
      await api.post("/api/oauth/amazon/disconnect");
      setMe((m) => (m ? { ...m, amazon_connection: null } : m));
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  const trialDaysLeft = me?.workspace.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(me.workspace.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[rgb(var(--border))] bg-[rgb(var(--bg-surface))] px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
            <Zap className="text-white" size={18} strokeWidth={2.5} />
          </div>
          <div className="text-lg font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            AdPilot
          </div>
        </div>
        <div className="flex items-center gap-4">
          {me?.workspace.plan === "trial" && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold dark:bg-amber-500/10 dark:text-amber-400">
              Trial — {trialDaysLeft} days left
            </span>
          )}
          <span className="text-sm text-slate-500 hidden sm:inline">{user?.email}</span>
          <button
            onClick={() => signOut().then(() => nav("/login"))}
            className="text-sm text-slate-500 hover:text-red-500 flex items-center gap-1"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      {/* Toast banners */}
      {oauthSuccess && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 rounded-lg px-4 py-3 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={18} />
            <span className="font-medium">Amazon account connected! We'll start fetching your data shortly.</span>
          </div>
        </div>
      )}
      {oauthError && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 rounded-lg px-4 py-3 flex items-center gap-2 animate-fade-in">
            <AlertCircle size={18} />
            <span className="font-medium">Amazon connection failed: {oauthError}</span>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-5xl mx-auto p-6">
        {!me?.amazon_connection && (
          <div className="card p-10 text-center animate-slide-up">
            <div className="w-16 h-16 mx-auto bg-brand-100 dark:bg-brand-500/10 rounded-full flex items-center justify-center mb-5">
              <Link2 className="text-brand-600" size={28} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Connect your Amazon Ads account</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
              We'll securely pull your campaigns, search terms, and performance data. You can disconnect anytime.
            </p>
            {connectError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-4 py-2 rounded-lg inline-block">
                {connectError}
              </div>
            )}
            <button
              onClick={handleConnectAmazon}
              disabled={connecting}
              className="px-6 py-3 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-brand-500/30 transition disabled:opacity-60 inline-flex items-center gap-2"
            >
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              {connecting ? "Redirecting to Amazon..." : "Connect Amazon Account"}
            </button>
            <p className="text-xs text-slate-400 mt-5">
              You'll be redirected to Amazon to authorize AdPilot. We never see your password.
            </p>
          </div>
        )}

        {me?.amazon_connection && (
          <div className="card p-8 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="text-emerald-600" size={20} />
                </div>
                <div>
                  <h2 className="font-bold">{me.amazon_connection.account_name || "Amazon account"}</h2>
                  <p className="text-xs text-slate-500">
                    Profile {me.amazon_connection.profile_id} · {me.amazon_connection.marketplace_id}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnectAmazon}
                className="text-xs text-slate-500 hover:text-red-500"
              >
                Disconnect
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 text-center">
              <Package className="mx-auto text-slate-400 mb-3" size={32} />
              <h3 className="font-semibold mb-1">Your dashboard is almost ready</h3>
              <p className="text-sm text-slate-500 mb-4">
                First data fetch starts within a few minutes. Phase 2 features (Overview, Campaigns, Search Terms, etc.) coming soon.
              </p>
              <p className="text-xs text-slate-400">
                Last fetch: {me.amazon_connection.last_fetch_at
                  ? new Date(me.amazon_connection.last_fetch_at).toLocaleString()
                  : "never (first run pending)"}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
