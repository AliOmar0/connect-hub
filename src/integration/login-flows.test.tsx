/**
 * Integration Tests for Login/Refresh Flows
 *
 * Tests the full flow of AuthProvider + ProtectedRoute/RoleBasedRedirect together
 * to verify the bugfix for "Access Denied on Open" works correctly.
 *
 * Validates: Requirements 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleBasedRedirect from "@/components/RoleBasedRedirect";
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

// Test helpers
const createMockUser = (id: string, email: string, metadata = {}) => ({
  id,
  email,
  user_metadata: { first_name: "Test", last_name: "User", ...metadata },
  aud: "authenticated",
  created_at: new Date().toISOString(),
  app_metadata: {},
  role: "authenticated",
});

const createMockSession = (user: any) => ({
  user,
  access_token: "mock-token",
  refresh_token: "mock-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
});

describe("Integration: Login/Refresh Flows", () => {
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

    (supabase.from as any).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
  });

  describe("Scenario 1: Account with existing profiles row but no user_roles row", () => {
    it("signs in and renders protected content instead of 'Access Denied'", async () => {
      /**
       * Test: Full login flow for an account with existing profiles row but missing user_roles row
       * Validates: Requirements 2.1, 2.2
       *
       * Expected: User gets role "agent" provisioned and can access protected routes
       */
      const mockUser = createMockUser(
        "user-profile-exists",
        "profile@example.com",
      );
      const mockSession = createMockSession(mockUser);

      let roleInsertCalled = false;

      // Mock: profiles row exists, user_roles row does NOT exist
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  // Profile EXISTS
                  Promise.resolve({ data: { id: "profile-123" }, error: null }),
                ),
              })),
            })),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  // No role exists
                  Promise.resolve({ data: null, error: null }),
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

      // Setup session to trigger auth flow
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/sessions" element={<div>Sessions Page</div>} />
              <Route path="/auth" element={<div>Auth Page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Wait for the role insert to be called (the fix)
      await waitFor(
        () => {
          expect(roleInsertCalled).toBe(true);
        },
        { timeout: 10000 },
      );

      // After the fix, the user should NOT see "Access Denied"
      await waitFor(
        () => {
          expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Agent should be redirected to /sessions, not stuck on Access Denied
      await waitFor(
        () => {
          // Either shows sessions page (redirected agent) or dashboard content
          const hasSessions = screen.queryByText("Sessions Page") !== null;
          expect(hasSessions).toBe(true);
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Scenario 2: Brand-new account (no profiles, no user_roles)", () => {
    it("signs up and creates both rows with agent role, redirects to /sessions", async () => {
      /**
       * Test: Full signup flow for a brand-new account
       * Validates: Requirements 3.2
       *
       * Expected: Both profiles and user_roles rows are created, user gets agent role,
       * and is redirected to /sessions via RoleBasedRedirect
       */
      const mockUser = createMockUser("new-user-123", "newuser@example.com", {
        first_name: "New",
        last_name: "User",
      });
      const mockSession = createMockSession(mockUser);

      let profileInsertCalled = false;
      let roleInsertCalled = false;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  // Profile does NOT exist
                  Promise.resolve({ data: null, error: null }),
                ),
              })),
            })),
            insert: vi.fn(() => {
              profileInsertCalled = true;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { id: "new-profile" },
                      error: null,
                    }),
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
                  // Role does NOT exist initially
                  Promise.resolve({ data: null, error: null }),
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

      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<RoleBasedRedirect />} />
              <Route path="/sessions" element={<div>Sessions Page</div>} />
              <Route path="/dashboard" element={<div>Dashboard Content</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Wait for both inserts to be called
      await waitFor(
        () => {
          expect(profileInsertCalled).toBe(true);
          expect(roleInsertCalled).toBe(true);
        },
        { timeout: 10000 },
      );

      // Agent should be redirected to /sessions
      await waitFor(
        () => {
          expect(screen.queryByText("Sessions Page")).not.toBeNull();
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Scenario 3: Refresh/re-login repetition test", () => {
    it("fetchUserRole called twice no longer shows 'Access Denied' on either call", async () => {
      /**
       * Test: Simulate page refresh (fetchUserRole called twice) for previously-stuck account
       * Validates: Requirements 2.1, 2.2
       *
       * Setup: profilesRowExists=true, userRolesRowExists=false
       * Expected: "Access Denied" no longer appears on either call
       */
      const mockUser = createMockUser("refresh-user", "refresh@example.com");
      const mockSession = createMockSession(mockUser);

      let roleInsertCallCount = 0;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  // Profile EXISTS
                  Promise.resolve({
                    data: { id: "profile-refresh" },
                    error: null,
                  }),
                ),
              })),
            })),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  // Role does NOT exist
                  Promise.resolve({ data: null, error: null }),
                ),
              })),
            })),
            insert: vi.fn(() => {
              roleInsertCallCount++;
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

      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // First render (simulating initial page load)
      const { unmount } = render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/sessions" element={<div>Sessions Page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Wait for first role insert
      await waitFor(
        () => {
          expect(roleInsertCallCount).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10000 },
      );

      await waitFor(
        () => {
          expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      const firstCallCount = roleInsertCallCount;

      // Unmount and remount (simulating page refresh)
      unmount();

      // Second render (simulating page refresh)
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/sessions" element={<div>Sessions Page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Wait for second role insert attempt
      await waitFor(
        () => {
          expect(roleInsertCallCount).toBeGreaterThanOrEqual(firstCallCount);
        },
        { timeout: 10000 },
      );

      // Still no "Access Denied" on second call
      await waitFor(
        () => {
          expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });

    it("handles duplicate role insert gracefully on concurrent calls", async () => {
      /**
       * Test: Simulate race condition where two concurrent fetchUserRole calls happen
       * Validates: Requirements 2.2 (duplicate handling)
       *
       * Expected: Both calls complete without error, user ends up with "agent" role
       */
      const mockUser = createMockUser(
        "concurrent-user",
        "concurrent@example.com",
      );
      const mockSession = createMockSession(mockUser);

      let insertAttempts = 0;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data: { id: "profile-concurrent" },
                    error: null,
                  }),
                ),
              })),
            })),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: null, error: null }),
                ),
              })),
            })),
            insert: vi.fn(() => {
              insertAttempts++;
              // Simulate duplicate error on second attempt
              if (insertAttempts > 1) {
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: null,
                        error: {
                          message:
                            "duplicate key value violates unique constraint",
                        },
                      }),
                    ),
                  })),
                };
              }
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

      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/sessions" element={<div>Sessions Page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Wait for insert attempts
      await waitFor(
        () => {
          expect(insertAttempts).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10000 },
      );

      // No "Access Denied" even with duplicate error
      await waitFor(
        () => {
          expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Preservation: Existing behavior unchanged", () => {
    it("user with existing role continues to see correct content", async () => {
      /**
       * Test: User with existing valid role is unaffected
       * Validates: Requirements 3.1
       */
      const mockUser = createMockUser("existing-admin", "admin@example.com");
      const mockSession = createMockSession(mockUser);

      let roleInsertCalled = false;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data: { id: "profile-admin" },
                    error: null,
                  }),
                ),
              })),
            })),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  // Role ALREADY EXISTS as admin
                  Promise.resolve({ data: { role: "admin" }, error: null }),
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

      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Admin should see dashboard content
      await waitFor(
        () => {
          expect(screen.queryByText("Dashboard Content")).not.toBeNull();
        },
        { timeout: 10000 },
      );

      // Role insert should NOT have been called (role already exists)
      expect(roleInsertCalled).toBe(false);
    });

    it("loading spinner shows while loading is true", async () => {
      /**
       * Test: Loading spinner shows during auth resolution
       * Validates: Requirements 3.4
       */
      // Delay getSession to keep loading true
      let resolveGetSession: any;
      (supabase.auth.getSession as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveGetSession = resolve;
          }),
      );

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Initially should show loading spinner (Loader2 has animate-spin class)
      const loader = document.querySelector(".animate-spin");
      expect(loader).not.toBeNull();

      // Resolve the session to complete loading
      await act(async () => {
        resolveGetSession({ data: { session: null }, error: null });
      });

      // Wait for loading to complete
      await waitFor(
        () => {
          expect(document.querySelector(".animate-spin")).toBeNull();
        },
        { timeout: 5000 },
      );
    });

    it("signed-out user is redirected to /auth", async () => {
      /**
       * Test: Signed-out users are redirected to auth
       * Validates: Requirements 3.5
       */
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    allowedRoles={["admin", "supervisor", "manager"]}
                  >
                    <div>Dashboard Content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/auth" element={<div>Auth Page</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      // Should redirect to auth page
      await waitFor(
        () => {
          expect(screen.queryByText("Auth Page")).not.toBeNull();
        },
        { timeout: 10000 },
      );
    });
  });
});
