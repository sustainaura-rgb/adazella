import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/cn";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Light mode" : "Dark mode";

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "flex items-center gap-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100",
        "hover:bg-slate-100 dark:hover:bg-slate-800 transition",
        compact ? "p-2 justify-center" : "px-3 py-1.5 text-xs"
      )}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
