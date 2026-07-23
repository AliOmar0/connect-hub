import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import ConversationsChart from "./ConversationsChart";

const data = [
  { name: "Mon", messages: 100, calls: 10 },
  { name: "Tue", messages: 120, calls: 15 },
  { name: "Wed", messages: 80, calls: 8 },
];

describe("ConversationsChart", () => {
  it("renders chart title", () => {
    render(<ConversationsChart />);
    expect(screen.getByText("Weekly Activity")).toBeInTheDocument();
  });

  it("shows the legend and an explicit empty state when data is unavailable", () => {
    render(<ConversationsChart />);

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Calls")).toBeInTheDocument();
    expect(
      screen.getByText("Weekly activity data is unavailable."),
    ).toBeInTheDocument();
  });

  it("displays custom data in the legend and accessible table", () => {
    render(<ConversationsChart data={data} />);

    expect(screen.getAllByText("Messages")).toHaveLength(2);
    expect(screen.getAllByText("Calls")).toHaveLength(2);
    expect(
      screen.getByRole("table", { name: "Weekly activity totals by day" }),
    ).toBeInTheDocument();
  });

  it("exposes a named chart image when data is available", () => {
    render(<ConversationsChart data={data} />);

    expect(
      screen.getByRole("img", { name: /area chart comparing/i }),
    ).toBeInTheDocument();
  });

  it("handles an explicit empty data array", () => {
    render(<ConversationsChart data={[]} />);

    expect(screen.getByText("Weekly Activity")).toBeInTheDocument();
    expect(
      screen.getByText("Weekly activity data is unavailable."),
    ).toBeInTheDocument();
  });
});
