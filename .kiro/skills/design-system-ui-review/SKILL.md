---
name: design-system-ui-review
description: Design and review polished, responsive interfaces using established design-system principles and Material Design 3 component guidance. Use for visual hierarchy, component selection, responsive behavior, interaction states, dashboard polish, spacing, typography, color, and motion.
---

# Design-System UI Review

Improve hierarchy and interaction quality without replacing a project's existing brand or component library. Treat the local design system as the source of truth; introduce new tokens only when an existing semantic token cannot express the need.

## Workflow

1. Establish the page's primary action, secondary actions, key status, and reading order.
2. Choose components by purpose: actions, communication, containment, navigation, selection, and text input.
3. Build hierarchy with typography, spacing, grouping, and alignment before adding color or elevation.
4. Use a consistent spacing rhythm, restrained radii/elevation, and semantic color roles.
5. Keep controls and state behavior consistent across default, hover, focus, active, disabled, loading, empty, and error states.
6. Adapt layouts by content priority rather than merely shrinking desktop columns. Keep primary actions visible and touch targets comfortable.
7. Use motion only to explain continuity or feedback; keep it brief and removable for reduced-motion users.
8. For operational dashboards, identify timeframe, freshness, units, data provenance, and unavailable data. Never present generated placeholders as live metrics.
9. Make data visualization readable without hover: persistent labels or legends, meaningful units, concise summaries, and a nonvisual representation.
10. Validate light/dark themes, RTL, narrow screens, long copy, empty data, and realistic dense data.

## Guardrails

- Reuse local primitives before creating new components.
- Do not make nonfunctional controls look actionable.
- Do not trade legibility for visual novelty.
- Avoid excessive gradients, shadows, animation, and competing accent colors.
- Prefer one coherent improvement over broad style churn.

Source: [Material Design 3 components](https://m3.material.io/components)

Content was rephrased for compliance with licensing restrictions.
