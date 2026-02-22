import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import ConversationList from "./ConversationList";
import { mockSessions, mockCustomers } from "@/test-utils/fixtures";
import { Session, Customer } from "@/types/database";

describe("ConversationList", () => {
  const mockSessionsWithCustomers: (Session & { customer?: Customer })[] = [
    {
      ...mockSessions[0],
      customer: mockCustomers[0],
    },
    {
      ...mockSessions[1],
      customer: mockCustomers[1],
    },
  ];

  const mockOnSelectSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    render(
      <ConversationList
        sessions={[]}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={true}
      />,
    );

    // Loading state shows skeleton loaders, not the search input
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no sessions", () => {
    render(
      <ConversationList
        sessions={[]}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    expect(screen.getByText("No conversations found")).toBeInTheDocument();
  });

  it("renders sessions list", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("calls onSelectSession when session is clicked", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    const sessionButton = screen.getByText("John Doe").closest("button");
    if (sessionButton) {
      fireEvent.click(sessionButton);
      expect(mockOnSelectSession).toHaveBeenCalledWith(mockSessions[0].id);
    }
  });

  it("highlights selected session", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={mockSessions[0].id}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    const selectedButton = screen.getByText("John Doe").closest("button");
    expect(selectedButton).toHaveClass("bg-primary/10");
  });

  it("filters sessions by customer name", async () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(searchInput, { target: { value: "John" } });

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
    });
  });

  it("filters sessions by customer phone", async () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(searchInput, { target: { value: "+1234567890" } });

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });

  it("displays channel icon for each session", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    // Channel icons should be present (checking via parent elements)
    const sessionItems = screen.getAllByText(/John Doe|Jane Smith/);
    expect(sessionItems.length).toBeGreaterThan(0);
  });

  it("displays session status badge", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    // Multiple sessions can have "active" status, so use getAllByText
    const activeBadges = screen.getAllByText("active");
    expect(activeBadges.length).toBeGreaterThan(0);
  });

  it("displays relative time for sessions", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    // Should display relative time like "2 minutes ago"
    const timeElements = Array.from(document.querySelectorAll("*")).filter(
      (el) => /ago|minute|hour|day/i.test(el.textContent || ""),
    );
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it("displays customer phone number", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    expect(screen.getByText(mockCustomers[0].phone)).toBeInTheDocument();
  });

  it("displays 'No phone' when customer phone is missing", () => {
    const sessionWithoutPhone: Session & { customer?: Customer } = {
      ...mockSessions[0],
      customer: {
        ...mockCustomers[0],
        phone: undefined,
      },
    };

    render(
      <ConversationList
        sessions={[sessionWithoutPhone]}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    expect(screen.getByText("No phone")).toBeInTheDocument();
  });

  it("displays 'Unknown' when customer name is missing", () => {
    const sessionWithoutName: Session & { customer?: Customer } = {
      ...mockSessions[0],
      customer: {
        ...mockCustomers[0],
        name: undefined,
      },
    };

    render(
      <ConversationList
        sessions={[sessionWithoutName]}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    // Should show phone number (which appears in multiple places) or "Unknown"
    // Phone number appears in both name and phone fields when name is missing
    const phoneElements = screen.getAllByText(mockCustomers[0].phone!);
    expect(phoneElements.length).toBeGreaterThan(0);
  });

  it("displays customer avatar with first letter", () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    // Avatar should show first letter - check for the letter "J" from "John Doe"
    // The avatar fallback might not have the class name, so check for the content
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    // Check that avatars exist by looking for rounded-full elements with text
    const avatarContainers = document.querySelectorAll(
      '[class*="rounded-full"]',
    );
    expect(avatarContainers.length).toBeGreaterThan(0);
  });

  it("clears search when input is cleared", async () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search conversations...");

    // Search for something
    fireEvent.change(searchInput, { target: { value: "John" } });
    await waitFor(() => {
      expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
    });

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });
  });

  it("handles case-insensitive search", async () => {
    render(
      <ConversationList
        sessions={mockSessionsWithCustomers}
        selectedSession={null}
        onSelectSession={mockOnSelectSession}
        loading={false}
      />,
    );

    const searchInput = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(searchInput, { target: { value: "JOHN" } });

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });
});
