import * as React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short, human-readable heading describing the failure. */
  title: string;
  /** Human-readable description of what failed (Requirement 10.4). */
  description?: string;
  /**
   * Recovery action invoked when the user activates the retry control
   * (Requirement 10.4 requires at least one recovery action).
   */
  onRetry?: () => void;
  /**
   * Label for the retry control. Falls back to the internationalized default
   * (`feedback.retry`, English fallback "Retry") when omitted.
   */
  retryLabel?: string;
  /** Optional icon override. Defaults to a warning triangle. Hidden from AT. */
  icon?: React.ReactNode;
}

/**
 * Standard, token-styled Error_State shown when a data view fails to load or an
 * operation fails. It presents a human-readable failure description and a
 * recovery action (Requirement 10.4).
 *
 * All color, spacing, radius, and typography come from design tokens via
 * Tailwind utilities. The container carries `role="alert"` so the failure is
 * announced to assistive technology; the icon is decorative and hidden. The
 * retry label defaults through i18n with an English fallback, keeping the
 * component i18n-friendly while letting callers override per context.
 *
 * Requirements: 10.4, 10.7
 */
const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    { title, description, onRetry, retryLabel, icon, className, ...props },
    ref,
  ) => {
    const { t } = useTranslation();
    const label = retryLabel ?? t("feedback.retry");

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-card px-6 py-12 text-center",
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className="text-destructive [&_svg]:h-10 [&_svg]:w-10"
        >
          {icon ?? <AlertTriangle />}
        </div>
        <p className="text-lg font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" className="mt-2" onClick={onRetry}>
            {label}
          </Button>
        ) : null}
      </div>
    );
  },
);
ErrorState.displayName = "ErrorState";

export { ErrorState };
