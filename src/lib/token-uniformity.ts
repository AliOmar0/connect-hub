// Cross-page token uniformity registry and resolution helpers
// (Requirement 24.1–24.4; Property 36).
//
// The design achieves visual/behavioral consistency by rendering every control
// type (primary button, input, card, table, dialog, badge) and every heading
// level through a single Shared_Component whose styling references a *canonical*
// set of design tokens. Because the token references come from one source — the
// registries below — a control type resolves to identical color, typography, and
// spacing values on every Page under a given Theme, and layout-region gaps are
// always drawn from the 4px spacing scale.
//
// This module is intentionally framework-free and IO-free: it models the
// canonical token references and the (page-agnostic) rendering path so the
// property test can quantify uniformity over generated pages/controls/themes
// without a DOM. The concrete token *values* are supplied by the caller/test as
// a TokenMap (parsed from src/index.css), and references are resolved with the
// shared `resolveToken` helper.

import { resolveToken, type TokenMap } from "./tokens";

/** The control types whose styling must be uniform across all Pages (24.2). */
export const CONTROL_TYPES = [
  "primaryButton",
  "input",
  "card",
  "table",
  "dialog",
  "badge",
] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

/** Heading levels governed by the shared typography scale (24.1). */
export const HEADING_LEVELS = ["h1", "h2", "h3"] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Every top-level routed Page (per the requirements glossary). */
export const PAGE_IDS = [
  "AnalyticsPage",
  "AuthPage",
  "EmployeesPage",
  "Index",
  "KnowledgePage",
  "NotificationsPage",
  "QueuePage",
  "SessionsPage",
  "SettingsPage",
  "ShortcutsPage",
  "NotFound",
  "BackendTester",
  "VapiDemo",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** The token references a control type uses for color, typography, and spacing. */
export interface ControlTokenRefs {
  /** Primary surface color token (e.g. background). */
  color: string;
  /** Foreground/text color token paired with {@link color}. */
  foreground: string;
  /** Font-size typography token. */
  typography: string;
  /** Internal padding/spacing token, drawn from the spacing scale. */
  spacing: string;
}

/**
 * The single canonical token reference set per control type. Shared_Components
 * consume these so a control renders identically on every Page (Requirement
 * 24.2). Color tokens are theme-aware (their *values* differ per Theme) while
 * typography and spacing tokens are theme-independent.
 */
export const CANONICAL_CONTROL_TOKENS: Record<ControlType, ControlTokenRefs> = {
  primaryButton: {
    color: "--primary",
    foreground: "--primary-foreground",
    typography: "--text-body-sm-size",
    spacing: "--space-3",
  },
  input: {
    color: "--input",
    foreground: "--foreground",
    typography: "--text-body-size",
    spacing: "--space-3",
  },
  card: {
    color: "--card",
    foreground: "--card-foreground",
    typography: "--text-body-size",
    spacing: "--space-6",
  },
  table: {
    color: "--card",
    foreground: "--card-foreground",
    typography: "--text-body-sm-size",
    spacing: "--space-4",
  },
  dialog: {
    color: "--popover",
    foreground: "--popover-foreground",
    typography: "--text-body-size",
    spacing: "--space-6",
  },
  badge: {
    color: "--primary",
    foreground: "--primary-foreground",
    typography: "--text-caption-size",
    spacing: "--space-2",
  },
};

/** The typography token triple (size/line-height/weight) for a heading level. */
export interface HeadingTypographyRefs {
  size: string;
  line: string;
  weight: string;
}

/**
 * The canonical typography scale per heading level (Requirement 24.1). Headings
 * of the same level share these tokens on every Page.
 */
export const CANONICAL_HEADING_TYPOGRAPHY: Record<
  HeadingLevel,
  HeadingTypographyRefs
> = {
  h1: {
    size: "--text-h1-size",
    line: "--text-h1-line",
    weight: "--text-h1-weight",
  },
  h2: {
    size: "--text-h2-size",
    line: "--text-h2-line",
    weight: "--text-h2-weight",
  },
  h3: {
    size: "--text-h3-size",
    line: "--text-h3-line",
    weight: "--text-h3-weight",
  },
};

/** The numbered spacing-scale tokens (`--space-1` … `--space-12`). */
export const SPACING_SCALE_TOKENS = Array.from(
  { length: 12 },
  (_, i) => `--space-${i + 1}`,
) as readonly string[];

/** The canonical token references for gaps between layout regions (24.3). */
export const CANONICAL_LAYOUT_REGION_GAPS = [
  "--space-4",
  "--space-6",
  "--space-8",
] as const;

/**
 * Per-page style overrides. Uniformity (Property 36) requires this to remain
 * empty: a Page must reuse the canonical Shared_Component token references
 * rather than diverge (Requirement 24.5). Kept here so the rendering path can
 * apply overrides if one were ever introduced — which the property test would
 * then catch as a uniformity violation.
 */
export const PAGE_STYLE_OVERRIDES: Partial<
  Record<PageId, Partial<Record<ControlType, Partial<ControlTokenRefs>>>>
> = {};

/**
 * Normalize a token reference to its bare `--name` form for spacing-scale
 * membership checks. Accepts `--name` and `var(--name)`.
 */
function bareTokenName(ref: string): string {
  const varMatch = /^var\(\s*(--[^,\s)]+)/i.exec(ref.trim());
  if (varMatch) return varMatch[1];
  return ref.trim();
}

/** Whether a token reference names one of the 4px spacing-scale steps. */
export function isSpacingScaleToken(ref: string): boolean {
  return SPACING_SCALE_TOKENS.includes(bareTokenName(ref));
}

/**
 * The token references a Page actually renders for a control type. The shared
 * component derives them from the canonical registry, ignoring page identity;
 * any per-page override (see {@link PAGE_STYLE_OVERRIDES}) is layered on top.
 */
export function renderedControlRefs(
  page: PageId,
  controlType: ControlType,
): ControlTokenRefs {
  const base = CANONICAL_CONTROL_TOKENS[controlType];
  const override = PAGE_STYLE_OVERRIDES[page]?.[controlType];
  return override ? { ...base, ...override } : { ...base };
}

/** The layout-region gap tokens a Page renders (uniform, spacing-scale based). */
export function renderedLayoutRegionGaps(_page: PageId): readonly string[] {
  return CANONICAL_LAYOUT_REGION_GAPS;
}

/** A control's resolved (concrete) token values under a Theme's TokenMap. */
export interface ResolvedControlTokens {
  color: string | undefined;
  foreground: string | undefined;
  typography: string | undefined;
  spacing: string | undefined;
}

/** Resolve a control's token references to concrete values for a Theme. */
export function resolveControlTokens(
  refs: ControlTokenRefs,
  tokens: TokenMap,
): ResolvedControlTokens {
  return {
    color: resolveToken({ tokenRef: refs.color }, tokens),
    foreground: resolveToken({ tokenRef: refs.foreground }, tokens),
    typography: resolveToken({ tokenRef: refs.typography }, tokens),
    spacing: resolveToken({ tokenRef: refs.spacing }, tokens),
  };
}

/** Resolve a heading level's typography references to concrete values. */
export function resolveHeadingTypography(
  refs: HeadingTypographyRefs,
  tokens: TokenMap,
): { size?: string; line?: string; weight?: string } {
  return {
    size: resolveToken({ tokenRef: refs.size }, tokens),
    line: resolveToken({ tokenRef: refs.line }, tokens),
    weight: resolveToken({ tokenRef: refs.weight }, tokens),
  };
}
