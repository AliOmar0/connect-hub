import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import i18n from "@/i18n";
import { ThemeProvider } from "./theme-provider";
import ThemeToggle from "./theme-toggle";

function renderToggle(defaultTheme?: "light" | "dark") {
  return render(
    <ThemeProvider defaultTheme={defaultTheme}>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    await i18n.changeLanguage("en");
  });

  it("exposes a non-empty accessible name via i18n", () => {
    renderToggle("light");
    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName("Switch to dark theme");
  });

  it("toggles the dark class on the document root when activated", async () => {
    const user = userEvent.setup();
    renderToggle("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(screen.getByRole("button"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(screen.getByRole("button"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("updates its accessible name to reflect the next action", async () => {
    const user = userEvent.setup();
    renderToggle("light");
    const button = screen.getByRole("button");

    expect(button).toHaveAccessibleName("Switch to dark theme");
    await user.click(button);
    expect(button).toHaveAccessibleName("Switch to light theme");
  });

  it("localizes the accessible name in Arabic", async () => {
    await i18n.changeLanguage("ar");
    renderToggle("light");
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("التبديل إلى المظهر الداكن");
  });
});
