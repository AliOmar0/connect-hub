import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

/**
 * Wait for an element to appear in the DOM
 */
export const waitForElement = async (
  getter: () => HTMLElement | null,
  timeout = 5000,
) => {
  return waitFor(
    () => {
      const element = getter();
      if (!element) {
        throw new Error("Element not found");
      }
      return element;
    },
    { timeout },
  );
};

/**
 * Wait for text to appear
 */
export const waitForText = async (text: string | RegExp, timeout = 5000) => {
  return waitFor(
    () => {
      const elements = Array.from(document.querySelectorAll("*")).filter(
        (el) => {
          const textContent = el.textContent || "";
          if (typeof text === "string") {
            return textContent.includes(text);
          }
          return text.test(textContent);
        },
      );
      if (elements.length === 0) {
        throw new Error(`Text "${text}" not found`);
      }
      return elements[0];
    },
    { timeout },
  );
};

/**
 * Create a user event instance
 */
export const createUserEvent = () => {
  return userEvent.setup();
};

/**
 * Wait for async operations to complete
 */
export const flushPromises = () => {
  return new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * Mock window.matchMedia
 */
export const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
};

/**
 * Mock window.resizeTo
 */
export const mockResize = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    writable: true,
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
};

/**
 * Advance timers and flush promises
 */
export const advanceTimersAndFlush = async (ms: number) => {
  const { vi } = await import("vitest");
  vi.advanceTimersByTime(ms);
  await flushPromises();
};
