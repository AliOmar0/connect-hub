/**
 * Preservation Property Tests for useAuth
 *
 * Property 2: Preservation - Existing Role and Brand-New Signup Behavior Unchanged
 *
 * These tests verify that the existing behaviors for users who already have a valid
 * user_roles row, and brand-new signups with neither row, are preserved after the fix.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReactNode } from "react";
import * as fc from "fast-check";

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

// AppRole type for testing
type AppRole = "admin" | "supervisor" | "manager" | "agent" | "viewer";

// Role hierarchy constants (must match ProtectedRoute.tsx)
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  agent: 1,
  manager: 2,
  supervisor: 2,
  admin: 3,
};

describe("Preservation Property Tests - useAuth", () => {
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

  describe("Property 2.1: Existing Role Preservation", () => {
    /**
     * Validates: Requirement 3.1
     * WHEN an authenticated user already has a valid `user_roles` row THEN the
     * system SHALL CONTINUE TO load that role and grant or deny access to routes
     * based on the existing role hierarchy / `allowedRoles` checks, unchanged.
     */
    it("with both profiles and user_roles rows present, userRole is set to existing role and no extra user_roles.insert is called", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<AppRole>(
            "admin",
            "supervisor",
            "manager",
            "agent",
            "viewer",
          ),
          async (role) => {
            vi.clearAllMocks();

            const mockUser = {
              id: "user-123",
              email: "test@example.com",
              user_metadata: { first_name: "John", last_name: "Doe" },
            };

            let userRolesInsertCalled = false;

            (supabase.from as any).mockImplementation((table: string) => {
              if (table === "profiles") {
                return {
                  select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(() =>
                        Promise.resolve({
                          data: { id: "profile-1" },
                          error: null,
                        }),
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
                        Promise.resolve({ data: { role }, error: null }),
                      ),
                    })),
                  })),
                  insert: vi.fn(() => {
                    userRolesInsertCalled = true;
                    return {
                      select: vi.fn(() => ({
                        single: vi.fn(() =>
                          Promise.resolve({
                            data: { role: "agent" },
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
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
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

            (supabase.auth.onAuthStateChange as any).mockReturnValue({
              data: { subscription: { unsubscribe: vi.fn() } },
            });

            const wrapper = ({ children }: { children: ReactNode }) => (
              <AuthProvider>{children}</AuthProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(
              () => {
                expect(result.current.userRole).toBe(role);
              },
              { timeout: 5000 },
            );

            // Critical assertion: no user_roles.insert should be called when role already exists
            expect(userRolesInsertCalled).toBe(false);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Property 2.2: Brand-New Signup Preservation", () => {
    /**
     * Validates: Requirement 3.2
     * WHEN a brand-new user signs up (no `profiles` row and no `user_roles`
     * row) THEN the system SHALL CONTINUE TO create both the profile and the
     * default role as it does today.
     */
    it("with neither profiles nor user_roles row present, both are created and userRole ends up 'agent'", async () => {
      const mockUser = {
        id: "user-new",
        email: "newuser@example.com",
        user_metadata: { first_name: "Jane", last_name: "Smith" },
      };

      let profileInsertCalled = false;
      let roleInsertCalled = false;

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
            insert: vi.fn(() => {
              profileInsertCalled = true;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { id: "profile-new" },
                      error: null,
                    }),
                  ),
                })),
              };
            }),
          };
        }
        if (table === "user_roles") {
          // Track call count to simulate "role doesn't exist on first call, exists after insert"
          let maybeSingleCallCount = 0;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => {
                  maybeSingleCallCount++;
                  // First call: no role exists yet (brand-new signup)
                  // After insert: role now exists
                  if (maybeSingleCallCount === 1) {
                    return Promise.resolve({ data: null, error: null });
                  }
                  return Promise.resolve({
                    data: { role: "agent" },
                    error: null,
                  });
                }),
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

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: mockUser },
        error: null,
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

      (supabase.auth.onAuthStateChange as any).mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for the profile and role to be created
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(
        () => {
          expect(profileInsertCalled).toBe(true);
          expect(roleInsertCalled).toBe(true);
          expect(result.current.userRole).toBe("agent");
        },
        { timeout: 5000 },
      );
    });
  });
});
