import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";

// Mock useAuth
vi.mock("@/hooks/useAuth");

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when user is authenticated", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "123", email: "test@example.com" },
      userRole: "admin",
      loading: false,
    });

    render(
      <BrowserRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /auth when user is not authenticated", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null,
      userRole: null,
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows loading spinner when loading", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null,
      userRole: null,
      loading: true,
    });

    render(
      <BrowserRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("allows access when user role meets required role level", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "123", email: "test@example.com" },
      userRole: "admin",
      loading: false,
    });

    render(
      <BrowserRouter>
        <ProtectedRoute requireRole="supervisor">
          <div>Admin Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );

    expect(screen.getByText("Admin Content")).toBeInTheDocument();
  });

  it("redirects agent when accessing restricted page", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "123", email: "test@example.com" },
      userRole: "agent",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <ProtectedRoute requireRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    // Agent should be redirected, not see access denied
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });

  it("redirects agent to /sessions when accessing restricted page", () => {
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
      </MemoryRouter>
    );

    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });

  it("allows access when user role is in allowedRoles array", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "123", email: "test@example.com" },
      userRole: "manager",
      loading: false,
    });

    render(
      <BrowserRouter>
        <ProtectedRoute allowedRoles={["manager", "admin"]}>
          <div>Manager Content</div>
        </ProtectedRoute>
      </BrowserRouter>
    );

    expect(screen.getByText("Manager Content")).toBeInTheDocument();
  });

  it("redirects agent when role is not in allowedRoles array", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "123", email: "test@example.com" },
      userRole: "agent",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <ProtectedRoute allowedRoles={["manager", "admin"]}>
          <div>Manager Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    // Agent should be redirected
    expect(screen.queryByText("Manager Content")).not.toBeInTheDocument();
  });
});

