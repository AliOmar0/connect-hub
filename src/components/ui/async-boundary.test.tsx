// Unit tests for the AsyncBoundary shared feedback wrapper.
//
// Verifies that each ViewStatus maps to a consistent presentation
// (Skeleton / EmptyState / ErrorState / loaded children / nothing for idle)
// and that every transition is announced to assistive technology via the
// embedded LiveRegion.
//
// Requirements: 5.4, 10.6, 10.8
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Use i18n keys as identity so assertions don't depend on translation loading.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { AsyncBoundary } from "./async-boundary";

const skeleton = <div data-testid="skeleton">loading…</div>;
const loaded = <div data-testid="content">the data</div>;

describe("AsyncBoundary", () => {
  it("renders nothing but the live region when idle", () => {
    render(
      <AsyncBoundary status="idle" skeleton={skeleton}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    // idle carries no announcement.
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("renders the skeleton and announces loading while loading", () => {
    render(
      <AsyncBoundary status="loading" skeleton={skeleton}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "feedback.status.loading",
    );
  });

  it("renders children and announces loaded when loaded", () => {
    render(
      <AsyncBoundary status="loaded" skeleton={skeleton}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "feedback.status.loaded",
    );
  });

  it("renders an EmptyState and announces empty when empty", () => {
    render(
      <AsyncBoundary status="empty" skeleton={skeleton}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    // EmptyState uses role="status"; there are two status regions now.
    const statuses = screen.getAllByRole("status");
    expect(
      statuses.some((el) => el.textContent?.includes("feedback.status.empty")),
    ).toBe(true);
    expect(screen.getByText("feedback.emptyTitle")).toBeInTheDocument();
  });

  it("renders an ErrorState with a retry action and announces error", () => {
    const onRetry = vi.fn();
    render(
      <AsyncBoundary status="error" skeleton={skeleton} onRetry={onRetry}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(screen.getByText("feedback.errorTitle")).toBeInTheDocument();

    // Error is announced assertively through an alert region.
    const alerts = screen.getAllByRole("alert");
    expect(
      alerts.some((el) => el.textContent?.includes("feedback.status.error")),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "feedback.retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("announces the new status when transitioning between states", () => {
    const { rerender } = render(
      <AsyncBoundary status="loading" skeleton={skeleton}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "feedback.status.loading",
    );

    rerender(
      <AsyncBoundary status="loaded" skeleton={skeleton}>
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "feedback.status.loaded",
    );
  });

  it("honours custom announcement overrides", () => {
    render(
      <AsyncBoundary
        status="loading"
        skeleton={skeleton}
        announcements={{ loading: "Fetching sessions" }}
      >
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Fetching sessions");
  });

  it("honours custom empty title/description/action", () => {
    render(
      <AsyncBoundary
        status="empty"
        skeleton={skeleton}
        emptyTitle="No sessions"
        emptyDescription="Nothing here yet"
        emptyAction={<button type="button">Add</button>}
      >
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByText("No sessions")).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("honours custom error title/description/retry label", () => {
    render(
      <AsyncBoundary
        status="error"
        skeleton={skeleton}
        onRetry={() => {}}
        errorTitle="Load failed"
        errorDescription="The request timed out"
        retryLabel="Try again"
      >
        {loaded}
      </AsyncBoundary>,
    );
    expect(screen.getByText("Load failed")).toBeInTheDocument();
    expect(screen.getByText("The request timed out")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
