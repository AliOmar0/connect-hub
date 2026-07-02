import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

// Token-driven interactive states (Requirements 10.1, 1.2, 3.6, 3.7, 4.2).
// Every state (default / hover / focus-visible / active / disabled, plus the
// optional loading state below) is expressed through Tailwind utilities that
// map to design tokens — never hard-coded color/duration literals. Transitions
// use the bounded motion-duration token `duration-fast`. The focus-visible ring
// references the `--ring` token (tuned in index.css for 3:1 contrast) and is
// offset against the background so it reads against both the control and its
// surroundings.
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-elevated active:bg-primary/80 active:shadow-card",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        outline:
          "border border-input bg-background hover:bg-secondary hover:text-secondary-foreground active:bg-secondary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost:
          "hover:bg-secondary hover:text-secondary-foreground active:bg-secondary/80",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
        gold: "bg-gold text-navy-dark font-semibold shadow-glow hover:bg-gold-light hover:shadow-glow-lg active:bg-gold-dark",
        navy: "bg-navy text-primary-foreground shadow-soft hover:bg-navy-light active:bg-navy-dark",
        "outline-gold":
          "border-2 border-gold text-gold hover:bg-gold hover:text-navy-dark active:bg-gold-dark active:text-navy-dark",
        "outline-navy":
          "border-2 border-navy text-navy hover:bg-navy hover:text-primary-foreground active:bg-navy-dark active:text-primary-foreground",
        glass:
          "bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background/80 active:bg-background/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8 text-base",
        xl: "h-12 rounded-lg px-10 text-base font-semibold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Loading Component_State (Requirement 10.1/10.2): shows a spinner, exposes
   * `aria-busy`, and blocks activation to prevent duplicate submission. Ignored
   * when `asChild` is set, since the child owns rendering.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isLoading = !asChild && loading;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? undefined : disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
