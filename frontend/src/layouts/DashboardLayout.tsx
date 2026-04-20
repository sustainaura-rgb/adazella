import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import {
  Home, LayoutDashboard, Search, Package, Sparkles, Ban, Settings,
  Zap, LogOut, PanelLeftClose, PanelLeftOpen, Link2,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Me {
  user: { id: string; email: string };
  workspace: { id: string; name: string; plan: string; trial_ends_at: string };
  amazon_connection: { status: string; account_name: string | null } | null;
}

const NAV_ITEMS = [
  { to: "/dashboard",               icon: Home,            label: "Overview" },
  { to: "/dashboard/campaigns",     icon: LayoutDashboard, label: "Campaigns" },
  { to: "/dashboard/search-terms",  icon: Search,          label: "Search Terms" },
  { to: "/dashboard/products",      icon: Package,         label: "Products" },
  { to: "/dashboard/opportunities", icon: Sparkles,        label: "Opportunities" },
  { to: "/dashboard/negatives",     icon: Ban,             label: "Negatives" },
  { to: "/dashboard/settings",      icon: Settings,        label: "Settings" },
];

export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    api.get<Me>("/api/me").then((r) => setMe(r.data)).catch(() => {});
  }, []);

  const trialDaysLeft = me?.workspace.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(me.workspace.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  // If user hasn't connected Amazon, show the connect CTA instead of pages
  // (unless they're on Settings which doesn't need Amazon)
  const needsAmazon = !me?.amazon_connection && !loc.pathname.includes("/settings");

  return (
    <div className="min-h-screen flex bg-[rgb(var(--bg-app))]">
      {/* ═══ Sidebar ═══ */}
      <aside className={cn(
        "bg-[rgb(var(--bg-surface))] border-r border-[rgb(var(--border))]",
        "sticky top-0 h-screen overflow-y-auto transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-60 px-4" : "w-16 px-2",
        "py-4"
      )}>
        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="self-end mb-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          title={sidebarOpen ? "Collapse" : "Expand"}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        {/* Brand */}
        <div className={cn("flex items-center gap-3 pb-4 mb-2 border-b border-[rgb(var(--border))]",
                           sidebarOpen ? "px-1" : "justify-center")}>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center shrink-0">
            <Zap className="text-white" size={18} strokeWidth={2.5} />
          </div>
          {sidebarOpen && (
            <div>
              <div className="text-base font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent leading-none">
                AdPilot
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Amazon Ads</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
                "text-slate-600 dark:text-slate-300",
                isActive
                  ? "bg-gradient-to-r from-brand-500/15 to-purple-500/15 text-brand-600 dark:text-brand-400 shadow-sm"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800",
                !sidebarOpen && "justify-center"
              )}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={17} className="shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Trial badge */}
        {sidebarOpen && me?.workspace.plan === "trial" && (
          <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-[11px] text-amber-700 dark:text-amber-400">
            <div className="font-semibold">🎁 Trial — {trialDaysLeft} days left</div>
            <div className="text-amber-600 dark:text-amber-500 mt-0.5">Upgrade for unlimited access</div>
          </div>
        )}

        {/* User + sign out */}
        <div className="border-t border-[rgb(var(--border))] pt-3 mt-2">
          {sidebarOpen ? (
            <div>
              <div className="text-xs text-slate-500 truncate px-1">{user?.email}</div>
              <button
                onClick={() => signOut().then(() => nav("/login"))}
                className="mt-2 w-full px-3 py-1.5 text-xs text-slate-500 hover:text-red-500 flex items-center gap-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signOut().then(() => nav("/login"))}
              className="w-full p-2 text-slate-500 hover:text-red-500 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </aside>

      {/* ═══ Main ═══ */}
      <main className="flex-1 overflow-x-hidden">
        {needsAmazon ? <AmazonConnectPrompt me={me} /> : <Outlet />}
      </main>
    </div>
  );
}

function AmazonConnectPrompt({ me: _me }: { me: Me | null }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const { data } = await api.get<{ url: string }>("/api/oauth/amazon/start");
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
      setConnecting(false);
    }
  }

  return (
    <div className="p-6 md:p-12">
      <div className="max-w-2xl mx-auto card p-10 text-center animate-slide-up">
        <div className="w-16 h-16 mx-auto bg-brand-100 dark:bg-brand-500/10 rounded-full flex items-center justify-center mb-5">
          <Link2 className="text-brand-600" size={28} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Connect your Amazon Ads account</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
          We'll securely pull your campaigns, search terms, and performance data. You can disconnect anytime.
        </p>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-4 py-2 rounded-lg inline-block">
            {error}
          </div>
        )}
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="px-6 py-3 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-brand-500/30 transition disabled:opacity-60 inline-flex items-center gap-2"
        >
          <Link2 size={16} />
          {connecting ? "Redirecting to Amazon..." : "Connect Amazon Account"}
        </button>
        <p className="text-xs text-slate-400 mt-5">
          You'll be redirected to Amazon to authorize AdPilot. We never see your password.
        </p>
      </div>
    </div>
  );
}
