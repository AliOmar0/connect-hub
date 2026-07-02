import * as React from "react";
import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/ui/error-state";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Optional override for the fallback UI. When omitted, a token-styled
   * {@link ErrorState} with a recovery action is rendered.
   */
  fallback?: (reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Token-styled fallback shown by {@link ErrorBoundary} when the routed area
 * throws during render. Consumes the shared {@link ErrorState} so the same
 * human-readable failure + recovery-action pattern used across the Dashboard
 * also covers unexpected render errors (Requirement 10.4). Kept as a separate
 * function component so it can use `useTranslation` (hooks are unavailable in
 * the class-based boundary itself).
 */
function ErrorBoundaryFallback({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <ErrorState
        title={t("feedback.boundaryTitle")}
        description={t("feedback.boundaryDescription")}
        onRetry={onReset}
        retryLabel={t("feedback.reload")}
        className="w-full max-w-md"
      />
    </div>
  );
}

/**
 * Top-level React error boundary that wraps the routed area of the application.
 * When a descendant throws during render, it presents a token-styled
 * {@link ErrorState} with a recovery action instead of unmounting the whole
 * tree (Requirement 10.4).
 *
 * This is a purely presentational safety net: it does not alter route-level
 * access control (`ProtectedRoute`, `RoleBasedRedirect`) or any backend
 * behavior. The recovery action resets the boundary and, as a robust fallback
 * for persistent render failures, reloads the document.
 */
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface the failure for diagnostics without leaking it to the UI.
    console.error("Unhandled application error:", error, info.componentStack);
  }

  handleReset(): void {
    this.setState({ hasError: false });
    // A top-level render failure is frequently non-transient, so reload the
    // document to recover a clean state after clearing the boundary.
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.handleReset);
      }
      return <ErrorBoundaryFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
export { ErrorBoundaryFallback };
