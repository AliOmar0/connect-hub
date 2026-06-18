/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReactNode } from "react";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup baseline successful mocks
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: null },
      error: null,
    });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
  });

  it("provides auth context", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBeDefined();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("signIn calls supabase.auth.signInWithPassword", async () => {
    const mockSignIn = supabase.auth.signInWithPassword;
    (mockSignIn as any).mockResolvedValue({ error: null });

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
    const mockSignOut = (supabase.auth.signOut as any).mockResolvedValue({
      error: null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signOut();

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("returns user role from database", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: { role: "admin" }, error: null }),
              ),
            })),
          })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.userRole).toBeDefined();
    });
  });

  it("handles missing user role gracefully", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "user_roles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: null }),
              ),
            })),
          })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.userRole).toBeNull();
    });
  });

  it("signUp calls supabase.auth.signUp with correct parameters", async () => {
    const mockSignUp = (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signUp(
      "test@example.com",
      "password123",
      "John",
      "Doe",
    );

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
      options: {
        emailRedirectTo: expect.stringContaining(window.location.origin),
        data: {
          first_name: "John",
          last_name: "Doe",
        },
      },
    });
  });

  it("signUp works without first and last name", async () => {
    const mockSignUp = (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signUp("test@example.com", "password123");

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
      options: {
        emailRedirectTo: expect.stringContaining(window.location.origin),
        data: {
          first_name: undefined,
          last_name: undefined,
        },
      },
    });
  });

  it("handles signIn error", async () => {
    const mockError = new Error("Invalid credentials");
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      error: mockError,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    const response = await result.current.signIn("test@example.com", "wrong");

    expect(response.error).toBe(mockError);
  });

  it("handles signUp error", async () => {
    const mockError = new Error("Email already exists");
    (supabase.auth.signUp as any).mockResolvedValue({
      data: null,
      error: mockError,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    const response = await result.current.signUp(
      "test@example.com",
      "password123",
    );

    expect(response.error).toBe(mockError);
  });

  it("creates profile when it doesn't exist", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      user_metadata: { first_name: "John", last_name: "Doe" },
    };

    const mockGetUser = (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    let profileSelectCallCount = 0;
    let profileInsertCalled = false;
    let roleInsertCalled = false;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((columns) => {
            profileSelectCallCount++;
            if (columns === "id") {
              return {
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: null, error: null }),
                  ),
                })),
              };
            } else {
              return {
                single: vi.fn(() =>
                  Promise.resolve({ data: { id: "profile-1" }, error: null }),
                ),
              };
            }
          }),
          insert: vi.fn(() => {
            profileInsertCalled = true;
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: { id: "profile-1" }, error: null }),
                ),
              })),
            };
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: { role: "agent" }, error: null }),
              ),
            })),
          })),
          insert: vi.fn(() => {
            roleInsertCalled = true;
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: { role: "agent" }, error: null }),
                ),
              })),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const mockSession = {
      user: mockUser,
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
    };

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    let authStateCallback:
      | ((event: string, session: { user: { id: string } } | null) => void)
      | null = null;
    const onAuthStateChangeCallback = vi.fn((callback) => {
      authStateCallback = callback;
      // Simulate auth state change - trigger immediately in next tick
      // The component will defer fetchUserRole with setTimeout(..., 0)
      Promise.resolve().then(async () => {
        if (authStateCallback) {
          await act(async () => {
            authStateCallback("SIGNED_IN", mockSession);
          });
        }
      });
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    });
    (supabase.auth.onAuthStateChange as any).mockImplementation(
      onAuthStateChangeCallback,
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    renderHook(() => useAuth(), { wrapper });

    // Wait for the auth state change to trigger and profile/role creation
    await new Promise((resolve) => setTimeout(resolve, 100));

    await waitFor(
      () => {
        expect(profileInsertCalled || roleInsertCalled).toBe(true);
      },
      { timeout: 5000, interval: 100 },
    );
  });

  it("handles profile creation error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
    };

    const mockGetUser = (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: null }),
              ),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: null,
                  error: new Error("Insert failed"),
                }),
              ),
            })),
          })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const mockSession = {
      user: mockUser,
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
    };

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      // Should not crash, error is logged but handled
      expect(result.current).toBeDefined();
    });

    consoleSpy.mockRestore();
  });

  it("updates user and session on auth state change", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
    };

    const mockSession = {
      user: mockUser,
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
    };

    let authStateCallback:
      | ((event: string, session: typeof mockSession | null) => void)
      | null = null;

    (supabase.auth.onAuthStateChange as ReturnType<typeof vi.fn>) = vi.fn(
      (callback) => {
        authStateCallback = callback;
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      },
    );

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });

    // Simulate sign in
    if (authStateCallback) {
      await act(async () => {
        authStateCallback("SIGNED_IN", mockSession);
      });
    }

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.session).toEqual(mockSession);
    });
  });

  it("clears user and session on sign out", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
    };

    const mockSession = {
      user: mockUser,
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
    };

    let authStateCallback:
      | ((event: string, session: typeof mockSession | null) => void)
      | null = null;

    (supabase.auth.onAuthStateChange as any).mockImplementation(
      (callback: any) => {
        authStateCallback = callback;
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      },
    );

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const mockSignOut = (supabase.auth.signOut as any).mockResolvedValue({
      error: null,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
    });

    await result.current.signOut();

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.userRole).toBeNull();
    });
  });

  it("throws error when useAuth is used outside AuthProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");

    consoleSpy.mockRestore();
  });

  it("handles loading state correctly", async () => {
    (supabase.auth.getSession as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: { session: null }, error: null });
          }, 100);
        }),
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Initially should be loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
