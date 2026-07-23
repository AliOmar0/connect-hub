---
name: wcag-accessibility-review
description: Audit and improve web interfaces for WCAG 2.2 accessibility. Use for UI implementation, accessibility reviews, forms, navigation, data visualizations, interaction states, responsive layouts, or when users mention a11y, keyboard use, screen readers, focus, contrast, or inclusive design.
---

# WCAG Accessibility Review

Apply WCAG 2.2 through its four principles: perceivable, operable, understandable, and robust. Preserve the project's components and tokens unless they prevent compliance.

## Workflow

1. Identify the page purpose, primary task, information hierarchy, and critical interactions.
2. Prefer native semantic HTML and a logical heading/landmark structure; use ARIA only where native semantics are insufficient.
3. Verify every action is keyboard reachable, has an obvious accessible name, exposes state, and receives a visible focus indicator.
4. Provide text alternatives for meaningful visuals. Give charts a concise nonvisual summary or data table.
5. Never communicate meaning by color alone. Pair status color with text, iconography, pattern, or another persistent cue.
6. Maintain readable contrast, text resizing, reflow, zoom, and touch targets. Prevent horizontal scrolling at narrow widths except where the content requires it.
7. Make loading, empty, success, and error states explicit. Announce consequential async changes and provide recovery actions for failures.
8. Keep motion restrained and honor `prefers-reduced-motion`.
9. Validate with automated checks, then reason through keyboard order, focus movement, labels, error identification, zoom/reflow, and screen-reader output.

## Delivery checklist

- One clear page-level heading and meaningful landmarks
- Labels and instructions remain available after input
- Icon-only controls have accessible names
- Focus is visible and follows the visual/task order
- Status and chart meaning do not depend on color or hover
- Async states are distinguishable and recoverable
- Layout works at mobile width, 200% zoom, RTL, and dark mode where supported

Source: [W3C WCAG documentation](https://www.w3.org/WAI/standards-guidelines/wcag/docs/)

Content was rephrased for compliance with licensing restrictions.
