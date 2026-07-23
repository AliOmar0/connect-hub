import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import IntegrationStatus from "./IntegrationStatus";

const connectedIntegration = {
  id: "1",
  channel: "whatsapp" as const,
  is_active: true,
  api_key: "test-key",
  last_verified_at: new Date().toISOString(),
};

describe("IntegrationStatus", () => {
  it("renders integrations title", () => {
    render(<IntegrationStatus />);
    expect(screen.getByText("Integrations")).toBeInTheDocument();
  });

  it("displays an actionable empty state when no data is provided", () => {
    render(<IntegrationStatus />);

    expect(screen.getByText("No integrations configured")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Settings" }),
    ).toBeInTheDocument();
  });

  it("displays connected status correctly", () => {
    render(<IntegrationStatus integrations={[connectedIntegration]} />);

    expect(screen.getByText("WhatsApp Business")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("displays pending status for inactive integrations", () => {
    const integration = {
      ...connectedIntegration,
      is_active: false,
      api_key: null,
      last_verified_at: null,
    };

    render(<IntegrationStatus integrations={[integration]} />);

    expect(screen.getByText("Setup Pending")).toBeInTheDocument();
  });

  it("displays an accessible settings button", () => {
    render(<IntegrationStatus />);

    expect(
      screen.getByRole("button", { name: "Manage integrations" }),
    ).toBeInTheDocument();
  });

  it("provides an accessible configure action for each channel", () => {
    render(<IntegrationStatus integrations={[connectedIntegration]} />);

    expect(
      screen.getByRole("button", { name: "Configure WhatsApp Business" }),
    ).toBeInTheDocument();
  });
});
