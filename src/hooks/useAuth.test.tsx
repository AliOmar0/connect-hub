import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReactNode } from "react";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides auth context", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("user");
    expect(result.current).toHaveProperty("signIn");
    expect(result.current).toHaveProperty("signUp");
    expect(result.current).toHaveProperty("signOut");
  });

  it("signIn calls supabase.auth.signInWithPassword", async () => {
    const mockSignIn = vi.fn(() => Promise.resolve({ error: null }));
    (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>) = mockSignIn;

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signIn("test@example.com", "password123");

    expect(mockSignIn).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("signOut calls supabase.auth.signOut", async () => {
    const mockSignOut = vi.fn(() => Promise.resolve({ error: null }));
    (supabase.auth.signOut as ReturnType<typeof vi.fn>) = mockSignOut;

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signOut();

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("returns user role from database", async () => {
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() =>
          Promise.resolve({ data: { role: "admin" }, error: null })
        ),
      })),
    }));

    (supabase.from as ReturnType<typeof vi.fn>) = vi.fn(() => ({
      select: mockSelect,
    }));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.userRole).toBeDefined();
    });
  });

  it("handles missing user role gracefully", async () => {
    const mockSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() =>
          Promise.resolve({ data: null, error: null })
        ),
      })),
    }));

    (supabase.from as ReturnType<typeof vi.fn>) = vi.fn(() => ({
      select: mockSelect,
    }));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.userRole).toBeNull();
    });
  });
});

