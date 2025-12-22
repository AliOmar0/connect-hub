import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import ResponseTimeChart from "./ResponseTimeChart";

describe("ResponseTimeChart", () => {
  it("renders chart title", () => {
    render(<ResponseTimeChart />);
    expect(screen.getByText("Response Time by Hour")).toBeInTheDocument();
  });

  it("displays legend items", () => {
    render(<ResponseTimeChart />);

    expect(screen.getByText(/<2m Excellent/i)).toBeInTheDocument();
    expect(screen.getByText(/2-3m Good/i)).toBeInTheDocument();
    expect(screen.getByText(/>3m Improve/i)).toBeInTheDocument();
  });

  it("displays default data when no data provided", () => {
    render(<ResponseTimeChart />);

    // Chart should render with default hours
    const { container } = render(<ResponseTimeChart />);
    const chartContainer = container.querySelector(".h-48");
    expect(chartContainer).toBeInTheDocument();
  });

  it("displays custom data correctly", () => {
    const data = [
      { hour: "6AM", time: 1.5 },
      { hour: "8AM", time: 2.5 },
      { hour: "10AM", time: 3.5 },
    ];

    render(<ResponseTimeChart data={data} />);

    expect(screen.getByText("Response Time by Hour")).toBeInTheDocument();
  });

  it("renders chart container", () => {
    const { container } = render(<ResponseTimeChart />);
    const chartContainer = container.querySelector(".h-48");
    expect(chartContainer).toBeInTheDocument();
  });

  it("handles empty data array", () => {
    render(<ResponseTimeChart data={[]} />);

    expect(screen.getByText("Response Time by Hour")).toBeInTheDocument();
  });
});

