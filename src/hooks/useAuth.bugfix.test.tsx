/**
 * Bug Condition Exploration Tests
 *
 * **Property 1: Bug Condition** - Missing user_roles Row Is Not Repaired When Profile Exists
 *
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 *
 * **GOAL**: Surface counterexamples that demonstrate the bug in `fetchUserRole` (`src/hooks/useAuth.tsx`)
 * and confirm the root cause (role insert nested inside the `if (profileError || !profile)` branch)
 *
 * **Validates: Requirements 1.1, 1.2**
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act, renderHook } from "@testing-library/react";
import { AuthProvider, useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReactNode } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { MemoryRouter } from "react-router-dom";

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

/**
 * Helper to create a mock session object
 */
function createMockSession(userId: string, email: string = "test@example.com") {
  return {
    user: {
      id: userId,
      email,
      user_metadata: { first_name: "Test", last_name: "User" },
    },
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
  };
}

describe("Bug Condition Exploration: Missing user_roles Row Is Not Repaired When Profile Exists", () => {
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

  describe("Scenario: profilesRowExists=true, userRolesRowExists=false", () => {
    it("BUG: userRole stays null instead of becoming 'agent' when profile exists but role is missing", async () => {
      /**
       * This test demonstrates the bug condition:
       * - User has a profiles row (profile exists)
       * - User does NOT have a user_roles row (role missing)
       *
       * EXPECTED BEHAVIOR (after fix):
       * - userRole should be set to "agent" (default role provisioned)
       * - user_roles.insert SHOULD be called to create the missing role
       *
       * CURRENT BEHAVIOR (bug):
       * - userRole stays null
       * - user_roles.insert is NEVER called because it's nested inside the profile-missing branch
       */

      const mockUserId = "user-bug-condition";
      const mockSession = createMockSession(mockUserId);

      // Track insert calls
      let userRolesInsertCalled = false;
      let userRolesInsertCallCount = 0;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          // Profile EXISTS - return a profile row
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: { id: "profile-123" }, error: null }),
                ),
              })),
            })),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                // user_roles row DOES NOT exist - this is the bug condition
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: null, error: null }),
                ),
              })),
            })),
            insert: vi.fn(() => {
              userRolesInsertCalled = true;
              userRolesInsertCallCount++;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { user_id: mockUserId, role: "agent" },
                      error: null,
                    }),
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

      // Setup session
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockSession.user },
        error: null,
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for loading to complete
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Wait a bit more for async operations
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      /**
       * BUG CONDITION ASSERTION:
       * This assertion WILL FAIL on unfixed code.
       * On unfixed code: userRole is null (bug)
       * After fix: userRole should be "agent"
       */
      // EXPECTED: userRole should be "agent"
      // ACTUAL (bug): userRole is null
      expect(result.current.userRole).toBe("agent");
    });

    it("BUG: user_roles.insert is NEVER called when profile exists but role is missing", async () => {
      /**
       * This test confirms the root cause: the role insert is nested inside the profile-missing branch,
       * so when profile exists, the insert is never reached even if the role is missing.
       */

      const mockUserId = "user-insert-test";
      const mockSession = createMockSession(mockUserId);

      // Track insert calls
      const userRolesInsertCalls: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          // Profile EXISTS
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: { id: "profile-123" }, error: null }),
                ),
              })),
            })),
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
            insert: vi.fn((data: any) => {
              userRolesInsertCalls.push(data);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { ...data, role: "agent" },
                      error: null,
                    }),
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
        data: { user: mockSession.user },
        error: null,
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      /**
       * ROOT CAUSE ASSERTION:
       * On unfixed code: userRolesInsertCalls will be EMPTY (insert never called)
       * After fix: userRolesInsertCalls should have 1 call with { user_id, role: "agent" }
       */
      expect(userRolesInsertCalls.length).toBeGreaterThan(0);
      expect(userRolesInsertCalls[0]).toEqual({
        user_id: mockUserId,
        role: "agent",
      });
    });
  });

  describe("Repeated Refresh Case", () => {
    it("BUG: Denial persists on repeated fetchUserRole calls (not transient)", async () => {
      /**
       * This test proves the bug is persistent, not transient.
       * Calling fetchUserRole multiple times does NOT self-correct on unfixed code.
       */

      const mockUserId = "user-persistent-bug";
      const mockSession = createMockSession(mockUserId);

      let userRolesInsertCallCount = 0;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: { id: "profile-123" }, error: null }),
                ),
              })),
            })),
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
              userRolesInsertCallCount++;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { user_id: mockUserId, role: "agent" },
                      error: null,
                    }),
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
        data: { user: mockSession.user },
        error: null,
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result, rerender } = renderHook(() => useAuth(), { wrapper });

      // First fetch
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Trigger a second fetch by simulating auth state change
      const authCallback = (supabase.auth.onAuthStateChange as any).mock
        .calls[0]?.[0];
      if (authCallback) {
        await act(async () => {
          authCallback("SIGNED_IN", mockSession);
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
      }

      /**
       * PERSISTENCE ASSERTION:
       * On unfixed code: userRole is still null after multiple fetches
       * After fix: userRole should be "agent" and insert should have been called
       */
      expect(result.current.userRole).toBe("agent");
      expect(userRolesInsertCallCount).toBeGreaterThan(0);
    });
  });

  describe("ProtectedRoute Fallback Case", () => {
    it("BUG: ProtectedRoute shows 'Access Denied' when userRole is null (viewer fallback)", async () => {
      /**
       * This test demonstrates the user-facing impact:
       * When userRole is null, ProtectedRoute treats it as "viewer",
       * which fails the allowedRoles check for admin/supervisor/manager routes.
       */

      // Mock the auth context with null userRole
      const mockAuthState = {
        user: { id: "user-access-denied", email: "test@example.com" } as any,
        session: {} as any,
        userRole: null, // This is the bug condition - null role
        loading: false,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <AuthProvider mockState={mockAuthState}>{children}</AuthProvider>
        </MemoryRouter>
      );

      const { getByText, queryByText } = render(
        <ProtectedRoute allowedRoles={["admin", "supervisor", "manager"]}>
          <div>Dashboard Content</div>
        </ProtectedRoute>,
        { wrapper },
      );

      /**
       * BUG ASSERTION:
       * On unfixed code: "Access Denied" is shown (null treated as viewer)
       * After fix: When userRole is properly set, this scenario shouldn't happen
       *
       * This test documents the fallback behavior: null role = "viewer" = access denied
       */
      // EXPECTED (after fix): "Dashboard Content" should render
      // ACTUAL (bug): "Access Denied" renders because null is treated as viewer
      expect(getByText("Access Denied")).toBeDefined();
      expect(
        getByText("You don't have permission to access this page."),
      ).toBeDefined();
      // Dashboard content should NOT be visible
      expect(queryByText("Dashboard Content")).toBeNull();
    });

    it("AFTER FIX: ProtectedRoute redirects agent to /sessions when accessing admin route", async () => {
      /**
       * This test shows the correct behavior after the fix:
       * When userRole is properly set to a valid role, access is granted or redirected appropriately.
       * Agent accessing admin-only route should be redirected to /sessions, not show "Access Denied".
       */

      const mockAuthState = {
        user: { id: "user-access-granted", email: "test@example.com" } as any,
        session: {} as any,
        userRole: "agent" as const, // After fix, role should be set
        loading: false,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <AuthProvider mockState={mockAuthState}>{children}</AuthProvider>
        </MemoryRouter>
      );

      // Agent trying to access admin-only route should redirect to /sessions, not show Access Denied
      const { queryByText } = render(
        <ProtectedRoute allowedRoles={["admin", "supervisor", "manager"]}>
          <div>Dashboard Content</div>
        </ProtectedRoute>,
        { wrapper },
      );

      // Agent should NOT see "Access Denied" - they get redirected to /sessions
      expect(queryByText("Access Denied")).toBeNull();
      // Dashboard content should NOT be visible (agent redirected)
      expect(queryByText("Dashboard Content")).toBeNull();
    });
  });
});

/**
 * Counterexamples Found:
 *
 * Bug Condition: profilesRowExists=true, userRolesRowExists=false
 *
 * Counterexample 1: fetchUserRole('user-bug-condition') with profilesRowExists=true, userRolesRowExists=false
 *   - userRole stays null instead of becoming "agent"
 *   - user_roles.insert is NEVER called (role insert is nested inside profile-missing branch)
 *
 * Counterexample 2: fetchUserRole('user-insert-test') with profilesRowExists=true, userRolesRowExists=false
 *   - userRolesInsertCalls.length is 0 (insert never attempted)
 *   - Root cause confirmed: role provisioning is coupled to profile provisioning
 *
 * Counterexample 3: Repeated fetchUserRole calls for user with profilesRowExists=true, userRolesRowExists=false
 *   - userRole stays null on subsequent calls (persistent, not transient)
 *   - Bug does not self-correct on page refresh or re-login
 *
 * Counterexample 4: ProtectedRoute with userRole=null and allowedRoles=["admin","supervisor","manager"]
 *   - "Access Denied" is shown instead of dashboard content
 *   - null role is treated as "viewer" (lowest privilege)
 */
