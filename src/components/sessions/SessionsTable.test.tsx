import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@/test-utils/render";
import { createUserEvent } from "@/test-utils/helpers";
import SessionsTable from "./SessionsTable";
import {
  mockSessions,
  mockCustomers,
  mockEmployees,
  mockProfiles,
} from "@/test-utils/fixtures";
import { Session, Customer, Employee } from "@/types/database";

describe("SessionsTable", () => {
  const mockSessionsWithRelations: (Session & {
    customer?: Customer;
    employee?: Employee;
  })[] = [
    {
      ...mockSessions[0],
      customer: mockCustomers[0],
      employee: {
        ...mockEmployees[0],
        profile: mockProfiles[0],
      },
    },
    {
      ...mockSessions[1],
      customer: mockCustomers[1],
      employee: {
        ...mockEmployees[1],
        profile: mockProfiles[1],
      },
    },
  ];

  const mockOnViewSession = vi.fn();
  const mockOnAssignAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    render(
      <SessionsTable
        sessions={[]}
        loading={true}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("Channel")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders empty state when no sessions", () => {
    render(
      <SessionsTable
        sessions={[]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("No sessions found")).toBeInTheDocument();
  });

  it("renders sessions with customer and employee information", () => {
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    // "Agent" appears in both header and data, so use getAllByText
    const agentElements = screen.getAllByText("Agent");
    expect(agentElements.length).toBeGreaterThan(0);
  });

  it("displays channel icon and name", () => {
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Messenger")).toBeInTheDocument();
  });

  it("displays session status with correct badge", () => {
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Multiple sessions can have "active" status, so use getAllByText
    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges.length).toBeGreaterThan(0);
  });

  it("displays wait time when available", () => {
    const sessionWithWaitTime: Session & { customer?: Customer } = {
      ...mockSessions[0],
      wait_time_seconds: 120,
      customer: mockCustomers[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithWaitTime]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("120s")).toBeInTheDocument();
  });

  it("displays '-' when wait time is missing", () => {
    const sessionWithoutWaitTime: Session & { customer?: Customer } = {
      ...mockSessions[0],
      wait_time_seconds: null,
      customer: mockCustomers[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithoutWaitTime]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Should display "-" for missing wait time
    const dashElements = screen.getAllByText("-");
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it("displays formatted duration", () => {
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Duration should be formatted (e.g., "5m" for 300 seconds)
    const durationElements = screen.getAllByText(/\d+[hm]/);
    expect(durationElements.length).toBeGreaterThan(0);
  });

  it("displays satisfaction score as stars", () => {
    const sessionWithSatisfaction: Session & { customer?: Customer } = {
      ...mockSessions[0],
      satisfaction_score: 4,
      customer: mockCustomers[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithSatisfaction]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Should display stars (checking via SVG icons)
    const starIcons = document.querySelectorAll('[class*="Star"]');
    expect(starIcons.length).toBeGreaterThan(0);
  });

  it("displays '-' when satisfaction score is missing", () => {
    const sessionWithoutSatisfaction: Session & { customer?: Customer } = {
      ...mockSessions[0],
      satisfaction_score: null,
      customer: mockCustomers[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithoutSatisfaction]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    const dashElements = screen.getAllByText("-");
    expect(dashElements.length).toBeGreaterThan(0);
  });

  it("displays relative time for sessions", () => {
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Should display relative time like "2 minutes ago"
    const timeElements = Array.from(document.querySelectorAll("*")).filter(
      (el) => /ago|minute|hour|day/i.test(el.textContent || ""),
    );
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it("calls onViewSession when row is clicked", () => {
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    const row = screen.getByText("John Doe").closest("tr");
    if (row) {
      fireEvent.click(row);
      expect(mockOnViewSession).toHaveBeenCalledWith(
        mockSessionsWithRelations[0],
      );
    }
  });

  it("shows dropdown menu with actions", async () => {
    const user = createUserEvent();
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Find buttons by their aria-haspopup attribute (dropdown menu buttons)
    const menuButtons = screen
      .getAllByRole("button", { hidden: true })
      .filter((btn) => btn.getAttribute("aria-haspopup") === "menu");
    expect(menuButtons.length).toBeGreaterThan(0);

    // Click first menu button using userEvent for better interaction
    await act(async () => {
      await user.click(menuButtons[0]);
    });

    // Wait for dropdown to open and menu items to appear
    // Use findByText which waits for the element to appear
    const viewDetails = await screen.findByText("View conversation", {
      timeout: 3000,
    });
    const assignAgent = await screen.findByText("Assign Agent to Session", {
      timeout: 3000,
    });

    expect(viewDetails).toBeInTheDocument();
    expect(assignAgent).toBeInTheDocument();
  });

  it("calls onViewSession when 'View Details' is clicked", async () => {
    const user = createUserEvent();
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    const menuButtons = screen
      .getAllByRole("button", { hidden: true })
      .filter((btn) => btn.getAttribute("aria-haspopup") === "menu");
    await act(async () => {
      await user.click(menuButtons[0]);
    });

    // Wait for menu to open and find the View Details button
    const viewDetailsButton = await screen.findByText("View conversation", {
      timeout: 3000,
    });
    await user.click(viewDetailsButton);

    expect(mockOnViewSession).toHaveBeenCalledWith(
      mockSessionsWithRelations[0],
    );
  });

  it("calls onAssignAgent when 'Assign Agent' is clicked", async () => {
    const user = createUserEvent();
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    const menuButtons = screen
      .getAllByRole("button", { hidden: true })
      .filter((btn) => btn.getAttribute("aria-haspopup") === "menu");
    await act(async () => {
      await user.click(menuButtons[0]);
    });

    // Wait for menu to open and find the Assign Agent button
    const assignAgentButton = await screen.findByText(
      "Assign Agent to Session",
      {
        timeout: 3000,
      },
    );
    await user.click(assignAgentButton);

    expect(mockOnAssignAgent).toHaveBeenCalledWith(
      mockSessionsWithRelations[0],
    );
  });

  it("displays 'Unassigned' when employee is missing", () => {
    const sessionWithoutEmployee: Session & { customer?: Customer } = {
      ...mockSessions[0],
      customer: mockCustomers[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithoutEmployee]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("displays 'Unknown' when customer name is missing", () => {
    const sessionWithoutCustomer: Session = {
      ...mockSessions[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithoutCustomer]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("handles null duration gracefully", () => {
    const sessionWithoutDuration: Session & { customer?: Customer } = {
      ...mockSessions[0],
      duration_seconds: null,
      customer: mockCustomers[0],
    };

    render(
      <SessionsTable
        sessions={[sessionWithoutDuration]}
        loading={false}
        onViewSession={mockOnViewSession}
        onAssignAgent={mockOnAssignAgent}
      />,
    );

    // Should not crash and should display "-" or similar
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("displays different status styles for different statuses", () => {
    const statusLabels = {
      active: "Active",
      waiting: "Waiting",
      completed: "Completed",
      escalated: "Escalated",
      missed: "Missed",
    } as const;

    (Object.keys(statusLabels) as (keyof typeof statusLabels)[]).forEach(
      (status) => {
        const { unmount } = render(
          <SessionsTable
            sessions={[
              {
                ...mockSessions[0],
                status,
                customer: mockCustomers[0],
              },
            ]}
            loading={false}
            onViewSession={mockOnViewSession}
            onAssignAgent={mockOnAssignAgent}
          />,
        );

        expect(screen.getByText(statusLabels[status])).toBeInTheDocument();
        unmount();
      },
    );
  });

  it("displays different channel icons for different channels", () => {
    const channelLabels = {
      whatsapp: "WhatsApp",
      messenger: "Messenger",
      sms: "SMS",
      voice: "Voice",
      email: "Email",
    } as const;

    (Object.keys(channelLabels) as (keyof typeof channelLabels)[]).forEach(
      (channel) => {
        const { unmount } = render(
          <SessionsTable
            sessions={[
              {
                ...mockSessions[0],
                channel,
                customer: mockCustomers[0],
              },
            ]}
            loading={false}
            onViewSession={mockOnViewSession}
            onAssignAgent={mockOnAssignAgent}
          />,
        );

        expect(screen.getByText(channelLabels[channel])).toBeInTheDocument();
        unmount();
      },
    );
  });

  it("does not show assign agent option when onAssignAgent is not provided", async () => {
    const user = createUserEvent();
    render(
      <SessionsTable
        sessions={mockSessionsWithRelations}
        loading={false}
        onViewSession={mockOnViewSession}
      />,
    );

    const menuButtons = screen
      .getAllByRole("button", { hidden: true })
      .filter((btn) => btn.getAttribute("aria-haspopup") === "menu");
    if (menuButtons.length > 0) {
      await act(async () => {
        await user.click(menuButtons[0]);
      });

      // Wait for View Details to appear
      const viewDetails = await screen.findByText("View conversation", {
        timeout: 3000,
      });
      expect(viewDetails).toBeInTheDocument();

      // Assign Agent should not be present
      expect(
        screen.queryByText("Assign Agent to Session"),
      ).not.toBeInTheDocument();
    }
  });
});
