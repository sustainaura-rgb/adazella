import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import {
  Home, LayoutDashboard, Search, Package, Sparkles, Ban, Settings,
  Zap, LogOut, PanelLeftClose, PanelLeftOpen, Link2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
  const [me, setMe] = useState<Me | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    api.get<Me>("/api/me").then((r) => setMe(r.data)).catch(() => {});
  }, []);

  const trialDaysLeft = me?.workspace.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(me.workspace.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  // Show a banner (non-blocking) if user hasn't connected Amazon.
  // Dashboard is still fully usable with mock/seeded data.
  const showConnectBanner = me !== null && !me?.amazon_connection && !bannerDismissed;

  return (
    <div className="min-h-screen flex bg-[rgb(var(--bg-app))] relative">
      {/* Premium gradient mesh background — subtle ambient glow behind everything */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-60 pointer-events-none" />

      {/* ═══ Premium Sidebar — glassmorphic ═══ */}
      <aside className={cn(
        "relative z-10",
        "bg-[rgb(var(--bg-surface))]/85 backdrop-blur-2xl",
        "border-r border-[rgb(var(--border))]",
        "sticky top-0 h-screen overflow-y-auto transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64 px-4" : "w-16 px-2",
        "py-4"
      )}>
        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            "self-end mb-2 p-1.5 rounded-lg transition-all",
            "text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]",
            "hover:bg-[rgb(var(--bg-muted))]"
          )}
          title={sidebarOpen ? "Collapse" : "Expand"}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        {/* Brand — premium with glow */}
        <div className={cn(
          "flex items-center gap-3 pb-5 mb-3 border-b border-[rgb(var(--border))]",
          sidebarOpen ? "px-1" : "justify-center"
        )}>
          <div className="relative w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0 shadow-glow-sm">
            <Zap className="text-white relative z-10" size={20} strokeWidth={2.5} />
            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          {sidebarOpen && (
            <div>
              <div className="text-lg font-black text-gradient leading-none tracking-tight">
                Adazella
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--text-muted))] mt-1">
                Amazon Ads
              </div>
            </div>
          )}
        </div>

        {/* Nav — animated active state with glow */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) => cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-[rgb(var(--text-primary))] bg-gradient-to-r from-brand-500/12 to-purple-500/8 shadow-soft"
                  : "text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-muted))]",
                !sidebarOpen && "justify-center"
              )}
              title={!sidebarOpen ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator — left bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-gradient-brand shadow-glow-sm" />
                  )}
                  <Icon
                    size={17}
                    className={cn(
                      "shrink-0 transition-transform group-hover:scale-110",
                      isActive && "text-brand-500 dark:text-brand-400"
                    )}
                  />
                  {sidebarOpen && <span>{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Trial badge — premium glow */}
        {sidebarOpen && me?.workspace.plan === "trial" && (
          <div className="mb-3 mt-3 p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 ring-1 ring-amber-500/10 shadow-soft">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={12} className="text-amber-500" strokeWidth={2.5} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Trial · {trialDaysLeft}d left
              </span>
            </div>
            <button className="text-[11px] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition">
              Upgrade for unlimited access →
            </button>
          </div>
        )}

        {/* User + theme + sign out — bottom panel */}
        <div className="border-t border-[rgb(var(--border))] pt-3 mt-2">
          {sidebarOpen ? (
            <div className="flex flex-col gap-1">
              <div className="px-1 mb-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[rgb(var(--text-muted))] mb-0.5">
                  Signed in as
                </div>
                <div className="text-xs text-[rgb(var(--text-secondary))] truncate">{user?.email}</div>
              </div>
              <ThemeToggle />
              <button
                onClick={() => signOut().then(() => nav("/login"))}
                className={cn(
                  "w-full px-3 py-1.5 text-xs flex items-center gap-2 rounded-lg transition",
                  "text-[rgb(var(--text-muted))] hover:text-rose-500",
                  "hover:bg-rose-500/10"
                )}
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 items-center">
              <ThemeToggle compact />
              <button
                onClick={() => signOut().then(() => nav("/login"))}
                className="w-full p-2 text-[rgb(var(--text-muted))] hover:text-rose-500 flex items-center justify-center rounded-lg hover:bg-rose-500/10 transition"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ═══ Main ═══ */}
      <main className="flex-1 overflow-x-hidden flex flex-col relative z-10">
        {/* Premium connect banner — gradient + glow */}
        {showConnectBanner && (
          <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/8 to-pink-500/10 border-b border-amber-500/20 px-6 py-3 flex items-center gap-3 text-sm backdrop-blur-sm">
            <div className="w-7 h-7 rounded-lg bg-gradient-warning flex items-center justify-center shadow-glow-sm">
              <AlertTriangle size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[rgb(var(--text-primary))] flex-1">
              <strong className="font-semibold">Connect your Amazon Ads account</strong>
              <span className="text-[rgb(var(--text-secondary))] ml-2">to replace demo data with your real campaigns</span>
            </span>
            <button
              onClick={async () => {
                try {
                  const { data } = await api.get<{ url: string }>("/api/oauth/amazon/start");
                  window.location.href = data.url;
                } catch {
                  // silent
                }
              }}
              className="btn-premium text-xs px-3 py-1.5"
            >
              <Link2 size={13} /> Connect Amazon
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))] transition text-xs font-semibold w-7 h-7 rounded-lg hover:bg-[rgb(var(--bg-muted))] flex items-center justify-center"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
