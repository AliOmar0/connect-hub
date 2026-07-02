import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme, isTheme, type Theme } from "./theme-provider";

const STORAGE_KEY = "connect-hub-theme";

function wrapper(props: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  return <ThemeProvider {...props} />;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to light and does not add the dark class", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("honors an explicit defaultTheme", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: (p) => wrapper({ ...p, defaultTheme: "dark" }),
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("reads a persisted theme from localStorage", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores an invalid persisted value and falls back to the default", () => {
    window.localStorage.setItem(STORAGE_KEY, "purple");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("setTheme toggles the dark class and persists the choice", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme("dark"));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("toggleTheme flips between light and dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("uses a custom storageKey", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: (p) => wrapper({ ...p, storageKey: "custom-key" }),
    });
    act(() => result.current.setTheme("dark"));
    expect(window.localStorage.getItem("custom-key")).toBe("dark");
  });

  it("throws when useTheme is used outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(
      /useTheme must be used within a ThemeProvider/,
    );
    spy.mockRestore();
  });

  it("renders children", () => {
    render(
      <ThemeProvider>
        <span>child</span>
      </ThemeProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

describe("isTheme", () => {
  it("accepts valid themes and rejects everything else", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("purple")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});
