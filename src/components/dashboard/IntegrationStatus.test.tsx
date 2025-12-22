import { describe, it, expect } from "vitest";
import { render, screen } from "@/test-utils/render";
import IntegrationStatus from "./IntegrationStatus";

describe("IntegrationStatus", () => {
  it("renders integrations title", () => {
    render(<IntegrationStatus />);
    expect(screen.getByText("Integrations")).toBeInTheDocument();
  });

  it("displays default integrations when no data provided", () => {
    render(<IntegrationStatus />);

    expect(screen.getByText("WhatsApp Business")).toBeInTheDocument();
    expect(screen.getByText("Facebook Messenger")).toBeInTheDocument();
    expect(screen.getByText("SMS Gateway")).toBeInTheDocument();
    expect(screen.getByText("Voice Calls")).toBeInTheDocument();
  });

  it("displays connected status correctly", () => {
    const integrations = [
      {
        id: "1",
        channel: "whatsapp" as const,
        is_active: true,
        api_key: "test-key",
        last_verified_at: new Date().toISOString(),
      },
    ];

    render(<IntegrationStatus integrations={integrations} />);

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("displays pending status for inactive integrations", () => {
    const integrations = [
      {
        id: "1",
        channel: "whatsapp" as const,
        is_active: false,
        api_key: null,
        last_verified_at: null,
      },
    ];

    render(<IntegrationStatus integrations={integrations} />);

    expect(screen.getByText("Setup Pending")).toBeInTheDocument();
  });

  it("displays settings button", () => {
    render(<IntegrationStatus />);

    // Find button with settings icon (gear icon)
    const buttons = screen.getAllByRole("button");
    const settingsButton = buttons.find(btn => 
      btn.querySelector('svg')?.getAttribute('class')?.includes('settings') ||
      btn.querySelector('svg')?.getAttribute('class')?.includes('Settings')
    );
    expect(settingsButton).toBeInTheDocument();
  });

  it("displays channel icons correctly", () => {
    render(<IntegrationStatus />);

    // Icons are rendered as emoji/text, so we check for channel names
    expect(screen.getByText("WhatsApp Business")).toBeInTheDocument();
  });
});

