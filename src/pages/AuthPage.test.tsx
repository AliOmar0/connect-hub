import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import AuthPage from "./AuthPage";

// Mock useAuth hook
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    signIn: vi.fn(),
    loading: false,
  }),
}));

describe("AuthPage", () => {
  it("renders login form", () => {
    render(
      <BrowserRouter>
        <AuthPage />
      </BrowserRouter>,
    );

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("shows message to contact manager for account", () => {
    render(
      <BrowserRouter>
        <AuthPage />
      </BrowserRouter>,
    );

    expect(
      screen.getByText("Need an account? Contact your manager."),
    ).toBeInTheDocument();
  });
});
