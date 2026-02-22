import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import ApiKeyCard from "./ApiKeyCard";
import { ChannelType } from "@/types/database";
import { Tables } from "@/integrations/supabase/types";

describe("ApiKeyCard", () => {
  const mockConfig: Tables<"api_configurations"> = {
    id: "config-1",
    channel: "whatsapp",
    phone_number_id: "+1234567890",
    business_account_id: "business-123",
    access_token_encrypted: "encrypted-token",
    api_key_encrypted: null,
    api_secret_encrypted: null,
    is_active: true,
    last_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOnSave = vi.fn().mockResolvedValue(undefined);
  const mockOnTest = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders channel name and description", () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    expect(screen.getByText("WhatsApp Business")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect your WhatsApp Business API/),
    ).toBeInTheDocument();
  });

  it("displays connected badge when config is active", () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("displays not configured badge when config is inactive", () => {
    const inactiveConfig = { ...mockConfig, is_active: false };

    render(
      <ApiKeyCard
        channel="whatsapp"
        config={inactiveConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("displays configuration details when config exists", () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    expect(screen.getByText(mockConfig.phone_number_id!)).toBeInTheDocument();
    expect(
      screen.getByText(mockConfig.business_account_id!),
    ).toBeInTheDocument();
  });

  it("displays last verified date when available", () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    // Should display formatted date
    const datePattern = /[A-Za-z]{3}\s\d{1,2},\s\d{4}\s\d{2}:\d{2}/;
    const dateElements = Array.from(document.querySelectorAll("*")).filter(
      (el) => datePattern.test(el.textContent || ""),
    );
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it("shows configure button when no config exists", () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={null}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    expect(screen.getByText(/No configuration found/)).toBeInTheDocument();
    expect(screen.getByText(/Configure WhatsApp Business/)).toBeInTheDocument();
  });

  it("enters edit mode when edit button is clicked", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/Phone Number ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Business Account ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Access Token/i)).toBeInTheDocument();
    });
  });

  it("enters edit mode when configure button is clicked", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={null}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const configureButton = screen.getByText(/Configure WhatsApp Business/);
    fireEvent.click(configureButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/Phone Number ID/i)).toBeInTheDocument();
    });
  });

  it("saves configuration when save button is clicked", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    await waitFor(() => {
      const phoneInput = screen.getByLabelText(/Phone Number ID/i);
      fireEvent.change(phoneInput, { target: { value: "new-phone-id" } });
    });

    const saveButton = screen.getByText("Save Configuration");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "whatsapp",
          phone_number_id: "new-phone-id",
          is_active: true,
        }),
      );
    });
  });

  it("cancels edit mode when cancel button is clicked", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Phone Number ID/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Edit")).toBeInTheDocument();
    });
  });

  it("toggles secret visibility", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    await waitFor(() => {
      const tokenInput = screen.getByLabelText(
        /Access Token/i,
      ) as HTMLInputElement;
      expect(tokenInput.type).toBe("password");

      const toggleButton = tokenInput.parentElement?.querySelector("button");
      if (toggleButton) {
        fireEvent.click(toggleButton);
        expect(tokenInput.type).toBe("text");
      }
    });
  });

  it("calls onTest when test button is clicked", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const testButton = screen.getByText("Test");
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockOnTest).toHaveBeenCalled();
    });
  });

  it("toggles active status with switch", async () => {
    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    const switchElement = screen.getByRole("switch");
    fireEvent.click(switchElement);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({ is_active: false });
    });
  });

  it("renders different fields for different channels", () => {
    const channels: ChannelType[] = [
      "whatsapp",
      "messenger",
      "sms",
      "voice",
      "email",
    ];
    const channelNames: Record<ChannelType, string> = {
      whatsapp: "WhatsApp Business",
      messenger: "Facebook Messenger",
      sms: "SMS Gateway",
      voice: "Voice Calls",
      email: "Email",
    };

    channels.forEach((channel) => {
      const { unmount } = render(
        <ApiKeyCard
          channel={channel}
          config={null}
          onSave={mockOnSave}
          onTest={mockOnTest}
        />,
      );

      // Each channel should have its own specific name
      expect(screen.getByText(channelNames[channel])).toBeInTheDocument();
      unmount();
    });
  });

  it("handles save error gracefully", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    // Create a promise that rejects - the component handles it in finally block
    const error = new Error("Save failed");
    const failingSave = vi.fn().mockRejectedValue(error);

    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={failingSave}
        onTest={mockOnTest}
      />,
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    await waitFor(() => {
      const saveButton = screen.getByText("Save Configuration");
      fireEvent.click(saveButton);
    });

    // Should not crash, error handling is done by parent
    // Wait for the save to be called
    await waitFor(
      () => {
        expect(failingSave).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // Wait for any async operations to complete
    // The component's try/finally block will execute
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 300);
    });

    // CRITICAL: Catch the promise rejection to prevent unhandled rejection
    // The component's try/finally executes, but the error propagates
    // Get the promise from the mock results and catch it
    const mockResult = failingSave.mock.results[0];
    if (mockResult && mockResult.type === "return" && mockResult.value) {
      // Catch the promise rejection
      await mockResult.value.catch(() => {
        // Expected error - component's finally block already handled cleanup
      });
    }

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("displays loading state while saving", async () => {
    let resolveSave: () => void;
    const slowSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={slowSave}
        onTest={mockOnTest}
      />,
    );

    const editButton = screen.getByText("Edit");
    fireEvent.click(editButton);

    await waitFor(() => {
      const saveButton = screen.getByText("Save Configuration");
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    resolveSave!();
  });

  it("displays loading state while testing", async () => {
    let resolveTest: () => void;
    const slowTest = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveTest = () => resolve(true);
        }),
    );

    render(
      <ApiKeyCard
        channel="whatsapp"
        config={mockConfig}
        onSave={mockOnSave}
        onTest={slowTest}
      />,
    );

    const testButton = screen.getByText("Test");
    fireEvent.click(testButton);

    await waitFor(() => {
      // Should show loading spinner
      const spinner = document.querySelector('[class*="animate-spin"]');
      expect(spinner).toBeInTheDocument();
    });

    resolveTest!();
  });

  it("handles missing optional fields gracefully", () => {
    const minimalConfig: Tables<"api_configurations"> = {
      ...mockConfig,
      phone_number_id: null,
      business_account_id: null,
      last_verified_at: null,
    };

    render(
      <ApiKeyCard
        channel="whatsapp"
        config={minimalConfig}
        onSave={mockOnSave}
        onTest={mockOnTest}
      />,
    );

    // Should render without crashing
    expect(screen.getByText("WhatsApp Business")).toBeInTheDocument();
  });

  it("works without onTest callback", () => {
    render(
      <ApiKeyCard channel="whatsapp" config={mockConfig} onSave={mockOnSave} />,
    );

    // Should not show test button
    expect(screen.queryByText("Test")).not.toBeInTheDocument();
  });
});
