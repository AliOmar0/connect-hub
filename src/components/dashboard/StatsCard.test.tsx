import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsCard from "./StatsCard";
import { MessageSquare } from "lucide-react";

describe("StatsCard", () => {
  it("renders with title and value", () => {
    render(
      <StatsCard title="Total Messages" value="1,234" icon={MessageSquare} />,
    );

    expect(screen.getByText("Total Messages")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders with trend indicator", () => {
    render(
      <StatsCard
        title="Total Messages"
        value="1,234"
        icon={MessageSquare}
        trend={{ value: 12.5, isPositive: true }}
      />,
    );

    expect(screen.getByText("12.50%")).toBeInTheDocument();
  });

  it("renders with subtitle", () => {
    render(
      <StatsCard
        title="Total Messages"
        value="1,234"
        icon={MessageSquare}
        subtitle="This month"
      />,
    );

    expect(screen.getByText("This month")).toBeInTheDocument();
  });
});
