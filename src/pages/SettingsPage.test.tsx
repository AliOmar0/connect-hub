import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import SettingsPage from "./SettingsPage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { notifySuccess, notifyError } from "@/lib/feedback";
import type { Profile } from "@/types/database";

vi.mock("@/hooks/useAuth", async () => {
  const actual = await vi.importActual("@/hooks/useAuth");
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
      })),
    },
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Route success/error confirmations through spies instead of the real toast so
// we can assert the confirmation mechanism (Requirements 19.3 / 19.4).
vi.mock("@/lib/feedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

// --- Controllable Supabase query builder ------------------------------------
// SettingsPage awaits a small set of Supabase query chains. This lightweight
// builder lets each test drive what those chains resolve to:
//   - fetchProfile:  from("profiles").select().eq().single()  -> { data: profile }
//   - saveProfile:   from("profiles").update().eq()           -> profileUpdate()
//   - list fetches:  select()/order()                          -> { data: [] }
let profileData: Partial<Profile> | null = null;
let profileUpdate: () => Promise<{ error: unknown }> = () =>
  Promise.resolve({ error: null });
let updateCallCount = 0;

function makeBuilder() {
  let isUpdate = false;
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    update: vi.fn(() => {
      isUpdate = true;
      updateCallCount += 1;
      return builder;
    }),
    single: vi.fn(() => Promise.resolve({ data: profileData, error: null })),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: profileData, error: null }),
    ),
    // Awaiting the builder resolves the update result on the save path, or an
    // empty list on the read paths (fetchConfigs / fetchSessionTypes).
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const settle = isUpdate
        ? profileUpdate()
        : Promise.resolve({ data: [], error: null });
      return settle.then(onFulfilled, onRejected);
    },
  };
  return builder;
}

const SAMPLE_PROFILE: Partial<Profile> = {
  id: "profile-1",
  user_id: "user-1",
  first_name: "Layla",
  last_name: "Hassan",
  email: "layla@example.com",
  phone: "+970591234567",
  department: "Support",
  avatar_url: null,
};

const notifySuccessMock = notifySuccess as unknown as ReturnType<typeof vi.fn>;
const notifyErrorMock = notifyError as unknown as ReturnType<typeof vi.fn>;

describe("SettingsPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    // Reset builder control state to safe defaults.
    profileData = null;
    profileUpdate = () => Promise.resolve({ error: null });
    updateCallCount = 0;

    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: "user-1", email: "test@example.com" },
      userRole: "admin",
      loading: false,
    });

    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() =>
      makeBuilder(),
    );
  });

  afterEach(() => {
    // The ThemeProvider toggles `.dark` on the document root and persists the
    // choice; clear both so theme tests don't leak into one another.
    document.documentElement.classList.remove("dark");
    try {
      window.localStorage.removeItem("connect-hub-theme");
    } catch {
      /* ignore */
    }
  });

  it("renders settings page", async () => {
    const { container } = render(<SettingsPage />, { queryClient });

    await waitFor(
      () => {
        // Component should render - verify it doesn't crash
        expect(container.firstChild).toBeTruthy();
        // Verify supabase was called
        expect(supabase.from).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  it("fetches user profile", async () => {
    render(<SettingsPage />, { queryClient });

    await waitFor(
      () => {
        // Component should attempt to fetch profile
        expect(supabase.from).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  // --- Labeled and described setting groups (Requirements 19.1, 19.2) -------

  describe("labeled and described setting groups", () => {
    it("groups related settings into clearly labeled sections (Req 19.1)", async () => {
      render(<SettingsPage />, { queryClient });

      // A tablist groups the settings into named sections.
      const tablist = await screen.findByRole("tablist");
      expect(tablist).toBeInTheDocument();

      // Every section is a tab with a clear, non-empty accessible label.
      const expectedTabs = [
        "Integrations",
        "Notifications",
        "Security",
        "Appearance",
        "General",
        "Session Types",
        "Voice Testing",
      ];
      for (const name of expectedTabs) {
        const tab = screen.getByRole("tab", { name: new RegExp(name, "i") });
        expect(tab).toBeInTheDocument();
        expect(tab.textContent?.trim()).not.toBe("");
      }
    });

    it("provides programmatically associated descriptions for setting controls (Req 19.2)", async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { queryClient });

      // Notification toggles: the accessible label alone ("Email Notifications")
      // doesn't state the effect, so a description is associated via
      // aria-describedby and rendered as real text.
      await user.click(screen.getByRole("tab", { name: /Notifications/i }));

      const emailSwitch = await screen.findByRole("switch", {
        name: "Email Notifications",
      });
      const describedBy = emailSwitch.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const description = document.getElementById(describedBy as string);
      expect(description?.textContent).toBe("Receive notifications via email");

      // Appearance theme group: labeled and described for assistive tech.
      await user.click(screen.getByRole("tab", { name: /Appearance/i }));
      const themeGroup = await screen.findByRole("radiogroup");
      expect(themeGroup).toHaveAttribute("aria-labelledby", "theme-label");
      const themeDescribedBy = themeGroup.getAttribute("aria-describedby");
      expect(themeDescribedBy).toBeTruthy();
      expect(
        document.getElementById(themeDescribedBy as string)?.textContent,
      ).toBe(
        "Switch between the light and dark themes across the whole dashboard.",
      );
    });
  });

  // --- Theme switching and apply timing (Requirements 19.5, 19.7) -----------

  describe("theme switching", () => {
    it("provides light and dark theme options (Req 19.5)", async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { queryClient });

      await user.click(screen.getByRole("tab", { name: /Appearance/i }));

      expect(
        await screen.findByRole("radio", { name: "Light" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
    });

    it("applies the selected theme to the dashboard without a reload (Req 19.7)", async () => {
      const user = userEvent.setup();
      render(<SettingsPage />, { queryClient });

      await user.click(screen.getByRole("tab", { name: /Appearance/i }));

      // Baseline: light theme, so the document root has no `.dark` class.
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // Selecting Dark applies immediately via the class strategy (no reload).
      await user.click(screen.getByRole("radio", { name: "Dark" }));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true);
      });

      // Switching back to Light removes the dark token set just as promptly.
      await user.click(screen.getByRole("radio", { name: "Light" }));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      });
    });
  });

  // --- Save success / failure retention (Requirements 19.3, 19.4) -----------

  describe("saving profile settings", () => {
    it("confirms a successful save (Req 19.3)", async () => {
      profileData = { ...SAMPLE_PROFILE };
      const user = userEvent.setup();
      render(<SettingsPage />, { queryClient });

      await user.click(screen.getByRole("tab", { name: /General/i }));

      // Wait for the loaded profile form.
      const firstName = await screen.findByLabelText("First Name");
      expect(firstName).toHaveValue("Layla");

      await user.click(screen.getByRole("button", { name: /Save Changes/i }));

      await waitFor(() => {
        expect(notifySuccessMock).toHaveBeenCalledWith(
          "Profile updated successfully",
        );
      });
      expect(notifyErrorMock).not.toHaveBeenCalled();
    });

    it("shows a recoverable error and retains entered values on failure (Req 19.4)", async () => {
      profileData = { ...SAMPLE_PROFILE };
      // The save fails; previously saved settings are only refreshed on
      // success, so they are left unchanged and the entered value is retained.
      profileUpdate = () =>
        Promise.resolve({ error: { message: "Network unreachable" } });

      const user = userEvent.setup();
      render(<SettingsPage />, { queryClient });

      await user.click(screen.getByRole("tab", { name: /General/i }));

      const firstName = await screen.findByLabelText("First Name");
      await user.clear(firstName);
      await user.type(firstName, "Edited Name");

      await user.click(screen.getByRole("button", { name: /Save Changes/i }));

      // A human-readable error with a retry recovery action is surfaced.
      await waitFor(() => {
        expect(notifyErrorMock).toHaveBeenCalled();
      });
      const [message, options] = notifyErrorMock.mock.calls[0];
      expect(message).toBe("Failed to save changes");
      expect(options).toEqual(
        expect.objectContaining({
          description: "Network unreachable",
          action: expect.objectContaining({ label: "Retry" }),
        }),
      );

      // The user's entered value is retained (not discarded) after the failure.
      expect(screen.getByLabelText("First Name")).toHaveValue("Edited Name");
      // No success confirmation was shown, so saved settings stayed unchanged.
      expect(notifySuccessMock).not.toHaveBeenCalled();
    });
  });

  // --- Loading state + duplicate-submit prevention (Requirement 19.6) -------

  describe("save loading state and duplicate submission", () => {
    it("shows a loading state and prevents duplicate submission while in flight (Req 19.6)", async () => {
      profileData = { ...SAMPLE_PROFILE };
      // Never settles, so the save stays in flight for the whole test.
      profileUpdate = () => new Promise<{ error: unknown }>(() => {});

      const user = userEvent.setup();
      render(<SettingsPage />, { queryClient });

      await user.click(screen.getByRole("tab", { name: /General/i }));
      await screen.findByLabelText("First Name");

      const saveButton = screen.getByRole("button", { name: /Save Changes/i });

      // Two rapid submissions; the second must be ignored while in flight.
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);

      // A loading Component_State is presented on the save control.
      await waitFor(() => {
        const loadingButton = screen.getByRole("button", {
          name: /Saving/i,
        });
        expect(loadingButton).toBeDisabled();
        expect(loadingButton).toHaveAttribute("aria-busy", "true");
      });

      // Duplicate submission is prevented: the save reached Supabase once.
      expect(updateCallCount).toBe(1);
    });
  });
});
