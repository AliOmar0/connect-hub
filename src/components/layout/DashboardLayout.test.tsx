import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test-utils/render";
import DashboardLayout from "./DashboardLayout";

// Mock child components
vi.mock("./DashboardSidebar", () => ({
  default: () => <div data-testid="dashboard-sidebar">Sidebar</div>,
}));

vi.mock("./DashboardHeader", () => ({
  default: () => <div data-testid="dashboard-header">Header</div>,
}));

describe("DashboardLayout", () => {
  it("renders sidebar and header", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("dashboard-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
  });

  it("renders children content", () => {
    render(
      <DashboardLayout>
        <div data-testid="test-content">Test Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("test-content")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("has correct layout structure", () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    const layout = container.querySelector(".flex.h-screen");
    expect(layout).toBeInTheDocument();
  });
});
