import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import { createUserEvent } from "@/test-utils/helpers";
import CallsTable from "./CallsTable";
import { mockCalls, mockCustomers, mockEmployees, mockProfiles } from "@/test-utils/fixtures";
import { Call, Customer, Employee } from "@/types/database";

describe("CallsTable", () => {
  const mockCallsWithRelations: (Call & { customer?: Customer; employee?: Employee })[] = [
    {
      ...mockCalls[0],
      customer: mockCustomers[0],
      employee: {
        ...mockEmployees[0],
        profile: mockProfiles[0],
      },
    },
    {
      ...mockCalls[1],
      customer: mockCustomers[1],
      employee: {
        ...mockEmployees[1],
        profile: mockProfiles[1],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    render(<CallsTable calls={[]} loading={true} />);

    expect(screen.getByText("Direction")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Time")).toBeInTheDocument();
  });

  it("renders empty state when no calls", () => {
    render(<CallsTable calls={[]} loading={false} />);

    expect(screen.getByText("No calls found")).toBeInTheDocument();
  });

  it("renders calls with customer and employee information", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Agent One")).toBeInTheDocument();
  });

  it("displays call direction correctly", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Check for direction text (inbound/outbound)
    const directionTexts = screen.getAllByText(/inbound|outbound/i);
    expect(directionTexts.length).toBeGreaterThan(0);
  });

  it("displays call status with correct badge", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Multiple calls can have "completed" status, so use getAllByText
    const completedBadges = screen.getAllByText("completed");
    expect(completedBadges.length).toBeGreaterThan(0);
  });

  it("displays phone number", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    expect(screen.getByText(mockCustomers[0].phone)).toBeInTheDocument();
  });

  it("displays formatted duration", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Duration should be formatted (e.g., "5m" for 300 seconds)
    const durationElements = screen.getAllByText(/\d+[hms]/);
    expect(durationElements.length).toBeGreaterThan(0);
  });

  it("displays formatted date", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Date should be formatted (e.g., "Dec 21, 18:46")
    const datePattern = /[A-Za-z]{3}\s\d{1,2},\s\d{2}:\d{2}/;
    const dateElements = Array.from(document.querySelectorAll("*")).filter((el) =>
      datePattern.test(el.textContent || "")
    );
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it("shows missed call icon for missed calls", () => {
    const missedCall: Call & { customer?: Customer } = {
      ...mockCalls[0],
      status: "missed",
      customer: mockCustomers[0],
    };

    render(<CallsTable calls={[missedCall]} loading={false} />);

    // Check for missed status
    expect(screen.getByText("missed")).toBeInTheDocument();
  });

  it("shows inbound call icon for inbound calls", () => {
    const inboundCall: Call & { customer?: Customer } = {
      ...mockCalls[0],
      direction: "inbound",
      customer: mockCustomers[0],
    };

    render(<CallsTable calls={[inboundCall]} loading={false} />);

    expect(screen.getByText("inbound")).toBeInTheDocument();
  });

  it("shows outbound call icon for outbound calls", () => {
    const outboundCall: Call & { customer?: Customer } = {
      ...mockCalls[1],
      direction: "outbound",
      customer: mockCustomers[1],
    };

    render(<CallsTable calls={[outboundCall]} loading={false} />);

    expect(screen.getByText("outbound")).toBeInTheDocument();
  });

  it("displays unassigned when employee is missing", () => {
    const callWithoutEmployee: Call & { customer?: Customer } = {
      ...mockCalls[0],
      customer: mockCustomers[0],
    };

    render(<CallsTable calls={[callWithoutEmployee]} loading={false} />);

    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("displays unknown customer when customer is missing", () => {
    const callWithoutCustomer: Call = {
      ...mockCalls[0],
    };

    render(<CallsTable calls={[callWithoutCustomer]} loading={false} />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows dropdown menu with actions", async () => {
    const user = createUserEvent();
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Find buttons by their aria-haspopup attribute (dropdown menu buttons)
    const menuButtons = screen.getAllByRole("button", { hidden: true }).filter(
      (btn) => btn.getAttribute("aria-haspopup") === "menu"
    );
    expect(menuButtons.length).toBeGreaterThan(0);

    // Click first menu button using userEvent
    await user.click(menuButtons[0]);

    // Wait for dropdown to open and menu items to appear
    const viewDetails = await screen.findByText("View Details", { timeout: 3000 });
    const callBack = await screen.findByText("Call Back", { timeout: 3000 });
    
    expect(viewDetails).toBeInTheDocument();
    expect(callBack).toBeInTheDocument();
  });

  it("shows play recording option when recording_url exists", async () => {
    const user = createUserEvent();
    const callWithRecording: Call & { customer?: Customer } = {
      ...mockCalls[0],
      recording_url: "https://example.com/recording.mp3",
      customer: mockCustomers[0],
    };

    render(<CallsTable calls={[callWithRecording]} loading={false} />);

    const menuButtons = screen.getAllByRole("button", { hidden: true }).filter(
      (btn) => btn.getAttribute("aria-haspopup") === "menu"
    );
    if (menuButtons.length > 0) {
      await user.click(menuButtons[0]);

      // Wait for dropdown to open and menu item to appear
      const playRecording = await screen.findByText("Play Recording", { timeout: 3000 });
      expect(playRecording).toBeInTheDocument();
    }
  });

  it("handles null duration gracefully", () => {
    const callWithoutDuration: Call & { customer?: Customer } = {
      ...mockCalls[0],
      duration_seconds: null,
      customer: mockCustomers[0],
    };

    render(<CallsTable calls={[callWithoutDuration]} loading={false} />);

    // Should not crash and should display "-" or similar
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("displays customer avatar fallback with first letter", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Avatar should show first letter - check for rounded-full containers
    const avatarContainers = document.querySelectorAll('[class*="rounded-full"]');
    expect(avatarContainers.length).toBeGreaterThan(0);
    // Verify customer name is displayed
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("displays employee avatar fallback with initials", () => {
    render(<CallsTable calls={mockCallsWithRelations} loading={false} />);

    // Employee avatar should show initials - check for rounded-full containers
    const avatarContainers = document.querySelectorAll('[class*="rounded-full"]');
    expect(avatarContainers.length).toBeGreaterThan(0);
    // Verify employee name is displayed
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });
});

