import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavLink } from "./NavLink";
import { MemoryRouter } from "react-router-dom";

describe("NavLink", () => {
  it("renders link with correct href", () => {
    render(
      <MemoryRouter>
        <NavLink to="/test">Test Link</NavLink>
      </MemoryRouter>,
    );

    const link = screen.getByText("Test Link");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/test");
  });

  it("applies active className when active", () => {
    render(
      <MemoryRouter initialEntries={["/test"]}>
        <NavLink to="/test" activeClassName="active">
          Test Link
        </NavLink>
      </MemoryRouter>,
    );

    const link = screen.getByText("Test Link");
    expect(link.closest("a")).toHaveClass("active");
  });

  it("applies custom className", () => {
    render(
      <MemoryRouter>
        <NavLink to="/test" className="custom-class">
          Test Link
        </NavLink>
      </MemoryRouter>,
    );

    const link = screen.getByText("Test Link");
    expect(link.closest("a")).toHaveClass("custom-class");
  });
});
