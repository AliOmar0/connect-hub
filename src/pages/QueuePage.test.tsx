import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import QueuePage from "./QueuePage";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock("@/hooks/useAuth");

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockQueryClient = { invalidateQueries: vi.fn() };

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => mockQueryClient),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn(() => ({})) })),
    })),
    removeChannel: vi.fn(),
  },
}));

const sampleSession = {
  id: "s-1",
  channel: "whatsapp",
  customer_name: "Test Customer",
  customer_phone: "0599123456",
  last_message: "I need help with account 12345678",
  status: "escalated",
  started_at: new Date().toISOString(),
  wait_time_seconds: 30,
  main_type_id: null,
};

const mutate = vi.fn();

function setup(sessions: unknown[] = [], isLoading = false) {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
  (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: sessions,
    isLoading,
  });
  (useMutation as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate,
    isPending: false,
  });
  (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue(mockQueryClient);
  return render(
    <BrowserRouter>
      <QueuePage />
    </BrowserRouter>,
  );
}

describe("QueuePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the queue title", () => {
    setup([]);
    expect(screen.getByText("queue.title")).toBeInTheDocument();
  });

  it("shows the empty state when there are no sessions", () => {
    setup([]);
    expect(screen.getByText("queue.empty")).toBeInTheDocument();
  });

  it("renders a card with masked customer details", () => {
    setup([sampleSession]);
    expect(screen.getByText("Test Customer")).toBeInTheDocument();
    // Raw account/phone digits must not be shown verbatim.
    expect(screen.queryByText(/12345678/)).not.toBeInTheDocument();
  });

  it("calls the status mutation when Accept is clicked", () => {
    setup([sampleSession]);
    fireEvent.click(screen.getByText("queue.accept"));
    expect(mutate).toHaveBeenCalledWith({ id: "s-1", status: "active" });
  });

  it("calls the status mutation when Offer callback is clicked", () => {
    setup([sampleSession]);
    fireEvent.click(screen.getByText("queue.offerCallback"));
    expect(mutate).toHaveBeenCalledWith({ id: "s-1", status: "waiting" });
  });
});
