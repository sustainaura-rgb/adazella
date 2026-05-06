import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "glass" | "premium" | "gradient";

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  variant?: Variant;
  hover?: boolean;
  padded?: boolean;
  glowColor?: "brand" | "success" | "warning" | "danger";
  onClick?: () => void;
}

export function PremiumCard({
  children,
  className,
  variant = "default",
  hover = false,
  padded = true,
  glowColor,
  onClick,
}: PremiumCardProps) {
  const baseClasses = "rounded-2xl transition-all duration-300 overflow-hidden";

  const variantClasses: Record<Variant, string> = {
    default: "bg-[rgb(var(--bg-card))] border border-[rgb(var(--border))] shadow-soft",
    glass: "bg-[rgb(var(--bg-card))]/80 backdrop-blur-xl border border-[rgb(var(--border))] shadow-premium",
    premium: "bg-[rgb(var(--bg-card))] border border-[rgb(var(--border))] shadow-premium",
    gradient: "bg-gradient-card border border-[rgb(var(--border))] shadow-premium",
  };

  const hoverClasses = hover
    ? "hover:shadow-premium-lg hover:-translate-y-0.5 hover:border-[rgb(var(--border-strong))] cursor-pointer"
    : "";

  const padding = padded ? "p-5" : "";

  const glowClasses: Record<string, string> = {
    brand: "ring-1 ring-brand-500/10",
    success: "ring-1 ring-emerald-500/10",
    warning: "ring-1 ring-amber-500/10",
    danger: "ring-1 ring-rose-500/10",
  };
  const glowClass = glowColor ? glowClasses[glowColor] : "";

  return (
    <div
      onClick={onClick}
      className={cn(baseClasses, variantClasses[variant], hoverClasses, padding, glowClass, className)}
    >
      {children}
    </div>
  );
}
