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
  variant?: "default" | "gold" | "navy" | "success" | "warning";
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
      icon: "bg-secondary text-primary",
      iconGlow: "",
    },
    gold: {
      card: "bg-card",
      icon: "bg-gold/10 text-gold",
      iconGlow: "shadow-[0_0_20px_hsl(var(--gold)/0.2)]",
    },
    navy: {
      card: "bg-card",
      icon: "bg-navy/10 text-navy",
      iconGlow: "shadow-[0_0_20px_hsl(var(--navy)/0.15)]",
    },
    success: {
      card: "bg-card",
      icon: "bg-chart-success/10 text-chart-success",
      iconGlow: "shadow-[0_0_20px_hsl(var(--chart-success)/0.2)]",
    },
    warning: {
      card: "bg-card",
      icon: "bg-chart-warning/10 text-chart-warning",
      iconGlow: "shadow-[0_0_20px_hsl(var(--chart-warning)/0.2)]",
    },
  };

  const style = variants[variant];

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border p-5 shadow-card transition-all duration-300 hover:shadow-elevated fade-in-up",
        style.card,
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold font-display tracking-tight animate-count-up">
              {value}
            </h3>
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
                  trend.isPositive
                    ? "bg-chart-success/10 text-chart-success"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {trend.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "p-3 rounded-xl transition-all duration-300",
            style.icon,
            style.iconGlow,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
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
        "relative rounded-xl border border-border bg-card p-5 shadow-card",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-11 w-11 rounded-xl" />
      </div>
    </div>
  );
}
