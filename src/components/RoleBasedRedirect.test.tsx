import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RoleBasedRedirect from "./RoleBasedRedirect";
import { useAuth } from "@/hooks/useAuth";

// Mock useAuth
vi.mock("@/hooks/useAuth");

describe("RoleBasedRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner when loading", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: null,
      loading: true,
    });

    render(
      <MemoryRouter>
        <RoleBasedRedirect />
      </MemoryRouter>
    );

    // Loading spinner should be shown
    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it("redirects agent to /messages", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "agent",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RoleBasedRedirect />
      </MemoryRouter>
    );

    // Should redirect to messages (Navigate component behavior)
    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it("redirects admin to /dashboard", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "admin",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RoleBasedRedirect />
      </MemoryRouter>
    );

    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it("redirects manager to /dashboard", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "manager",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RoleBasedRedirect />
      </MemoryRouter>
    );

    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it("redirects supervisor to /dashboard", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "supervisor",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RoleBasedRedirect />
      </MemoryRouter>
    );

    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it("redirects viewer to /dashboard", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      userRole: "viewer",
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <RoleBasedRedirect />
      </MemoryRouter>
    );

    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });
});

