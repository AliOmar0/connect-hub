import * as React from "react";
import { useTranslation } from "react-i18next";

import type { ViewStatus } from "@/types/presentation";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LiveRegion } from "@/components/ui/live-region";

export interface AsyncBoundaryProps {
  /** Lifecycle status of the wrapped data view. */
  status: ViewStatus;
  /**
   * Applied to the wrapping div. Needed whenever the resolved content relies
   * on a height/flex chain from its parent (e.g. an internally-scrolling
   * list) -- without it this wrapper is a plain block that only takes its
   * content's natural height, breaking that chain.
   */
  className?: string;
  /**
   * Loading placeholder rendered while `status === "loading"`. Callers supply
   * a Skeleton (or equivalent) sized to the eventual content's footprint.
   */
  skeleton: React.ReactNode;
  /** The resolved content, rendered when `status === "loaded"`. */
  children: React.ReactNode;
  /**
   * Recovery action wired to the ErrorState retry control when
   * `status === "error"` (Requirement 10.4).
   */
  onRetry?: () => void;

  // --- EmptyState customization (all optional; i18n defaults otherwise) ---
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyIcon?: React.ReactNode;

  // --- ErrorState customization (all optional; i18n defaults otherwise) ---
  errorTitle?: string;
  errorDescription?: string;
  retryLabel?: string;

  /**
   * Optional overrides for the text announced to assistive technology on each
   * transition. Missing entries fall back to internationalized defaults.
   */
  announcements?: Partial<Record<ViewStatus, string>>;
}

/**
 * Wraps a data view and renders a single, consistent presentation for each
 * {@link ViewStatus}: a Skeleton while loading, an {@link EmptyState} when
 * there are no records, an {@link ErrorState} (with a recovery action) on
 * failure, and the resolved `children` once loaded. `idle` renders nothing.
 *
 * Because every page routes its async views through this one component, the
 * same condition yields the same feedback mechanism everywhere (Requirement
 * 10.8). The loading placeholder satisfies Requirement 10.6.
 *
 * Every transition between loading / loaded / empty / error is announced to
 * assistive technology through an embedded {@link LiveRegion} (Requirement
 * 5.4). Announcement text defaults to internationalized strings (English
 * fallback) and can be overridden per status via `announcements`. The error
 * transition is announced assertively so failures are surfaced promptly.
 *
 * Requirements: 5.4, 10.6, 10.8
 */
const AsyncBoundary = React.forwardRef<HTMLDivElement, AsyncBoundaryProps>(
  (
    {
      status,
      className,
      skeleton,
      children,
      onRetry,
      emptyTitle,
      emptyDescription,
      emptyAction,
      emptyIcon,
      errorTitle,
      errorDescription,
      retryLabel,
      announcements,
    },
    ref,
  ) => {
    const { t } = useTranslation();

    // Resolve the message announced to AT for the current status. `idle`
    // carries no announcement (nothing has happened yet).
    const announcement =
      status === "idle"
        ? ""
        : (announcements?.[status] ?? t(`feedback.status.${status}`));

    // Errors are announced assertively via an alert; other transitions use a
    // polite status region so they don't interrupt the user.
    const politeness = status === "error" ? "assertive" : "polite";
    const liveRole = status === "error" ? "alert" : "status";

    let content: React.ReactNode = null;
    switch (status) {
      case "loading":
        content = skeleton;
        break;
      case "empty":
        content = (
          <EmptyState
            title={emptyTitle ?? t("feedback.emptyTitle")}
            description={emptyDescription ?? t("feedback.emptyDescription")}
            action={emptyAction}
            icon={emptyIcon}
          />
        );
        break;
      case "error":
        content = (
          <ErrorState
            title={errorTitle ?? t("feedback.errorTitle")}
            description={errorDescription ?? t("feedback.errorDescription")}
            onRetry={onRetry}
            retryLabel={retryLabel}
          />
        );
        break;
      case "loaded":
        content = children;
        break;
      case "idle":
      default:
        content = null;
        break;
    }

    return (
      <div ref={ref} className={className}>
        <LiveRegion
          message={announcement}
          politeness={politeness}
          role={liveRole}
        />
        {content}
      </div>
    );
  },
);
AsyncBoundary.displayName = "AsyncBoundary";

export { AsyncBoundary };
