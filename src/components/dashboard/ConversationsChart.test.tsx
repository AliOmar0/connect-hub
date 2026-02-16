import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import ConversationsChart from "./ConversationsChart";

describe("ConversationsChart", () => {
  it("renders chart title", () => {
    render(<ConversationsChart />);
    expect(screen.getByText("Weekly Activity")).toBeInTheDocument();
  });

  it("displays default data when no data provided", () => {
    render(<ConversationsChart />);

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("displays custom data correctly", () => {
    const data = [
      { name: "Mon", messages: 100, calls: 10 },
      { name: "Tue", messages: 120, calls: 15 },
      { name: "Wed", messages: 80, calls: 8 },
    ];

    render(<ConversationsChart data={data} />);

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Calls")).toBeInTheDocument();
  });

  it("renders chart container", () => {
    const { container } = render(<ConversationsChart />);
    const chartContainer = container.querySelector(".h-72");
    expect(chartContainer).toBeInTheDocument();
  });

  it("handles empty data array", () => {
    render(<ConversationsChart data={[]} />);

    expect(screen.getByText("Weekly Activity")).toBeInTheDocument();
  });
});
