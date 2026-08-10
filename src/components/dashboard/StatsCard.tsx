import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  variant?:
    | "default"
    | "gold"
    | "navy"
    | "success"
    | "warning"
    | "info"
    | "purple";
  className?: string;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  subtitle,
  variant = "default",
  className,
}: StatsCardProps) {
  const variants = {
    default: {
      card: "bg-card",
      icon: "bg-primary/10 text-primary",
      iconGlow: "shadow-[0_0_20px_hsl(var(--primary)/0.18)]",
    },
    navy: {
      card: "bg-card",
      icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      iconGlow: "shadow-[0_0_20px_rgba(59,130,246,0.18)]",
    },
    gold: {
      card: "bg-card",
      icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      iconGlow: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
    },
    success: {
      card: "bg-card",
      icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      iconGlow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
    },
    warning: {
      card: "bg-card",
      icon: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
      iconGlow: "shadow-[0_0_20px_rgba(249,115,22,0.2)]",
    },
    info: {
      card: "bg-card",
      icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      iconGlow: "shadow-[0_0_20px_rgba(14,165,233,0.2)]",
    },
    purple: {
      card: "bg-card",
      icon: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      iconGlow: "shadow-[0_0_20px_rgba(168,85,247,0.2)]",
    },
  };

  const style = variants[variant] || variants.default;

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border p-5 shadow-card transition-all duration-300 hover:shadow-elevated fade-in-up flex flex-col justify-between h-full min-h-[135px]",
        style.card,
        className,
      )}
    >
      {/* Header section with fixed title area height so values always align horizontally */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-h-[2.5rem] flex items-center pr-1">
          <p className="text-xs sm:text-sm font-semibold text-muted-foreground leading-tight line-clamp-2">
            {title}
          </p>
        </div>
        <div
          className={cn(
            "p-2.5 sm:p-3 rounded-xl transition-all duration-300 shrink-0",
            style.icon,
            style.iconGlow,
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>

      {/* Value & trend section aligned to bottom */}
      <div className="mt-3 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-2xl sm:text-3xl font-bold font-display tracking-tight animate-count-up">
            {value}
          </h3>
          {trend && (
            <div
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(trend.value).toFixed(2)}%
            </div>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground/80 font-medium">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Loading placeholder for a {@link StatsCard}. It reproduces the card's
 * footprint — the same radius, border, padding, and elevation tokens — so the
 * layout does not shift when the real metric resolves (Requirement 12.2).
 */
export function StatsCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card h-full min-h-[135px] flex flex-col justify-between",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-h-[2.5rem] flex items-center">
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl shrink-0" />
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-7 sm:h-8 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
