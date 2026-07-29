import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test-utils/render";
import ConversationsChart from "./ConversationsChart";

describe("ConversationsChart", () => {
  it("renders chart title", () => {
    render(<ConversationsChart data={[]} />);
    expect(screen.getByText("Weekly Activity")).toBeInTheDocument();
  });

  it("displays legend labels", () => {
    render(<ConversationsChart data={[]} />);

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("displays custom data summary badges", () => {
    const data = [
      { name: "Mon", fullDate: "Jul 27", messages: 100, calls: 10 },
      { name: "Tue", fullDate: "Jul 28", messages: 120, calls: 15 },
      { name: "Wed", fullDate: "Jul 29", messages: 80, calls: 8 },
    ];

    render(<ConversationsChart data={data} />);

    expect(screen.getByText(/300 messages/i)).toBeInTheDocument();
    expect(screen.getByText(/33 calls/i)).toBeInTheDocument();
  });

  it("renders chart container", () => {
    const { container } = render(<ConversationsChart data={[]} />);
    const chartContainer = container.querySelector(".h-72");
    expect(chartContainer).toBeInTheDocument();
  });

  it("allows toggling legend series", () => {
    const data = [{ name: "Mon", fullDate: "Jul 27", messages: 10, calls: 2 }];

    render(<ConversationsChart data={data} />);

    const messagesToggle = screen.getByRole("button", { name: /messages/i });
    fireEvent.click(messagesToggle);
    expect(messagesToggle).toHaveAttribute("aria-pressed", "false");
  });

  it("shows empty-state copy when there is no activity", () => {
    render(
      <ConversationsChart
        data={[
          { name: "Mon", fullDate: "Jul 27", messages: 0, calls: 0 },
          { name: "Tue", fullDate: "Jul 28", messages: 0, calls: 0 },
        ]}
      />,
    );

    expect(
      screen.getByText(/No activity recorded for this period yet/i),
    ).toBeInTheDocument();
  });
});
