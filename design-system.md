# Connect-Hub Design System Reference

Single source of truth for every design token used by the Connect-Hub dashboard.
Tokens are declared once in [`src/index.css`](src/index.css) and consumed through Tailwind
utilities (see `tailwind.config.ts`) or `var(--token)` references. Changing a value at its
single definition propagates to every consumer with no per-component edit (Requirement 1.6).

This document satisfies Requirement 1.7: each token below is listed with its **name**, its
**resolved value** (both light and dark theme values are given where the token differs by
theme), and an **intended-usage** note.

## Conventions

- **Color values** are space-separated HSL channels (`H S% L%`) consumed as
  `hsl(var(--token))`. Some color tokens carry a baked-in alpha (`H S% L% / A`) and are
  consumed directly as `hsl(var(--token))`.
- **Theme-independent** tokens (typography, spacing, radius, motion, brand palette, chart,
  decorative glow) are defined once under `:root` and inherited unchanged by `.dark`.
- The **Light** column is the `:root` value; the **Dark** column is the `.dark` override.
  When the Dark column reads _(inherits)_ the token is theme-independent and resolves to the
  Light value in both themes.
- Typography **family** tokens are theme-independent but swap by writing direction: the
  Latin families apply in LTR, and Arabic-capable families apply under `:lang(ar)` / `[dir='rtl']`.

---

## Color — Semantic

Foreground/background pairings that drive surfaces, text, and controls. Each `*-foreground`
token is the accessible text color for its paired surface.

| Token                      | Light         | Dark          | Intended usage                                                           |
| -------------------------- | ------------- | ------------- | ------------------------------------------------------------------------ |
| `--background`             | `0 0% 98%`    | `220 55% 8%`  | App canvas / page background behind all content.                         |
| `--foreground`             | `220 45% 20%` | `0 0% 95%`    | Default body text color on `--background`.                               |
| `--card`                   | `0 0% 100%`   | `220 50% 12%` | Card and raised-surface background.                                      |
| `--card-foreground`        | `220 45% 20%` | `0 0% 95%`    | Text/icon color on card surfaces.                                        |
| `--popover`                | `0 0% 100%`   | `220 50% 12%` | Popover, dropdown, and tooltip background.                               |
| `--popover-foreground`     | `220 45% 20%` | `0 0% 95%`    | Text/icon color inside popovers.                                         |
| `--primary`                | `220 55% 25%` | `45 95% 55%`  | Primary brand surface for key actions (PIB Navy in light, Gold in dark). |
| `--primary-foreground`     | `0 0% 100%`   | `220 55% 15%` | Text/icon color on `--primary` surfaces.                                 |
| `--secondary`              | `220 30% 96%` | `220 45% 18%` | Secondary surface / low-emphasis button background.                      |
| `--secondary-foreground`   | `220 55% 25%` | `0 0% 95%`    | Text/icon color on `--secondary` surfaces.                               |
| `--muted`                  | `220 20% 94%` | `220 40% 20%` | Muted background for subtle fills, skeletons, scrollbar track.           |
| `--muted-foreground`       | `220 15% 45%` | `220 15% 60%` | De-emphasized text (captions, helper text, placeholders).                |
| `--accent`                 | `45 95% 50%`  | `45 90% 50%`  | Interactive accent (PIB Gold) for highlights and accents.                |
| `--accent-foreground`      | `220 55% 20%` | `220 55% 12%` | Text/icon color on `--accent` surfaces.                                  |
| `--destructive`            | `0 84% 60%`   | `0 70% 45%`   | Destructive action surface (delete, irreversible actions).               |
| `--destructive-foreground` | `0 0% 100%`   | `0 0% 100%`   | Text/icon color on `--destructive` surfaces.                             |
| `--border`                 | `220 20% 90%` | `220 40% 22%` | Default border/divider color for surfaces and inputs.                    |
| `--input`                  | `220 20% 90%` | `220 40% 22%` | Border color specifically for form input controls.                       |
| `--ring`                   | `220 55% 35%` | `45 90% 55%`  | Keyboard focus ring color (`:focus-visible` outline).                    |

## Color — Brand Palette (PIB Navy + Gold)

Theme-independent brand anchors. Semantic, sidebar, and chart tokens are derived from these.

| Token          | Light         | Dark         | Intended usage                                                                   |
| -------------- | ------------- | ------------ | -------------------------------------------------------------------------------- |
| `--navy`       | `220 55% 25%` | _(inherits)_ | Core PIB brand navy; base of navy gradients, elevation shadows, scrollbar thumb. |
| `--navy-light` | `220 45% 35%` | _(inherits)_ | Lighter navy tint for gradients and hover states.                                |
| `--navy-dark`  | `220 60% 18%` | _(inherits)_ | Darker navy shade for deep surfaces and contrast.                                |
| `--gold`       | `45 95% 50%`  | _(inherits)_ | Core PIB brand gold; base of gold gradients and glow.                            |
| `--gold-light` | `45 90% 60%`  | _(inherits)_ | Lighter gold tint for gradients and hover.                                       |
| `--gold-dark`  | `42 95% 42%`  | _(inherits)_ | Darker gold shade for contrast on light surfaces.                                |

## Color — Status

Each status color is paired with a documented non-color cue (Requirements 2.5, 3.5). Color is
never the sole carrier of meaning; the icon + text label below is rendered alongside the color
in every status indicator.

| Status  | Non-color cue (lucide icon) | Label key        |
| ------- | --------------------------- | ---------------- |
| success | `check-circle-2`            | `status.success` |
| warning | `alert-triangle`            | `status.warning` |
| info    | `info`                      | `status.info`    |
| error   | `x-circle`                  | `status.error`   |
| neutral | `circle`                    | `status.neutral` |

| Token                         | Light         | Dark          | Intended usage                               |
| ----------------------------- | ------------- | ------------- | -------------------------------------------- |
| `--status-success`            | `150 60% 40%` | `150 55% 50%` | Success state surface/indicator color.       |
| `--status-success-foreground` | `0 0% 100%`   | `220 55% 10%` | Text/icon color on success surfaces.         |
| `--status-warning`            | `35 95% 50%`  | `35 95% 58%`  | Warning state surface/indicator color.       |
| `--status-warning-foreground` | `220 55% 15%` | `220 55% 12%` | Text/icon color on warning surfaces.         |
| `--status-info`               | `200 80% 45%` | `200 80% 60%` | Informational state surface/indicator color. |
| `--status-info-foreground`    | `0 0% 100%`   | `220 55% 10%` | Text/icon color on info surfaces.            |
| `--status-error`              | `0 84% 55%`   | `0 75% 60%`   | Error state surface/indicator color.         |
| `--status-error-foreground`   | `0 0% 100%`   | `0 0% 100%`   | Text/icon color on error surfaces.           |
| `--status-neutral`            | `220 15% 55%` | `220 15% 65%` | Neutral/idle state surface/indicator color.  |
| `--status-neutral-foreground` | `0 0% 100%`   | `220 55% 10%` | Text/icon color on neutral surfaces.         |

## Color — Chart Series

Theme-independent series colors for data visualizations (Recharts).

| Token               | Light         | Dark         | Intended usage                      |
| ------------------- | ------------- | ------------ | ----------------------------------- |
| `--chart-primary`   | `220 55% 35%` | _(inherits)_ | Primary data series (navy-based).   |
| `--chart-secondary` | `45 95% 55%`  | _(inherits)_ | Secondary data series (gold-based). |
| `--chart-success`   | `150 60% 45%` | _(inherits)_ | Positive/success data series.       |
| `--chart-warning`   | `35 95% 55%`  | _(inherits)_ | Warning/attention data series.      |
| `--chart-info`      | `200 80% 55%` | _(inherits)_ | Informational data series.          |

## Color — Sidebar

Dedicated palette for the navigation sidebar, which uses a deep navy surface in both themes.

| Token                          | Light         | Dark          | Intended usage                                    |
| ------------------------------ | ------------- | ------------- | ------------------------------------------------- |
| `--sidebar-background`         | `220 55% 22%` | `220 55% 6%`  | Sidebar container background.                     |
| `--sidebar-foreground`         | `0 0% 95%`    | `0 0% 95%`    | Default sidebar text/icon color.                  |
| `--sidebar-primary`            | `45 95% 55%`  | `45 95% 55%`  | Active/primary sidebar item accent (gold).        |
| `--sidebar-primary-foreground` | `220 55% 18%` | `220 55% 10%` | Text/icon color on active sidebar item.           |
| `--sidebar-accent`             | `220 50% 30%` | `220 50% 15%` | Hover/selected sidebar item background.           |
| `--sidebar-accent-foreground`  | `0 0% 100%`   | `0 0% 100%`   | Text/icon color on hovered/selected sidebar item. |
| `--sidebar-border`             | `220 50% 30%` | `220 50% 15%` | Sidebar dividers and borders.                     |
| `--sidebar-ring`               | `45 95% 55%`  | `45 95% 55%`  | Focus ring color within the sidebar.              |

## Color — Decorative Surfaces (opt-in only)

Glass/glow surfaces are decorative and excluded from text-bearing surfaces so they cannot
reduce text contrast (Requirements 2.7, 3.4). Values carry a baked-in alpha and are consumed
as `hsl(var(--token))`.

| Token            | Light             | Dark                | Intended usage                                                    |
| ---------------- | ----------------- | ------------------- | ----------------------------------------------------------------- |
| `--glass`        | `0 0% 100% / 0.7` | `220 50% 12% / 0.7` | Translucent glass panel background (`.glass`); never behind text. |
| `--glass-border` | `0 0% 100% / 0.3` | `0 0% 100% / 0.08`  | Border for glass panels.                                          |

---

## Typography — Font Families

Theme-independent, but swapped by writing direction so the Arabic-first UI renders in real
banking typefaces (Requirements 2.5, 2.6).

| Token            | LTR (default)          | RTL / `:lang(ar)`                             | Intended usage           |
| ---------------- | ---------------------- | --------------------------------------------- | ------------------------ |
| `--font-display` | `'Outfit', sans-serif` | `'Cairo', 'IBM Plex Sans Arabic', sans-serif` | Large display/hero text. |
| `--font-heading` | `'Outfit', sans-serif` | `'Cairo', 'IBM Plex Sans Arabic', sans-serif` | Headings `h1`–`h6`.      |
| `--font-body`    | `'Inter', sans-serif`  | `'IBM Plex Sans Arabic', 'Inter', sans-serif` | Body and UI text.        |

## Typography — Scale

At least 6 named levels (Requirement 1.4). Each level defines size (rem, so it scales with the
user's root font size), line-height, and weight. Theme-independent.

| Level    | Size token             | Size               | Line token             | Line   | Weight token             | Weight | Intended usage                          |
| -------- | ---------------------- | ------------------ | ---------------------- | ------ | ------------------------ | ------ | --------------------------------------- |
| display  | `--text-display-size`  | `3rem` (48px)      | `--text-display-line`  | `1.1`  | `--text-display-weight`  | `800`  | Hero/marketing display text.            |
| h1       | `--text-h1-size`       | `2.25rem` (36px)   | `--text-h1-line`       | `1.2`  | `--text-h1-weight`       | `700`  | Page title (top-level heading).         |
| h2       | `--text-h2-size`       | `1.75rem` (28px)   | `--text-h2-line`       | `1.25` | `--text-h2-weight`       | `700`  | Section heading.                        |
| h3       | `--text-h3-size`       | `1.375rem` (22px)  | `--text-h3-line`       | `1.3`  | `--text-h3-weight`       | `600`  | Subsection heading / card title.        |
| body     | `--text-body-size`     | `1rem` (16px)      | `--text-body-line`     | `1.5`  | `--text-body-weight`     | `400`  | Default body copy.                      |
| body-sm  | `--text-body-sm-size`  | `0.875rem` (14px)  | `--text-body-sm-line`  | `1.5`  | `--text-body-sm-weight`  | `400`  | Secondary/dense body copy.              |
| caption  | `--text-caption-size`  | `0.75rem` (12px)   | `--text-caption-line`  | `1.4`  | `--text-caption-weight`  | `400`  | Captions, helper text, metadata.        |
| overline | `--text-overline-size` | `0.6875rem` (11px) | `--text-overline-line` | `1.3`  | `--text-overline-weight` | `600`  | Eyebrow/overline labels above headings. |

---

## Spacing Scale

A single 4px base unit; every step is an integer multiple of the base (Requirement 1.5).
Applied to both typographic rhythm and layout gaps. Theme-independent.

| Token          | Value            | Multiple | Intended usage                                |
| -------------- | ---------------- | -------- | --------------------------------------------- |
| `--space-unit` | `0.25rem` (4px)  | 1x base  | Base unit all steps derive from.              |
| `--space-1`    | `0.25rem` (4px)  | 1x       | Hairline gaps, tight icon padding.            |
| `--space-2`    | `0.5rem` (8px)   | 2x       | Compact gaps between related elements.        |
| `--space-3`    | `0.75rem` (12px) | 3x       | Small component padding.                      |
| `--space-4`    | `1rem` (16px)    | 4x       | Default control/content padding.              |
| `--space-5`    | `1.25rem` (20px) | 5x       | Comfortable element spacing.                  |
| `--space-6`    | `1.5rem` (24px)  | 6x       | Card padding / section inner spacing.         |
| `--space-7`    | `1.75rem` (28px) | 7x       | Larger inter-element spacing.                 |
| `--space-8`    | `2rem` (32px)    | 8x       | Section spacing.                              |
| `--space-9`    | `2.25rem` (36px) | 9x       | Large section spacing.                        |
| `--space-10`   | `2.5rem` (40px)  | 10x      | Page-block separation.                        |
| `--space-11`   | `2.75rem` (44px) | 11x      | Touch-target sizing reference (44px minimum). |
| `--space-12`   | `3rem` (48px)    | 12x      | Major layout gutters / page padding.          |

---

## Radius

Corner radii derived from a single `--radius` base. Theme-independent.

| Token           | Value                                | Intended usage                                  |
| --------------- | ------------------------------------ | ----------------------------------------------- |
| `--radius`      | `0.75rem` (12px)                     | Base radius all others derive from.             |
| `--radius-lg`   | `var(--radius)` → `0.75rem`          | Large radius for cards and large surfaces.      |
| `--radius-md`   | `calc(var(--radius) - 2px)` → `10px` | Medium radius for buttons and inputs.           |
| `--radius-sm`   | `calc(var(--radius) - 4px)` → `8px`  | Small radius for chips, focus ring, scrollbar.  |
| `--radius-full` | `9999px`                             | Pill/circular shapes (avatars, badges, thumbs). |

---

## Elevation

Named, non-decorative shadows for surfaces that may bear text; glow tokens are decorative and
opt-in only. Shadows are tuned per theme (deeper on dark surfaces).

| Token                  | Light                                | Dark                             | Intended usage                                                               |
| ---------------------- | ------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------- |
| `--elevation-card`     | `0 2px 12px hsl(var(--navy) / 0.06)` | `0 2px 12px hsl(0 0% 0% / 0.4)`  | Resting elevation for cards.                                                 |
| `--elevation-soft`     | `0 4px 20px hsl(var(--navy) / 0.08)` | `0 4px 20px hsl(0 0% 0% / 0.45)` | Soft elevation for raised panels/menus.                                      |
| `--elevation-elevated` | `0 8px 30px hsl(var(--navy) / 0.12)` | `0 8px 30px hsl(0 0% 0% / 0.55)` | High elevation for dialogs/popovers.                                         |
| `--elevation-glow`     | `0 0 20px hsl(var(--gold) / 0.3)`    | _(inherits)_                     | Decorative gold glow (`.glow-gold`); opt-in, never on text-bearing surfaces. |
| `--elevation-glow-lg`  | `0 0 40px hsl(var(--gold) / 0.4)`    | _(inherits)_                     | Decorative large gold glow; opt-in, never on text-bearing surfaces.          |

---

## Motion

Bounded named durations (100–500ms) plus standard easing curves (Requirement 9.4). Consumed by
all shared-component transitions; reduced-motion neutralizes them to ~0ms. Theme-independent.

| Token               | Value                          | Intended usage                                           |
| ------------------- | ------------------------------ | -------------------------------------------------------- |
| `--motion-fast`     | `120ms`                        | Quick micro-interactions (hover, small toggles).         |
| `--motion-base`     | `240ms`                        | Default transition duration for most state changes.      |
| `--motion-slow`     | `400ms`                        | Larger transitions (panels, sheets, page-level reveals). |
| `--motion-ease`     | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard easing for symmetric enter/exit transitions.    |
| `--motion-ease-in`  | `cubic-bezier(0.4, 0, 1, 1)`   | Accelerating easing for exit/dismiss transitions.        |
| `--motion-ease-out` | `cubic-bezier(0, 0, 0.2, 1)`   | Decelerating easing for enter/appear transitions.        |

---

## Touch-Target Utilities

Reusable utility classes that guarantee a 44x44 CSS px activation area for interactive
controls at every reference breakpoint and >=8px separation between adjacent sub-44px
controls (Requirements 6.1, 6.2, 6.4, 7.6). Defined in [`src/index.css`](src/index.css)
and backed by the spacing scale (`--space-11` = 44px, `--space-2` = 8px). The class names
and numeric thresholds are mirrored as constants/helpers in
[`src/lib/touch-target.ts`](src/lib/touch-target.ts) so components and tests share one
source of truth.

| Utility             | Backing token       | Intended usage                                                                                                                                                                                                           |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.touch-target`     | `--space-11` (44px) | Grows the control's own box to a 44x44 minimum via `min-width`/`min-height`. Use when enlarging the visible control is acceptable (standalone buttons, menu items, links, inputs).                                       |
| `.touch-target-hit` | `--space-11` (44px) | Extends only the _activation_ area to 44x44 via a centered, transparent `::after` pseudo-element, leaving the visible box unchanged (Requirement 6.4). Use for small icon-only controls that must stay visually compact. |
| `.touch-gap`        | `--space-2` (8px)   | Applied to the flex/grid container of adjacent controls to guarantee >=8px separation so sub-44px hit areas never overlap (Requirement 6.2).                                                                             |
