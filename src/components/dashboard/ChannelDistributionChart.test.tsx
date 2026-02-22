import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import ChannelDistributionChart from "./ChannelDistributionChart";

describe("ChannelDistributionChart", () => {
  it("renders chart title", () => {
    render(<ChannelDistributionChart />);
    expect(screen.getByText("Channel Distribution")).toBeInTheDocument();
  });

  it("displays default data when no data provided", () => {
    render(<ChannelDistributionChart />);

    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Messenger")).toBeInTheDocument();
    expect(screen.getByText("Phone Calls")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("displays custom data correctly", () => {
    const data = [
      { name: "WhatsApp", value: 50, color: "hsl(142, 70%, 45%)" },
      { name: "Messenger", value: 30, color: "hsl(220, 90%, 56%)" },
      { name: "Phone Calls", value: 20, color: "hsl(45, 95%, 50%)" },
    ];

    render(<ChannelDistributionChart data={data} />);

    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Messenger")).toBeInTheDocument();
    expect(screen.getByText("Phone Calls")).toBeInTheDocument();
  });

  it("displays total value in center", () => {
    const data = [
      { name: "WhatsApp", value: 50, color: "hsl(142, 70%, 45%)" },
      { name: "Messenger", value: 30, color: "hsl(220, 90%, 56%)" },
    ];

    render(<ChannelDistributionChart data={data} />);

    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("displays percentage values in legend", () => {
    const data = [
      { name: "WhatsApp", value: 50, color: "hsl(142, 70%, 45%)" },
      { name: "Messenger", value: 30, color: "hsl(220, 90%, 56%)" },
    ];

    render(<ChannelDistributionChart data={data} />);

    // Check that percentage values are displayed
    const legendItems = screen.getAllByText(/50%|30%/);
    expect(legendItems.length).toBeGreaterThan(0);
  });

  it("handles empty data array", () => {
    render(<ChannelDistributionChart data={[]} />);

    expect(screen.getByText("Channel Distribution")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // Total should be 0
  });

  it("renders chart container", () => {
    const { container } = render(<ChannelDistributionChart />);
    const chartContainer = container.querySelector(".h-52");
    expect(chartContainer).toBeInTheDocument();
  });
});
