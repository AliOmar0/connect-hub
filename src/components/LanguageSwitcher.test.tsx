import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LanguageSwitcher from "./LanguageSwitcher";

const changeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage },
  }),
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the language label for accessibility", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByLabelText("language.label")).toBeInTheDocument();
  });

  it("shows the current language value", () => {
    render(<LanguageSwitcher />);
    // The select trigger renders the English option label.
    expect(screen.getByText("language.english")).toBeInTheDocument();
  });
});
