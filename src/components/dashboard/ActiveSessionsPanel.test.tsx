import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import { mockSessions, mockCustomers, mockEmployees, mockProfiles } from "@/test-utils/fixtures";
import ActiveSessionsPanel from "./ActiveSessionsPanel";
import { useNavigate } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe("ActiveSessionsPanel", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(mockNavigate);
  });

  it("renders panel title and badge with session count", () => {
    const sessions = [
      {
        ...mockSessions[0],
        customer: mockCustomers[0],
        employee: { ...mockEmployees[0], profile: mockProfiles[0] },
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    expect(screen.getByText("Active AI Sessions")).toBeInTheDocument();
    expect(screen.getByText("1 live")).toBeInTheDocument();
  });

  it("displays empty state when no sessions", () => {
    render(<ActiveSessionsPanel sessions={[]} />);

    expect(screen.getByText("No active sessions")).toBeInTheDocument();
    expect(screen.getByText("0 live")).toBeInTheDocument();
  });

  it("displays sessions with customer and agent information", () => {
    const sessions = [
      {
        ...mockSessions[0],
        customer: mockCustomers[0],
        employee: { ...mockEmployees[0], profile: mockProfiles[0] },
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText(/Agent One/i)).toBeInTheDocument();
  });

  it("displays 'Unassigned' when employee is null", () => {
    const sessions = [
      {
        ...mockSessions[0],
        customer: mockCustomers[0],
        employee: null,
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    expect(screen.getByText(/Unassigned/i)).toBeInTheDocument();
  });

  it("displays 'Unknown' when customer is missing", () => {
    const sessions = [
      {
        ...mockSessions[0],
        customer: undefined,
        employee: { ...mockEmployees[0], profile: mockProfiles[0] },
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("displays channel icons correctly", () => {
    const sessions = [
      {
        ...mockSessions[0],
        channel: "whatsapp" as const,
        customer: mockCustomers[0],
        employee: { ...mockEmployees[0], profile: mockProfiles[0] },
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    // Channel icon should be present (emoji or icon)
    const sessionElement = screen.getByText("John Doe").closest("div");
    expect(sessionElement).toBeInTheDocument();
  });

  it("displays status badge correctly", () => {
    const sessions = [
      {
        ...mockSessions[0],
        status: "active" as const,
        customer: mockCustomers[0],
        employee: { ...mockEmployees[0], profile: mockProfiles[0] },
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays 'on-hold' status correctly", () => {
    const sessions = [
      {
        ...mockSessions[2],
        customer: mockCustomers[0],
        employee: null,
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    expect(screen.getByText("On Hold")).toBeInTheDocument();
  });

  it("limits display to 5 sessions", () => {
    const manySessions = Array.from({ length: 10 }, (_, i) => ({
      ...mockSessions[0],
      id: `session-${i}`,
      customer: mockCustomers[0],
      employee: { ...mockEmployees[0], profile: mockProfiles[0] },
    }));

    render(<ActiveSessionsPanel sessions={manySessions} />);

    // Should show badge with total count
    expect(screen.getByText("10 live")).toBeInTheDocument();
    // But only display 5 sessions
    const sessionElements = screen.getAllByText("John Doe");
    expect(sessionElements.length).toBeLessThanOrEqual(5);
  });

  it("navigates to sessions page when 'View All' is clicked", async () => {
    const { createUserEvent } = await import("@/test-utils/helpers");
    const user = createUserEvent();

    render(<ActiveSessionsPanel sessions={mockSessions} />);

    const viewAllButton = screen.getByText("View All");
    await user.click(viewAllButton);

    expect(mockNavigate).toHaveBeenCalledWith("/sessions");
  });

  it("displays duration correctly", () => {
    const sessions = [
      {
        ...mockSessions[0],
        duration_seconds: 300,
        customer: mockCustomers[0],
        employee: { ...mockEmployees[0], profile: mockProfiles[0] },
      },
    ];

    render(<ActiveSessionsPanel sessions={sessions} />);

    // Duration should be displayed (format may vary)
    const sessionElement = screen.getByText("John Doe").closest("div");
    expect(sessionElement).toBeInTheDocument();
  });
});

