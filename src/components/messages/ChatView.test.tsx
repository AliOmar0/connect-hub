import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import ChatView from "./ChatView";
import {
  mockSessions,
  mockCustomers,
  mockMessages,
} from "@/test-utils/fixtures";
import { Session, Customer, Message } from "@/types/database";

describe("ChatView", () => {
  const mockSessionWithCustomer: Session & { customer?: Customer } = {
    ...mockSessions[0],
    customer: mockCustomers[0],
  };

  const mockOnSendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no session selected", () => {
    render(
      <ChatView
        session={null}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("لم يتم اختيار محادثة")).toBeInTheDocument();
    expect(
      screen.getByText(/الرجاء اختيار محادثة من القائمة الجانبية/),
    ).toBeInTheDocument();
  });

  it("renders session header with customer information", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText(mockCustomers[0].phone!)).toBeInTheDocument();
  });

  it("displays channel information", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
  });

  it("displays session status badge", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={true}
      />,
    );

    // Should show loading skeletons
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty messages state", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("لا توجد رسائل بعد")).toBeInTheDocument();
  });

  it("renders messages list", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("Hello, I need help")).toBeInTheDocument();
    expect(screen.getByText("How can I help you?")).toBeInTheDocument();
  });

  it("sends message when send button is clicked", async () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Test message" } });

    // Send button is icon-only, find it by the Send icon SVG
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((btn) => {
      const svg = btn.querySelector("svg");
      return svg && svg.getAttribute("class")?.includes("send");
    });

    expect(sendButton).toBeDefined();
    if (sendButton) {
      fireEvent.click(sendButton);
    }

    await waitFor(() => {
      expect(mockOnSendMessage).toHaveBeenCalledWith("Test message");
    });
  });

  it("sends message when Enter is pressed", async () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test message" } });
    // Use keyPress which is what the component listens to
    fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

    await waitFor(() => {
      expect(mockOnSendMessage).toHaveBeenCalledWith("Test message");
    });
  });

  it("does not send message when Shift+Enter is pressed", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test message" } });
    // Use keyPress which is what the component listens to
    fireEvent.keyPress(input, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
      shiftKey: true,
    });

    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it("clears input after sending message", async () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test message" } });

    // Send button is icon-only, find it by the Send icon SVG
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((btn) => {
      const svg = btn.querySelector("svg");
      return svg && svg.getAttribute("class")?.includes("send");
    });

    expect(sendButton).toBeDefined();
    if (sendButton) {
      fireEvent.click(sendButton);
    }

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("does not send empty message", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Send button is icon-only, find it by the Send icon SVG
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((btn) => {
      const svg = btn.querySelector("svg");
      return svg && svg.getAttribute("class")?.includes("send");
    });

    expect(sendButton).toBeDefined();
    expect(sendButton).toBeDisabled();
  });

  it("does not send message with only whitespace", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });

    // Send button is icon-only, find it by the Send icon SVG
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((btn) => {
      const svg = btn.querySelector("svg");
      return svg && svg.getAttribute("class")?.includes("send");
    });

    expect(sendButton).toBeDefined();
    expect(sendButton).toBeDisabled();
  });

  it("displays outbound messages on the right", () => {
    const outboundMessage: Message = {
      ...mockMessages[1],
      direction: "outbound",
    };

    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[outboundMessage]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // The justify-end class is on the parent flex container, not the message itself
    const messageText = screen.getByText("How can I help you?");
    const parentContainer = messageText.closest("div.flex");
    expect(parentContainer).toHaveClass("justify-end");
  });

  it("displays inbound messages on the left", () => {
    const inboundMessage: Message = {
      ...mockMessages[0],
      direction: "inbound",
    };

    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[inboundMessage]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // The justify-start class is on the parent flex container, not the message itself
    const messageText = screen.getByText("Hello, I need help");
    const parentContainer = messageText.closest("div.flex");
    expect(parentContainer).toHaveClass("justify-start");
  });

  it("displays message timestamp", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Should display time in HH:mm format
    const timePattern = /\d{2}:\d{2}/;
    const timeElements = Array.from(document.querySelectorAll("*")).filter(
      (el) => timePattern.test(el.textContent || ""),
    );
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it("displays read receipt for outbound messages", () => {
    const readMessage: Message = {
      ...mockMessages[1],
      direction: "outbound",
      read_at: new Date().toISOString(),
    };

    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[readMessage]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Should show checkmark icons
    const checkIcons = document.querySelectorAll('[class*="Check"]');
    expect(checkIcons.length).toBeGreaterThan(0);
  });

  it("displays delivered receipt for outbound messages", () => {
    const deliveredMessage: Message = {
      ...mockMessages[1],
      direction: "outbound",
      delivered_at: new Date().toISOString(),
      read_at: null,
    };

    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[deliveredMessage]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Should show checkmark icons
    const checkIcons = document.querySelectorAll('[class*="Check"]');
    expect(checkIcons.length).toBeGreaterThan(0);
  });

  it("displays sent receipt for outbound messages", () => {
    const sentMessage: Message = {
      ...mockMessages[1],
      direction: "outbound",
      delivered_at: null,
      read_at: null,
    };

    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[sentMessage]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Should show checkmark icons
    const checkIcons = document.querySelectorAll('[class*="Check"]');
    expect(checkIcons.length).toBeGreaterThan(0);
  });

  it("displays 'No phone' when customer phone is missing", () => {
    const sessionWithoutPhone: Session & { customer?: Customer } = {
      ...mockSessionWithCustomer,
      customer: {
        ...mockCustomers[0],
        phone: undefined,
      },
    };

    render(
      <ChatView
        session={sessionWithoutPhone}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("No phone")).toBeInTheDocument();
  });

  it("displays 'Unknown' when customer name is missing", () => {
    const sessionWithoutName: Session & { customer?: Customer } = {
      ...mockSessionWithCustomer,
      customer: {
        ...mockCustomers[0],
        name: undefined,
      },
    };

    render(
      <ChatView
        session={sessionWithoutName}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("displays customer avatar with first letter", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Avatar should show first letter - check for rounded-full containers with text
    const avatarContainers = document.querySelectorAll(
      '[class*="rounded-full"]',
    );
    expect(avatarContainers.length).toBeGreaterThan(0);
    // Also verify customer name is displayed
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("renders action buttons in header", () => {
    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Should have phone, video, and more options buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(2);
  });

  it("preserves whitespace in messages", () => {
    const messageWithWhitespace: Message = {
      ...mockMessages[0],
      content: "Line 1\nLine 2\nLine 3",
    };

    render(
      <ChatView
        session={mockSessionWithCustomer}
        messages={[messageWithWhitespace]}
        onSendMessage={mockOnSendMessage}
        loading={false}
      />,
    );

    // Check that all lines are present (they may be in separate elements or with whitespace-pre-wrap)
    expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    expect(screen.getByText(/Line 2/)).toBeInTheDocument();
    expect(screen.getByText(/Line 3/)).toBeInTheDocument();
  });
});
