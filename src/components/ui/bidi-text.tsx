import * as React from "react";

import { cn } from "@/lib/utils";
import { isolateLtr } from "@/lib/i18n-helpers";

export interface BidiTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * The embedded LTR value to render (e.g. masked card number, IBAN, phone
   * number, or keyboard shortcut combo).
   */
  value: string;
  /**
   * Direction of the embedded content. Defaults to "ltr" since this wrapper
   * exists to keep LTR content readable inside an RTL context.
   */
  dir?: "ltr" | "rtl";
}

/**
 * Renders an embedded LTR value inside Unicode left-to-right isolates so its
 * characters keep their original order when displayed within an RTL layout.
 *
 * The value is wrapped via {@link isolateLtr} and the span carries an explicit
 * `dir` attribute, giving both the bidi algorithm and the rendering engine the
 * information needed to avoid reordering masked numbers, IBANs, phone numbers,
 * and keyboard shortcut combos.
 *
 * Requirements: 8.8, 14.4, 21.4
 */
const BidiText = React.forwardRef<HTMLSpanElement, BidiTextProps>(
  ({ value, dir = "ltr", className, ...props }, ref) => (
    <span
      ref={ref}
      dir={dir}
      className={cn("inline-block", className)}
      {...props}
    >
      {isolateLtr(value)}
    </span>
  ),
);
BidiText.displayName = "BidiText";

export { BidiText };
