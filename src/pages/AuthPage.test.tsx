import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import i18n from "@/i18n";
import AuthPage from "./AuthPage";

// --- Controllable mocks -----------------------------------------------------
// `signIn` is a mutable mock so each test can decide how authentication
// resolves (success, credential failure, or never-settling for timeouts).
const signInMock = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, signIn: signInMock, loading: false }),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

// Keep success confirmations from reaching the real toast mechanism.
vi.mock("@/lib/feedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const renderAuthPage = () =>
  render(
    <BrowserRouter>
      <AuthPage />
    </BrowserRouter>,
  );

const VALID_EMAIL = "agent@example.com";
const VALID_PASSWORD = "password123";

/** Fill the credential fields with valid values (no timers involved). */
const fillValidCredentials = () => {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: VALID_EMAIL },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: VALID_PASSWORD },
  });
};

beforeEach(() => {
  signInMock.mockReset();
  mockNavigate.mockReset();
});

afterEach(async () => {
  // Reset language so a switch test never leaks into the next one.
  if (i18n.language !== "en") {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  }
});

describe("AuthPage", () => {
  it("renders login form", () => {
    renderAuthPage();

    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("shows message to contact manager for account", () => {
    renderAuthPage();

    expect(
      screen.getByText("Need an account? Contact your manager."),
    ).toBeInTheDocument();
  });

  // --- Edge cases (Requirements 13.3, 13.4, 13.5, 13.6) ---------------------

  describe("logo-failure fallback", () => {
    it("keeps the bank identity visible via alt text and adjacent brand name even if the logo asset fails", () => {
      renderAuthPage();

      // The logo exposes a non-empty text alternative describing the bank, so
      // a failed image still communicates identity to assistive tech and via
      // the browser's native alt fallback.
      const logos = screen.getAllByAltText("Palestinian Islamic Bank logo");
      expect(logos.length).toBeGreaterThan(0);
      logos.forEach((logo) => expect(logo).toHaveAttribute("alt"));

      // The bank name is rendered as real text next to the logo, so the header
      // identity survives an image load failure without breaking layout.
      const brandNames = screen.getAllByText("PIB Connect");
      expect(brandNames.length).toBeGreaterThan(0);

      // Simulate the asset failing to load; the textual brand identity remains.
      act(() => {
        logos.forEach((logo) => fireEvent.error(logo));
      });
      expect(screen.getAllByText("PIB Connect").length).toBeGreaterThan(0);
    });
  });

  describe("non-revealing authentication error (Req 13.3)", () => {
    it("shows a generic error that hides which credential was wrong and retains the entered email", async () => {
      const user = userEvent.setup();
      // The real signIn would say which field failed; we must not surface that.
      signInMock.mockResolvedValue({
        error: new Error("Invalid password for user agent@example.com"),
      });

      renderAuthPage();
      fillValidCredentials();
      await user.click(screen.getByRole("button", { name: "Sign In" }));

      // The non-revealing message is shown ...
      await waitFor(() => {
        expect(
          screen.getByText(
            "We couldn't sign you in. Check your credentials and try again.",
          ),
        ).toBeInTheDocument();
      });

      // ... and the underlying credential-specific detail (which field / which
      // account was wrong) is never leaked to the UI.
      expect(
        screen.queryByText(/Invalid password for user/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(VALID_EMAIL, "i"))).toBeNull();

      // The non-secret identifier the user typed is retained.
      expect(screen.getByLabelText("Email")).toHaveValue(VALID_EMAIL);
    });
  });

  describe("single in-flight request (Req 13.4)", () => {
    it("permits only one authentication request while one is already in progress", async () => {
      // Never settles, so the request stays in flight for the whole test.
      signInMock.mockImplementation(() => new Promise(() => {}));

      renderAuthPage();
      fillValidCredentials();

      const form = screen
        .getByRole("button", { name: "Sign In" })
        .closest("form") as HTMLFormElement;

      // Two rapid submissions; the second must be ignored.
      fireEvent.submit(form);
      fireEvent.submit(form);

      expect(signInMock).toHaveBeenCalledTimes(1);

      // The submit control reflects the loading state and blocks re-submission.
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Signing in..." }),
        ).toBeDisabled();
      });
      expect(
        screen.getByRole("button", { name: "Signing in..." }),
      ).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("30-second timeout with retry (Req 13.5)", () => {
    it("terminates the loading state and shows a recoverable timeout error after 30s", async () => {
      vi.useFakeTimers();
      try {
        // Never settles on its own; only the timeout can end it.
        signInMock.mockImplementation(() => new Promise(() => {}));

        renderAuthPage();
        fillValidCredentials();

        const form = screen
          .getByRole("button", { name: "Sign In" })
          .closest("form") as HTMLFormElement;
        fireEvent.submit(form);

        // Loading state is active before the timeout elapses.
        expect(
          screen.getByRole("button", { name: "Signing in..." }),
        ).toBeDisabled();

        // Advance the full 30s timeout budget.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });

        // Loading terminates: the submit control is restored ...
        expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();

        // ... and a timeout Error_State with a retry action is presented.
        expect(
          screen.getByText("Sign-in timed out. Please try again."),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /retry/i }),
        ).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("re-issues the authentication request when retry is activated after a timeout", async () => {
      vi.useFakeTimers();
      try {
        signInMock.mockImplementation(() => new Promise(() => {}));

        renderAuthPage();
        fillValidCredentials();

        const form = screen
          .getByRole("button", { name: "Sign In" })
          .closest("form") as HTMLFormElement;
        fireEvent.submit(form);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(signInMock).toHaveBeenCalledTimes(1);

        // Activating retry runs the operation again with the same credentials.
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        });

        expect(signInMock).toHaveBeenCalledTimes(2);
        expect(signInMock).toHaveBeenLastCalledWith(
          VALID_EMAIL,
          VALID_PASSWORD,
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("pre-authentication language switch (Req 13.6)", () => {
    it("exposes a language control before sign-in and updates direction and text on change", async () => {
      renderAuthPage();

      // A language control is available while unauthenticated.
      expect(
        screen.getByRole("combobox", { name: "Language" }),
      ).toBeInTheDocument();

      // Baseline: English / LTR.
      expect(document.documentElement.dir).toBe("ltr");
      expect(
        screen.getByRole("heading", { name: "Welcome back" }),
      ).toBeInTheDocument();

      // Switching language (what the switcher does) updates direction + text.
      await act(async () => {
        await i18n.changeLanguage("ar");
      });

      expect(document.documentElement.dir).toBe("rtl");
      expect(document.documentElement.lang).toBe("ar");
      expect(
        screen.getByRole("heading", { name: "مرحباً بعودتك" }),
      ).toBeInTheDocument();
    });
  });
});
