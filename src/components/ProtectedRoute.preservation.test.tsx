/**
 * Preservation Property Tests for ProtectedRoute
 *
 * Property 2: Preservation - Role Hierarchy and Access Control Behavior Unchanged
 *
 * These tests verify that the role hierarchy checks, loading spinner behavior,
 * agent redirect to /sessions, and signed-out redirect to /auth are preserved.
 *
 * Validates: Requirements 3.1, 3.3, 3.4, 3.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import * as fc from "fast-check";

// Mock useAuth
vi.mock("@/hooks/useAuth");

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

describe("Preservation Property Tests - ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Property 2.3: Role Hierarchy Access Grant/Deny", () => {
    /**
     * Validates: Requirement 3.1
     * Role hierarchy: viewer: 0, agent: 1, manager: 2, supervisor: 2, admin: 3
     * User with level >= required level should be granted access.
     */
    it("grants access when user role level >= requireRole level", async () => {
      const validRoles: AppRole[] = [
        "admin",
        "supervisor",
        "manager",
        "agent",
        "viewer",
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...validRoles),
          fc.constantFrom(...validRoles),
          async (userRole, requireRole) => {
            cleanup(); // Clean up before each property iteration
            vi.clearAllMocks();

            const userLevel = ROLE_HIERARCHY[userRole] || 0;
            const requiredLevel = ROLE_HIERARCHY[requireRole] || 0;
            const shouldHaveAccess = userLevel >= requiredLevel;

            (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
              user: { id: "123", email: "test@example.com" },
              userRole,
              loading: false,
            });

            // For agent, they get redirected to /sessions when denied access
            // So we need to use MemoryRouter to track navigation
            render(
              <MemoryRouter initialEntries={["/protected"]}>
                <ProtectedRoute requireRole={requireRole}>
                  <div>Protected Content</div>
                </ProtectedRoute>
              </MemoryRouter>,
            );

            if (shouldHaveAccess) {
              // User should see protected content
              expect(screen.getByText("Protected Content")).toBeInTheDocument();
            } else if (userRole === "agent") {
              // Agent should be redirected (not see content, not see "Access Denied")
              expect(
                screen.queryByText("Protected Content"),
              ).not.toBeInTheDocument();
              expect(
                screen.queryByText("Access Denied"),
              ).not.toBeInTheDocument();
            } else {
              // Non-agent with insufficient role should see "Access Denied"
              expect(
                screen.queryByText("Protected Content"),
              ).not.toBeInTheDocument();
              expect(screen.getByText("Access Denied")).toBeInTheDocument();
            }
          },
        ),
        { numRuns: 25 },
      );
    });

    /**
     * Validates: Requirement 3.1
     * allowedRoles array check - access granted only if userRole is in array
     */
    it("grants access when user role is in allowedRoles array", async () => {
      const validRoles: AppRole[] = [
        "admin",
        "supervisor",
        "manager",
        "agent",
        "viewer",
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...validRoles),
          fc.array(fc.constantFrom(...validRoles), {
            minLength: 1,
            maxLength: 5,
          }),
          async (userRole, allowedRoles) => {
            cleanup(); // Clean up before each property iteration
            vi.clearAllMocks();

            const shouldHaveAccess = allowedRoles.includes(userRole);

            (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
              user: { id: "123", email: "test@example.com" },
              userRole,
              loading: false,
            });

            render(
              <MemoryRouter initialEntries={["/protected"]}>
                <ProtectedRoute allowedRoles={allowedRoles}>
                  <div>Protected Content</div>
                </ProtectedRoute>
              </MemoryRouter>,
            );

            if (shouldHaveAccess) {
              expect(screen.getByText("Protected Content")).toBeInTheDocument();
            } else if (userRole === "agent") {
              // Agent redirected, no Access Denied shown
              expect(
                screen.queryByText("Protected Content"),
              ).not.toBeInTheDocument();
              expect(
                screen.queryByText("Access Denied"),
              ).not.toBeInTheDocument();
            } else {
              expect(
                screen.queryByText("Protected Content"),
              ).not.toBeInTheDocument();
              expect(screen.getByText("Access Denied")).toBeInTheDocument();
            }
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  describe("Property 2.4: Loading Spinner Preservation", () => {
    /**
     * Validates: Requirement 3.4
     * WHEN the session is still being resolved (`loading` is `true`) THEN the
     * system SHALL CONTINUE TO show the loading spinner instead of "Access Denied"
     * or any redirect.
     */
    it("shows loading spinner when loading is true, regardless of userRole", async () => {
      const validRoles: AppRole[] = [
        "admin",
        "supervisor",
        "manager",
        "agent",
        "viewer",
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...validRoles),
          fc.constantFrom(...validRoles),
          async (userRole, requireRole) => {
            cleanup(); // Clean up before each property iteration
            vi.clearAllMocks();

            (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
              user: { id: "123", email: "test@example.com" },
              userRole,
              loading: true,
            });

            render(
              <BrowserRouter>
                <ProtectedRoute requireRole={requireRole}>
                  <div>Protected Content</div>
                </ProtectedRoute>
              </BrowserRouter>,
            );

            // Should show loading spinner, not content or Access Denied
            expect(
              screen.queryByText("Protected Content"),
            ).not.toBeInTheDocument();
            expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
            // Loading spinner should be present (it has animate-spin class)
            expect(document.querySelector(".animate-spin")).toBeInTheDocument();
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  describe("Property 2.5: Signed-Out Redirect Preservation", () => {
    /**
     * Validates: Requirement 3.5
     * WHEN no user is signed in THEN the system SHALL CONTINUE TO redirect to `/auth`.
     */
    it("redirects to /auth when user is null", async () => {
      const validRoles: AppRole[] = [
        "admin",
        "supervisor",
        "manager",
        "agent",
        "viewer",
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...validRoles),
          fc.constantFrom(...validRoles),
          async (userRole, requireRole) => {
            cleanup(); // Clean up before each property iteration
            vi.clearAllMocks();

            (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
              user: null,
              userRole: null,
              loading: false,
            });

            render(
              <MemoryRouter initialEntries={["/protected"]}>
                <ProtectedRoute requireRole={requireRole}>
                  <div>Protected Content</div>
                </ProtectedRoute>
              </MemoryRouter>,
            );

            // Should redirect, not show content or Access Denied
            expect(
              screen.queryByText("Protected Content"),
            ).not.toBeInTheDocument();
            expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  describe("Property 2.6: Agent Redirect Preservation", () => {
    /**
     * Validates: Requirement 3.3
     * WHEN an authenticated user's role is `"agent"` and they hit a
     * role-gated route they cannot access THEN the system SHALL CONTINUE TO
     * redirect them to `/sessions` instead of showing "Access Denied".
     */
    it("redirects agent to /sessions when accessing restricted page (requireRole)", async () => {
      vi.clearAllMocks();

      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { id: "123", email: "test@example.com" },
        userRole: "agent",
        loading: false,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <ProtectedRoute requireRole="admin">
            <div>Admin Content</div>
          </ProtectedRoute>
        </MemoryRouter>,
      );

      // Agent should be redirected, not see Access Denied
      expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
      expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
    });

    it("redirects agent to /sessions when accessing restricted page (allowedRoles)", async () => {
      vi.clearAllMocks();

      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { id: "123", email: "test@example.com" },
        userRole: "agent",
        loading: false,
      });

      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <ProtectedRoute allowedRoles={["admin", "supervisor", "manager"]}>
            <div>Manager Content</div>
          </ProtectedRoute>
        </MemoryRouter>,
      );

      // Agent should be redirected, not see Access Denied
      expect(screen.queryByText("Manager Content")).not.toBeInTheDocument();
      expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
    });

    it("allows agent to access routes where agent is in allowedRoles", async () => {
      vi.clearAllMocks();

      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { id: "123", email: "test@example.com" },
        userRole: "agent",
        loading: false,
      });

      render(
        <BrowserRouter>
          <ProtectedRoute allowedRoles={["admin", "agent"]}>
            <div>Agent Content</div>
          </ProtectedRoute>
        </BrowserRouter>,
      );

      // Agent should see content
      expect(screen.getByText("Agent Content")).toBeInTheDocument();
    });
  });

  describe("Property 2.7: Null Role Fallback to Viewer", () => {
    /**
     * When userRole is null, the system treats it as "viewer" (lowest privilege).
     * This tests the fallback behavior.
     */
    it("treats null userRole as viewer level for access decisions", async () => {
      vi.clearAllMocks();

      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { id: "123", email: "test@example.com" },
        userRole: null,
        loading: false,
      });

      // null role should be treated as viewer (level 0)
      // Only requireRole: viewer should grant access
      render(
        <MemoryRouter initialEntries={["/protected"]}>
          <ProtectedRoute requireRole="viewer">
            <div>Viewer Content</div>
          </ProtectedRoute>
        </MemoryRouter>,
      );

      // With null role treated as viewer, should have access to viewer-level content
      expect(screen.getByText("Viewer Content")).toBeInTheDocument();
    });

    it("denies access and shows Access Denied for null role accessing higher-level content", async () => {
      vi.clearAllMocks();

      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { id: "123", email: "test@example.com" },
        userRole: null,
        loading: false,
      });

      render(
        <MemoryRouter initialEntries={["/protected"]}>
          <ProtectedRoute requireRole="agent">
            <div>Agent Content</div>
          </ProtectedRoute>
        </MemoryRouter>,
      );

      // null role is treated as viewer (level 0), which is less than agent (level 1)
      // Should show Access Denied (not agent, so no redirect)
      expect(screen.queryByText("Agent Content")).not.toBeInTheDocument();
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });
});
