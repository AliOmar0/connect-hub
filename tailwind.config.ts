import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Typography families resolve through tokens so :lang/[dir] can swap
      // Latin (Outfit/Inter) for Arabic (Cairo/IBM Plex Sans Arabic) families.
      fontFamily: {
        sans: ["var(--font-body)", "Inter", "sans-serif"],
        body: ["var(--font-body)", "Inter", "sans-serif"],
        heading: ["var(--font-heading)", "Outfit", "sans-serif"],
        display: ["var(--font-display)", "Outfit", "sans-serif"],
      },
      // Typography scale (Requirement 1.4) — each named level carries its
      // token-defined size, line-height, and weight.
      fontSize: {
        display: [
          "var(--text-display-size)",
          {
            lineHeight: "var(--text-display-line)",
            fontWeight: "var(--text-display-weight)",
          },
        ],
        h1: [
          "var(--text-h1-size)",
          {
            lineHeight: "var(--text-h1-line)",
            fontWeight: "var(--text-h1-weight)",
          },
        ],
        h2: [
          "var(--text-h2-size)",
          {
            lineHeight: "var(--text-h2-line)",
            fontWeight: "var(--text-h2-weight)",
          },
        ],
        h3: [
          "var(--text-h3-size)",
          {
            lineHeight: "var(--text-h3-line)",
            fontWeight: "var(--text-h3-weight)",
          },
        ],
        body: [
          "var(--text-body-size)",
          {
            lineHeight: "var(--text-body-line)",
            fontWeight: "var(--text-body-weight)",
          },
        ],
        "body-sm": [
          "var(--text-body-sm-size)",
          {
            lineHeight: "var(--text-body-sm-line)",
            fontWeight: "var(--text-body-sm-weight)",
          },
        ],
        caption: [
          "var(--text-caption-size)",
          {
            lineHeight: "var(--text-caption-line)",
            fontWeight: "var(--text-caption-weight)",
          },
        ],
        overline: [
          "var(--text-overline-size)",
          {
            lineHeight: "var(--text-overline-line)",
            fontWeight: "var(--text-overline-weight)",
          },
        ],
      },
      // Spacing scale (Requirement 1.5) — integer multiples of the 4px base
      // unit, mapped from the --space-* tokens so layout/typography utilities
      // consume the single source of truth.
      spacing: {
        "1": "var(--space-1)",
        "2": "var(--space-2)",
        "3": "var(--space-3)",
        "4": "var(--space-4)",
        "5": "var(--space-5)",
        "6": "var(--space-6)",
        "7": "var(--space-7)",
        "8": "var(--space-8)",
        "9": "var(--space-9)",
        "10": "var(--space-10)",
        "11": "var(--space-11)",
        "12": "var(--space-12)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy))",
          light: "hsl(var(--navy-light))",
          dark: "hsl(var(--navy-dark))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          light: "hsl(var(--gold-light))",
          dark: "hsl(var(--gold-dark))",
        },
        chart: {
          primary: "hsl(var(--chart-primary))",
          secondary: "hsl(var(--chart-secondary))",
          success: "hsl(var(--chart-success))",
          warning: "hsl(var(--chart-warning))",
          info: "hsl(var(--chart-info))",
        },
        // Status colors (Requirements 2.5, 3.5) — each paired with a
        // non-color cue at the component layer.
        status: {
          success: {
            DEFAULT: "hsl(var(--status-success))",
            foreground: "hsl(var(--status-success-foreground))",
          },
          warning: {
            DEFAULT: "hsl(var(--status-warning))",
            foreground: "hsl(var(--status-warning-foreground))",
          },
          info: {
            DEFAULT: "hsl(var(--status-info))",
            foreground: "hsl(var(--status-info-foreground))",
          },
          error: {
            DEFAULT: "hsl(var(--status-error))",
            foreground: "hsl(var(--status-error-foreground))",
          },
          neutral: {
            DEFAULT: "hsl(var(--status-neutral))",
            foreground: "hsl(var(--status-neutral-foreground))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        card: "var(--elevation-card)",
        soft: "var(--elevation-soft)",
        elevated: "var(--elevation-elevated)",
        glow: "var(--elevation-glow)",
        "glow-lg": "var(--elevation-glow-lg)",
      },
      // Motion duration tokens (Requirement 9.4) — bounded named set 100–500ms.
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      // Standard easing tokens mapped to idiomatic ease-* utilities.
      transitionTimingFunction: {
        DEFAULT: "var(--motion-ease)",
        in: "var(--motion-ease-in)",
        out: "var(--motion-ease-out)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "count-up": "count-up 0.5s ease-out",
      },
    },
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("tailwindcss-animate"),
  ],
} satisfies Config;
