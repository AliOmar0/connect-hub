import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import ResponseTimeChart from "./ResponseTimeChart";

const data = [
  { date: "Mon", time: 1.5 },
  { date: "Tue", time: 2.5 },
  { date: "Wed", time: 3.5 },
];

describe("ResponseTimeChart", () => {
  it("renders chart title", () => {
    render(<ResponseTimeChart />);
    expect(screen.getByText("Average Response Time")).toBeInTheDocument();
  });

  it("displays understandable response-time thresholds", () => {
    render(<ResponseTimeChart />);

    const thresholds = screen.getByLabelText("Response time thresholds");
    expect(thresholds).toHaveTextContent("≤2 min Excellent");
    expect(thresholds).toHaveTextContent("2–3 min Good");
    expect(thresholds).toHaveTextContent(">3 min Improve");
  });

  it("displays an explicit empty state when no data is provided", () => {
    render(<ResponseTimeChart />);

    expect(
      screen.getByText(
        "Response-time data is unavailable for the last 7 days.",
      ),
    ).toBeInTheDocument();
  });

  it("displays custom data in an accessible table", () => {
    render(<ResponseTimeChart data={data} />);

    expect(screen.getByText("Average Response Time")).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: "Average response time by day for the last 7 days",
      }),
    ).toBeInTheDocument();
  });

  it("exposes a named chart image when data is available", () => {
    render(<ResponseTimeChart data={data} />);

    expect(
      screen.getByRole("img", { name: /bar chart of average response time/i }),
    ).toBeInTheDocument();
  });

  it("handles an explicit empty data array", () => {
    render(<ResponseTimeChart data={[]} />);

    expect(screen.getByText("Average Response Time")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Response-time data is unavailable for the last 7 days.",
      ),
    ).toBeInTheDocument();
  });
});
