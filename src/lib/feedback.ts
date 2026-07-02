// Standardized user-feedback helper.
//
// This module is the single entry point for transient success and error
// confirmations across the Dashboard. Every page and shared component routes
// its confirmations through these helpers so the same condition always
// produces the same feedback mechanism (a `sonner` toast, mounted once in
// `App.tsx`). Centralizing here means we never mix `sonner` with the ad-hoc
// `use-toast`/Radix toaster for the same purpose, keeping feedback consistent.
//
// The toast is shown synchronously when the helper is called, so a success
// confirmation appears well within the 500ms window required after an async
// operation completes.
//
// Callers pass text that is already internationalized (matching the
// EmptyState/ErrorState convention where the caller owns translation), keeping
// this module i18n-agnostic and easy to unit test.
//
// Requirements: 10.3 (success confirmation via the consistent feedback
// mechanism) and Property 25 (feedback consistency across pages).
import { toast } from "sonner";

/**
 * Options accepted by the feedback helpers. This is intentionally a small,
 * mechanism-agnostic subset of the underlying toast options so call sites do
 * not couple to `sonner` internals; unknown fields are simply forwarded.
 */
export interface FeedbackOptions {
  /** Optional supporting line rendered beneath the main message. */
  description?: string;
  /** Milliseconds the toast remains visible before auto-dismissing. */
  duration?: number;
  /**
   * Stable identifier. Reusing an id updates an existing toast in place instead
   * of stacking a duplicate (useful for the same operation firing twice).
   */
  id?: string | number;
  /** Optional recovery/next-step action shown as a button on the toast. */
  action?: { label: string; onClick: () => void };
}

/** The id type returned by the underlying toast mechanism. */
export type FeedbackId = string | number;

/**
 * Confirm that an operation succeeded.
 *
 * Use this for every success confirmation (Requirement 10.3) so confirmations
 * are visually and behaviourally identical everywhere.
 *
 * @param message Already-internationalized confirmation text.
 * @param options Optional description, duration, id, or recovery action.
 * @returns The toast id, allowing the caller to dismiss/update it later.
 */
export function notifySuccess(
  message: string,
  options?: FeedbackOptions,
): FeedbackId {
  return toast.success(message, options);
}

/**
 * Report that an operation failed.
 *
 * Routed through the same shared mechanism as {@link notifySuccess} so error
 * feedback is consistent across pages.
 *
 * @param message Already-internationalized failure text.
 * @param options Optional description, duration, id, or recovery action.
 * @returns The toast id, allowing the caller to dismiss/update it later.
 */
export function notifyError(
  message: string,
  options?: FeedbackOptions,
): FeedbackId {
  return toast.error(message, options);
}

/**
 * Dismiss a previously shown toast (or all toasts when no id is given).
 * Exposed so callers never reach for the raw toast library directly.
 */
export function dismissFeedback(id?: FeedbackId): void {
  toast.dismiss(id);
}
