import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import ChannelDistributionChart from "./ChannelDistributionChart";

const data = [
  { name: "WhatsApp", value: 50, color: "hsl(142, 70%, 45%)" },
  { name: "Messenger", value: 30, color: "hsl(220, 90%, 56%)" },
  { name: "Phone Calls", value: 20, color: "hsl(45, 95%, 50%)" },
];

describe("ChannelDistributionChart", () => {
  it("renders chart title", () => {
    render(<ChannelDistributionChart />);
    expect(screen.getByText("Channel Distribution")).toBeInTheDocument();
  });

  it("displays an explicit empty state when no data is provided", () => {
    render(<ChannelDistributionChart />);

    expect(
      screen.getByText("No channel activity is available for this month."),
    ).toBeInTheDocument();
  });

  it("displays custom data in both the legend and accessible table", () => {
    render(<ChannelDistributionChart data={data} />);

    expect(screen.getAllByText("WhatsApp")).toHaveLength(2);
    expect(screen.getAllByText("Messenger")).toHaveLength(2);
    expect(screen.getAllByText("Phone Calls")).toHaveLength(2);
    expect(
      screen.getByRole("table", {
        name: "Session distribution by channel this month",
      }),
    ).toBeInTheDocument();
  });

  it("describes the chart timeframe without inventing a total", () => {
    render(<ChannelDistributionChart data={data} />);

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
  });

  it("displays percentage values in the legend and accessible table", () => {
    render(<ChannelDistributionChart data={data} />);

    expect(screen.getAllByText("50%")).toHaveLength(2);
    expect(screen.getAllByText("30%")).toHaveLength(2);
  });

  it("handles an explicit empty data array", () => {
    render(<ChannelDistributionChart data={[]} />);

    expect(screen.getByText("Channel Distribution")).toBeInTheDocument();
    expect(
      screen.getByText("No channel activity is available for this month."),
    ).toBeInTheDocument();
  });

  it("exposes a named chart image when data is available", () => {
    render(<ChannelDistributionChart data={data} />);

    expect(
      screen.getByRole("img", { name: /donut chart showing/i }),
    ).toBeInTheDocument();
  });
});
