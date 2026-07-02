// Presentation-only types for the UI/UX redesign shell and pattern layers.
//
// These types describe *how* data views and the App_Shell present themselves;
// they introduce no backend or domain models. Domain entities and the `Role`
// union continue to live in `src/types/database.ts` and are imported unchanged.
//
// See design.md → "Data Models".

/** Active presentation mode for the class-strategy theme. */
export type Theme = "light" | "dark";

/** Document reading/layout direction derived from the active language. */
export type Direction = "ltr" | "rtl";

/** The four reference breakpoints the App_Shell adapts across (CSS pixels). */
export type Breakpoint = 375 | 768 | 1024 | 1440;

/**
 * Lifecycle status of an asynchronous data view. Drives {@link AsyncBoundary}
 * and the shared feedback patterns (Skeleton / EmptyState / ErrorState).
 *
 * - `idle`    — no request has started yet.
 * - `loading` — a request is in flight; show a Skeleton placeholder.
 * - `loaded`  — data is available; render the content.
 * - `empty`   — the request resolved with zero records; show an EmptyState.
 * - `error`   — the request failed; show an ErrorState with a recovery action.
 */
export type ViewStatus = "idle" | "loading" | "loaded" | "empty" | "error";

/** Discriminated view state carrying data or a recoverable error. */
export interface AsyncViewState<T> {
  status: ViewStatus;
  data?: T;
  error?: { message: string; recoverable: boolean };
}

/** Visual condition of an interactive component (used by state tests). */
export type ComponentState =
  | "default"
  | "hover"
  | "focus"
  | "active"
  | "disabled"
  | "loading"
  | "error"
  | "selected";
