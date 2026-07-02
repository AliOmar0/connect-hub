import * as React from "react";

import { cn } from "@/lib/utils";

// Token-driven interactive states (Requirements 10.1, 1.2, 3.6, 3.7, 4.2).
// default: `border-input`; hover: stronger border; focus-visible: `--ring`
// ring offset against the background for 3:1 contrast; error: `--destructive`
// border/ring driven by `aria-invalid`; disabled: reduced opacity + no pointer.
// Transitions use the bounded `duration-fast` motion token, not a literal.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors duration-fast file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
