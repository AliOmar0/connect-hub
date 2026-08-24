import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@/test-utils/render";
import { axe, toHaveNoViolations } from "jest-axe";
import ComplaintsPage from "./ComplaintsPage";

expect.extend(toHaveNoViolations);

// The App_Shell frame is exercised elsewhere; render only the page body.
vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "test-token" } } }),
      ),
    },
  },
}));

interface Complaint {
  id: string;
  reference_number: string;
  session_id: string | null;
  customer_id: string | null;
  channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  national_id_masked: string | null;
  category: string;
  description: string;
  related_account_masked: string | null;
  preferred_contact: string | null;
  language: string;
  status: string;
  severity?: string;
  location?: string | null;
  atm_identifier?: string | null;
  incident_at_text?: string | null;
  ai_summary?: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const sampleComplaint: Complaint = {
  id: "c-1",
  reference_number: "PIB-2026-AB3K9X",
  session_id: "s-1",
  customer_id: "cust-1",
  channel: "whatsapp",
  customer_name: "Test Customer",
  customer_phone: "0599123456",
  national_id_masked: "*****6789",
  category: "cards",
  description: "The ATM took my card and did not return it.",
  related_account_masked: "****4321",
  preferred_contact: "واتساب",
  language: "ar",
  status: "new",
  severity: "high",
  location: "فرع رام الله",
  atm_identifier: "ATM-114",
  incident_at_text: "من ساعة",
  ai_summary: "احتجاز بطاقة في صراف فرع رام الله",
  context: {},
  created_at: "2026-08-19T10:30:00Z",
  updated_at: "2026-08-19T10:30:00Z",
};

let currentComplaints: Complaint[] = [];
let listSucceeds = true;
let requestedUrls: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  currentComplaints = [];
  listSucceeds = true;
  requestedUrls = [];

  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    // Detail fetch, issued by the dialog once a row is selected.
    if (/\/complaints\/[^/]+$/.test(url)) {
      const complaint = currentComplaints[0];
      return Promise.resolve({
        ok: !!complaint,
        headers: new Headers(),
        json: () => Promise.resolve(complaint),
      } as Response);
    }
    // The listing carries its total match count in a header, which the pager
    // reads to say which slice of the whole it is showing.
    return Promise.resolve({
      ok: listSucceeds,
      headers: new Headers({
        "X-Total-Count": String(currentComplaints.length),
      }),
      json: () => Promise.resolve(currentComplaints),
    } as Response);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderComplaints(complaints: Complaint[] = [], ok = true) {
  currentComplaints = complaints;
  listSucceeds = ok;
  return render(<ComplaintsPage />);
}

describe("ComplaintsPage", () => {
  it("renders the page title", async () => {
    renderComplaints([]);
    expect(
      await screen.findByRole("heading", { name: "Complaints" }),
    ).toBeInTheDocument();
  });

  it("shows the Empty_State when nothing has been filed", async () => {
    renderComplaints([]);
    expect(await screen.findByText("No complaints yet")).toBeInTheDocument();
  });

  it("shows a recoverable Error_State when the backend is unavailable", async () => {
    renderComplaints([], false);
    expect(
      await screen.findByText("Could not load complaints"),
    ).toBeInTheDocument();
  });

  it("lists a complaint with its reference, category and status", async () => {
    renderComplaints([sampleComplaint]);
    expect(await screen.findByText(/PIB-2026-AB3K9X/)).toBeInTheDocument();
    expect(screen.getByText("Cards and ATMs")).toBeInTheDocument();
    expect(screen.getByText("Test Customer")).toBeInTheDocument();
    // Status is labelled, not colour-only.
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("opens the detail dialog with every collected field", async () => {
    renderComplaints([sampleComplaint]);
    fireEvent.click(await screen.findByText("Test Customer"));

    expect(
      await screen.findByRole("dialog", { name: /Complaint details/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(sampleComplaint.description),
    ).toBeInTheDocument();
    // Identifiers are shown in the masked form the backend stored.
    expect(await screen.findByText(/\*+6789/)).toBeInTheDocument();
    expect(await screen.findByText(/\*+4321/)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderComplaints([sampleComplaint]);
    await screen.findByText(/PIB-2026-AB3K9X/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("labels severity in the list, not by colour alone", async () => {
    renderComplaints([sampleComplaint]);
    await screen.findByText(/PIB-2026-AB3K9X/);
    // "High" appears as readable text next to its icon.
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
  });

  it("shows the triage detail the assistant extracted", async () => {
    renderComplaints([sampleComplaint]);
    fireEvent.click(await screen.findByText("Test Customer"));

    await screen.findByRole("dialog", { name: /Complaint details/i });
    expect(await screen.findByText("فرع رام الله")).toBeInTheDocument();
    expect(await screen.findByText("ATM-114")).toBeInTheDocument();
    expect(await screen.findByText("من ساعة")).toBeInTheDocument();
    expect(
      await screen.findByText("احتجاز بطاقة في صراف فرع رام الله"),
    ).toBeInTheDocument();
  });

  it("renders a row written before the severity column existed", async () => {
    // A complaint filed before migration 20260822000000 has no severity. The
    // table must still render it rather than blanking or crashing.
    const legacy = { ...sampleComplaint, severity: undefined };
    renderComplaints([legacy]);
    expect(await screen.findByText(/PIB-2026-AB3K9X/)).toBeInTheDocument();
  });

  it("asks the backend to filter rather than filtering in the browser", async () => {
    // The endpoint caps a page at 200 rows, so filtering after the fetch would
    // hide matches that fell outside that page.
    renderComplaints([sampleComplaint]);
    await screen.findByText(/PIB-2026-AB3K9X/);

    const listCalls = requestedUrls.filter(
      (u) => !/\/complaints\/[^/]+$/.test(u),
    );
    expect(listCalls.length).toBeGreaterThan(0);
    // Unfiltered by default -- paging and ordering are always sent, but no
    // narrowing filter is.
    expect(listCalls[0]).not.toContain("severity=");
    expect(listCalls[0]).not.toContain("status=");
    expect(listCalls[0]).not.toContain("channel=");
    expect(listCalls[0]).not.toContain("search=");
    expect(listCalls[0]).toContain("limit=50");
    expect(listCalls[0]).toContain("offset=0");
  });
});
