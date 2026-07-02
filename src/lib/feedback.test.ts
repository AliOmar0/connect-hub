// Unit tests for the standardized feedback helper.
//
// Verifies that success and error confirmations are routed through the single
// shared toast mechanism (`sonner`) with the correct message and options, so
// the same condition always produces the same feedback everywhere.
//
// Requirements: 10.3
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared toast mechanism so we can assert routing without rendering.
const successMock = vi.fn(() => "success-id");
const errorMock = vi.fn(() => "error-id");
const dismissMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => successMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
    dismiss: (...args: unknown[]) => dismissMock(...args),
  },
}));

import { notifySuccess, notifyError, dismissFeedback } from "./feedback";

describe("feedback helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("notifySuccess", () => {
    it("routes success confirmations through the shared toast mechanism", () => {
      notifySuccess("Saved successfully");
      expect(successMock).toHaveBeenCalledTimes(1);
      expect(successMock).toHaveBeenCalledWith("Saved successfully", undefined);
      // Success is never reported through the error channel.
      expect(errorMock).not.toHaveBeenCalled();
    });

    it("forwards options (description, duration, id, action)", () => {
      const onClick = vi.fn();
      notifySuccess("Uploaded", {
        description: "Document added to the knowledge base.",
        duration: 4000,
        id: "upload-1",
        action: { label: "View", onClick },
      });
      expect(successMock).toHaveBeenCalledWith("Uploaded", {
        description: "Document added to the knowledge base.",
        duration: 4000,
        id: "upload-1",
        action: { label: "View", onClick },
      });
    });

    it("returns the toast id from the underlying mechanism", () => {
      expect(notifySuccess("done")).toBe("success-id");
    });
  });

  describe("notifyError", () => {
    it("routes error confirmations through the shared toast mechanism", () => {
      notifyError("Could not save");
      expect(errorMock).toHaveBeenCalledTimes(1);
      expect(errorMock).toHaveBeenCalledWith("Could not save", undefined);
      expect(successMock).not.toHaveBeenCalled();
    });

    it("forwards options", () => {
      notifyError("Failed", { description: "Network error", duration: 6000 });
      expect(errorMock).toHaveBeenCalledWith("Failed", {
        description: "Network error",
        duration: 6000,
      });
    });

    it("returns the toast id from the underlying mechanism", () => {
      expect(notifyError("nope")).toBe("error-id");
    });
  });

  describe("dismissFeedback", () => {
    it("dismisses a specific toast by id", () => {
      dismissFeedback("success-id");
      expect(dismissMock).toHaveBeenCalledWith("success-id");
    });

    it("dismisses all toasts when no id is given", () => {
      dismissFeedback();
      expect(dismissMock).toHaveBeenCalledWith(undefined);
    });
  });
});
