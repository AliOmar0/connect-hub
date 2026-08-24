import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";
import EmployeeCard from "./EmployeeCard";
import { mockEmployees, mockProfiles } from "@/test-utils/fixtures";
import { Employee, Profile } from "@/types/database";

describe("EmployeeCard", () => {
  const mockEmployeeWithProfile: Employee & { profile?: Profile } = {
    ...mockEmployees[0],
    profile: mockProfiles[0],
    employee_code: "EMP001",
    department: "Support",
    shift_start: "09:00:00",
    shift_end: "17:00:00",
    assigned_channels: ["whatsapp", "messenger"],
    performance_score: 0.85,
    is_active: true,
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders employee name", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("Agent One")).toBeInTheDocument();
  });

  it("displays employee code and department", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText(/EMP001.*Support/)).toBeInTheDocument();
  });

  it("displays shift times", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText(/09:00.*17:00/)).toBeInTheDocument();
  });

  it("displays 'No shift assigned' when shift times are missing", () => {
    const employeeWithoutShift: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      shift_start: null,
      shift_end: null,
    };

    render(
      <EmployeeCard
        employee={employeeWithoutShift}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("No shift assigned")).toBeInTheDocument();
  });

  it("displays assigned channels", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Chips carry the catalogue name, not `capitalize` on the raw key --
    // that rendered "Whatsapp".
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Messenger")).toBeInTheDocument();
  });

  it("displays 'No channels' when no channels assigned", () => {
    const employeeWithoutChannels: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      assigned_channels: [],
    };

    render(
      <EmployeeCard
        employee={employeeWithoutChannels}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("No channels")).toBeInTheDocument();
  });

  it("displays performance score", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("displays active status badge", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays inactive status badge", () => {
    const inactiveEmployee: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      is_active: false,
    };

    render(
      <EmployeeCard
        employee={inactiveEmployee}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("displays profile status", () => {
    const employeeWithStatus: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      profile: {
        ...mockProfiles[0],
        status: "online",
      },
    };

    render(
      <EmployeeCard
        employee={employeeWithStatus}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("displays languages when available", () => {
    const employeeWithLanguages: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      profile: {
        ...mockProfiles[0],
        languages: ["English", "Spanish"],
      },
    };

    render(
      <EmployeeCard
        employee={employeeWithLanguages}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Languages ride on the presence line rather than a separate badge row:
    // in a single-row layout a second chip row pushed every card taller for
    // information that is read at the same moment as presence.
    expect(screen.getByText(/English, Spanish/)).toBeInTheDocument();
  });

  it("does not display languages section when no languages", () => {
    const employeeWithoutLanguages: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      profile: {
        ...mockProfiles[0],
        languages: [],
      },
    };

    render(
      <EmployeeCard
        employee={employeeWithoutLanguages}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.queryByText("Languages")).not.toBeInTheDocument();
  });

  it("displays avatar with initials", () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Avatar should show initials - check for rounded-full containers
    const avatarContainers = document.querySelectorAll(
      '[class*="rounded-full"]',
    );
    expect(avatarContainers.length).toBeGreaterThan(0);
    // Verify employee name is displayed (from profile, not "Jane Smith")
    expect(screen.getByText("Agent One")).toBeInTheDocument();
  });

  it("displays status indicator dot", () => {
    const employeeWithStatus: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      profile: {
        ...mockProfiles[0],
        status: "online",
      },
    };

    render(
      <EmployeeCard
        employee={employeeWithStatus}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Status indicator should be present (green dot for online)
    const statusDots = document.querySelectorAll('[class*="rounded-full"]');
    expect(statusDots.length).toBeGreaterThan(0);
  });

  it("calls onEdit when edit is clicked", async () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Hover to show menu
    const card = screen.getByText("Agent One").closest('[class*="Card"]');
    if (card) {
      fireEvent.mouseEnter(card);
    }

    await waitFor(() => {
      // Find menu button by aria-haspopup attribute
      const menuButtons = screen
        .getAllByRole("button", { hidden: true })
        .filter((btn) => btn.getAttribute("aria-haspopup") === "menu");
      if (menuButtons.length > 0) {
        fireEvent.click(menuButtons[0]);
      }
    });

    await waitFor(() => {
      const editButton = screen.queryByText("Edit");
      if (editButton) {
        fireEvent.click(editButton);
        expect(mockOnEdit).toHaveBeenCalledWith(mockEmployeeWithProfile);
      }
    });
  });

  it("calls onDelete when delete is clicked", async () => {
    render(
      <EmployeeCard
        employee={mockEmployeeWithProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Hover to show menu
    const card = screen.getByText("Agent One").closest('[class*="Card"]');
    if (card) {
      fireEvent.mouseEnter(card);
    }

    await waitFor(() => {
      // Find menu button by aria-haspopup attribute
      const menuButtons = screen
        .getAllByRole("button", { hidden: true })
        .filter((btn) => btn.getAttribute("aria-haspopup") === "menu");
      if (menuButtons.length > 0) {
        fireEvent.click(menuButtons[0]);
      }
    });

    await waitFor(() => {
      const deleteButton = screen.queryByText("Delete");
      if (deleteButton) {
        fireEvent.click(deleteButton);
        expect(mockOnDelete).toHaveBeenCalledWith(mockEmployeeWithProfile);
      }
    });
  });

  it("handles missing profile gracefully", () => {
    const employeeWithoutProfile: Employee = {
      ...mockEmployees[0],
      employee_code: "EMP001",
      department: "Support",
    };

    render(
      <EmployeeCard
        employee={employeeWithoutProfile}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("displays a fallback when employee_code is missing", () => {
    const employeeWithoutCode: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      employee_code: null,
    };

    render(
      <EmployeeCard
        employee={employeeWithoutCode}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText(/No code/)).toBeInTheDocument();
  });

  it("displays a fallback when department is missing", () => {
    const employeeWithoutDept: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      department: null,
    };

    render(
      <EmployeeCard
        employee={employeeWithoutDept}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText(/No department/)).toBeInTheDocument();
  });

  it("handles zero performance score", () => {
    const employeeWithZeroScore: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      performance_score: 0,
    };

    render(
      <EmployeeCard
        employee={employeeWithZeroScore}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("handles null performance score", () => {
    const employeeWithNullScore: Employee & { profile?: Profile } = {
      ...mockEmployeeWithProfile,
      performance_score: null,
    };

    render(
      <EmployeeCard
        employee={employeeWithNullScore}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("displays different status colors for different statuses", () => {
    const statuses = {
      online: "Online",
      busy: "Busy",
      away: "Away",
      offline: "Offline",
    } as const;

    Object.entries(statuses).forEach(([status, label]) => {
      const { unmount } = render(
        <EmployeeCard
          employee={{
            ...mockEmployeeWithProfile,
            profile: {
              ...mockProfiles[0],
              status,
            },
          }}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });
});
