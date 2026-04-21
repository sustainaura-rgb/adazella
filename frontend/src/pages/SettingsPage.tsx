import { useEffect, useState } from "react";
import {
  Save, Plus, X, CheckCircle2, AlertCircle, Target, Loader2,
  Link2, Unlink, Package, User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface Profile {
  include_keywords: string[];
  exclude_keywords: string[];
  competitor_brands: string[];
  target_acos: number;
  notes: string | null;
}

interface Me {
  user: { id: string; email: string };
  workspace: { id: string; name: string; plan: string; trial_ends_at: string; target_acos: number };
  amazon_connection: { id: string; account_name: string | null; profile_id: string; marketplace_id: string; status: string; last_fetch_at: string | null } | null;
}

const SECTIONS: Array<{ key: "include_keywords" | "exclude_keywords" | "competitor_brands"; label: string; desc: string; color: string; placeholder: string }> = [
  {
    key: "include_keywords",
    label: "Include keywords",
    desc: "Words that describe what you SELL. Search terms containing these score LOW negativity (keep them).",
    color: "emerald",
    placeholder: "e.g. shower curtain, peva, magnets",
  },
  {
    key: "exclude_keywords",
    label: "Exclude keywords",
    desc: "Words you DON'T sell (colors, materials, sizes you don't carry). Search terms with these score HIGH negativity.",
    color: "red",
    placeholder: "e.g. fabric, vinyl, blue",
  },
  {
    key: "competitor_brands",
    label: "Competitor brands",
    desc: "Brand names that aren't yours. Any search term containing these is auto-flagged as 100% negative.",
    color: "amber",
    placeholder: "e.g. mdesign, amazon basics",
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newWords, setNewWords] = useState({ include_keywords: "", exclude_keywords: "", competitor_brands: "" });

  useEffect(() => {
    async function load() {
      try {
        const [profRes, meRes] = await Promise.all([
          api.get<Profile>("/api/profile"),
          api.get<Me>("/api/me"),
        ]);
        setProfile(profRes.data);
        setMe(meRes.data);
      } catch (err: any) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function addWords(key: keyof typeof newWords) {
    const raw = newWords[key];
    if (!raw.trim()) return;
    const tokens = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    setProfile((p) => p ? {
      ...p,
      [key]: [...new Set([...(p[key] || []), ...tokens])].sort(),
    } : p);
    setNewWords((n) => ({ ...n, [key]: "" }));
  }

  function removeWord(key: "include_keywords" | "exclude_keywords" | "competitor_brands", word: string) {
    setProfile((p) => p ? { ...p, [key]: p[key].filter((w) => w !== word) } : p);
  }

  async function save() {
    if (!profile) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      const res = await api.put<Profile>("/api/profile", {
        include_keywords: profile.include_keywords,
        exclude_keywords: profile.exclude_keywords,
        competitor_brands: profile.competitor_brands,
        target_acos: profile.target_acos,
      });
      setProfile(res.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReconnect() {
    try {
      const { data } = await api.get<{ url: string }>("/api/oauth/amazon/start");
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect your Amazon account? You can reconnect anytime, but the scheduler will stop fetching your data.")) return;
    try {
      await api.post("/api/oauth/amazon/disconnect");
      setMe((m) => m ? { ...m, amazon_connection: null } : m);
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <PageSkeleton showKpis={false} rows={5} cols={3} />;
  if (error && !profile) return <div className="p-10 text-center text-red-500">Error: {error}</div>;
  if (!profile) return null;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure your product profile, target ACoS, and Amazon connection
        </p>
      </div>

      {/* ═══ Account / Workspace info ═══ */}
      <div className="card p-5">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <UserIcon size={16} className="text-brand-500" /> Account
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Email</div>
            <div className="mt-1 font-semibold">{user?.email}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Workspace</div>
            <div className="mt-1 font-semibold">{me?.workspace.name}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Plan</div>
            <div className="mt-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase">
                {me?.workspace.plan || "trial"}
              </span>
              {me?.workspace.plan === "trial" && me?.workspace.trial_ends_at && (
                <span className="ml-2 text-xs text-slate-500">
                  Ends {new Date(me.workspace.trial_ends_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">User ID</div>
            <div className="mt-1 font-mono text-xs text-slate-500 truncate">{user?.id}</div>
          </div>
        </div>
      </div>

      {/* ═══ Amazon Connection ═══ */}
      <div className="card p-5">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Link2 size={16} className="text-brand-500" /> Amazon Ads connection
        </h2>
        {me?.amazon_connection ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-semibold">{me.amazon_connection.account_name || "Connected"}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Profile: <span className="font-mono">{me.amazon_connection.profile_id}</span> ·
                Marketplace: {me.amazon_connection.marketplace_id || "unknown"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Last fetch: {me.amazon_connection.last_fetch_at
                  ? new Date(me.amazon_connection.last_fetch_at).toLocaleString()
                  : "never"}
              </div>
            </div>
            <button onClick={handleDisconnect}
                    className="text-xs font-semibold text-red-500 hover:text-red-700 inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 dark:border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
              <Unlink size={12} /> Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-slate-500">No Amazon account connected. Data shown is demo/mock.</div>
            <button onClick={handleReconnect}
                    className="text-xs font-bold text-white bg-gradient-to-br from-brand-500 to-purple-500 px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
              <Link2 size={12} /> Connect Amazon
            </button>
          </div>
        )}
      </div>

      {/* ═══ Target ACoS ═══ */}
      <div className="card p-5 border-l-4 border-brand-500">
        <h2 className="font-bold mb-1 flex items-center gap-2">
          <Target size={16} className="text-brand-500" /> Target ACoS
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Your target ACoS (%). Campaigns and keywords above this will be flagged red across the dashboard.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number" min={1} max={200} step={1}
            value={profile.target_acos ?? 25}
            onChange={(e) => setProfile((p) => p ? { ...p, target_acos: Number(e.target.value) || 25 } : p)}
            className="w-24 px-3 py-2 text-center text-xl font-black rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          />
          <span className="text-xl font-bold text-slate-500">%</span>
          <div className="text-xs text-slate-500">
            Current: <span className="font-bold text-brand-500">{profile.target_acos}%</span> — campaigns above this are flagged
          </div>
        </div>
      </div>

      {/* ═══ Product profile sections ═══ */}
      <div>
        <h2 className="font-bold mb-2 flex items-center gap-2">
          <Package size={16} className="text-brand-500" /> Product profile
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Define what you sell. Used by the Opportunities + Negatives features to score search terms and suggest action.
        </p>
      </div>

      {SECTIONS.map((s) => {
        const colorMap: Record<string, { border: string; text: string; bg: string }> = {
          emerald: { border: "border-emerald-500",  text: "text-emerald-600", bg: "bg-emerald-500" },
          red:     { border: "border-red-500",       text: "text-red-600",     bg: "bg-red-500" },
          amber:   { border: "border-amber-500",     text: "text-amber-600",   bg: "bg-amber-500" },
        };
        const c = colorMap[s.color];
        return (
          <div key={s.key} className={cn("card p-5 border-l-4", c.border)}>
            <h3 className={cn("font-bold", c.text)}>{s.label}</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">{s.desc}</p>

            {/* Existing pills */}
            <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
              {(profile[s.key] || []).length === 0 ? (
                <span className="text-xs text-slate-400 italic">No words yet — add some below.</span>
              ) : (
                profile[s.key].map((w) => (
                  <span key={w} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-medium">
                    {w}
                    <button onClick={() => removeWord(s.key, w)}
                            className="ml-0.5 p-0.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-500"
                            title="Remove">
                      <X size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add new */}
            <div className="flex gap-2">
              <input type="text"
                     placeholder={s.placeholder + " (comma-separated for bulk)"}
                     value={newWords[s.key]}
                     onChange={(e) => setNewWords((n) => ({ ...n, [s.key]: e.target.value }))}
                     onKeyDown={(e) => { if (e.key === "Enter") addWords(s.key); }}
                     className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none" />
              <button onClick={() => addWords(s.key)}
                      className={cn("px-4 py-2 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-1", c.bg, "hover:brightness-110 transition")}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        );
      })}

      {/* Save bar */}
      <div className="sticky bottom-4 card p-4 flex justify-between items-center flex-wrap gap-3 shadow-xl border-2 border-brand-500/20">
        <div className="text-xs text-slate-500">
          {success && <span className="text-emerald-500 flex items-center gap-1 font-semibold"><CheckCircle2 size={14} /> Saved successfully</span>}
          {error   && <span className="text-red-500 flex items-center gap-1 font-semibold"><AlertCircle size={14} /> {error}</span>}
          {!success && !error && <>Changes not saved yet</>}
        </div>
        <button onClick={save} disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-br from-brand-500 to-purple-500 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-brand-500/30 transition disabled:opacity-60 inline-flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}
