import "@testing-library/jest-dom";
import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as fc from "fast-check";
// Initialize the shared i18next instance so components using useTranslation
// resolve real translations (English by default) during tests.
import "./src/i18n";

// Single source of truth for property-based test iteration counts.
// Lowered to keep the full suite fast; individual tests should rely on this
// global default rather than per-call numRuns overrides.
fc.configureGlobal({ numRuns: 25 });

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as IntersectionObserver;

// Mock ResizeObserver (needed for Recharts)
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as ResizeObserver;

// Setup QueryClientProvider for tests
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

// Create a test query client
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Make QueryClientProvider available globally for tests
global.QueryClientProvider = QueryClientProvider;
global.createTestQueryClient = createTestQueryClient;

// Suppress known non-actionable React act() warnings from third-party UI libraries (e.g. Radix UI)
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? "");
  if (msg.includes("was not wrapped in act")) {
    return;
  }
  originalConsoleError.apply(console, args);
};

import React from "react";

// Mock ResponsiveContainer for Recharts
vi.mock("recharts", async () => {
  const actual = await vi.importActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            minWidth: "100px",
            minHeight: "100px",
          },
        },
        children,
      ),
  };
});
