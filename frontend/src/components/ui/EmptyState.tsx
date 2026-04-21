import { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Inbox, LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-16 px-6", className)}>
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/10 to-purple-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
        <Icon size={28} className="text-brand-500" strokeWidth={1.75} />
      </div>
      <h3 className="text-base font-semibold text-[rgb(var(--text-primary))] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[rgb(var(--text-secondary))] max-w-md mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
