# Testing Guide

This document provides guidelines for writing and running tests in this project.

## Overview

We use [Vitest](https://vitest.dev/) as our test runner and [React Testing Library](https://testing-library.com/react) for component testing. Our goal is to maintain **95% test coverage** across all metrics (statements, branches, functions, lines).

## Test Structure

### Test File Naming

- Test files should be named `*.test.tsx` or `*.test.ts`
- Place test files next to the component/function they test
- Example: `Button.test.tsx` next to `Button.tsx`

### Test Organization

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test-utils/render";
import Component from "./Component";

describe("Component", () => {
  beforeEach(() => {
    // Setup code
  });

  it("should render correctly", () => {
    // Test implementation
  });
});
```

## Writing Tests

### Component Tests

Use React Testing Library's `render` function from our test utilities:

```typescript
import { render, screen } from "@/test-utils/render";
import MyComponent from "./MyComponent";

it("renders component", () => {
  render(<MyComponent />);
  expect(screen.getByText("Hello")).toBeInTheDocument();
});
```

### Testing with Providers

Our `render` utility automatically wraps components with necessary providers (QueryClient, Router, Auth). For custom providers:

```typescript
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();
render(<Component />, { queryClient });
```

### Mocking

Use Vitest's `vi.mock()` for mocking:

```typescript
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "1", email: "test@example.com" },
    userRole: "admin",
  }),
}));
```

### Testing Async Operations

Use `waitFor` for async operations:

```typescript
import { waitFor } from "@testing-library/react";

await waitFor(() => {
  expect(screen.getByText("Loaded")).toBeInTheDocument();
});
```

### Testing User Interactions

Use `@testing-library/user-event`:

```typescript
import userEvent from "@testing-library/user-event";

const user = userEvent.setup();
await user.click(screen.getByRole("button"));
```

## Test Utilities

We provide test utilities in `src/test-utils/`:

- `render.tsx` - Custom render function with providers
- `mocks.ts` - Centralized mock data and functions
- `helpers.ts` - Test helper functions
- `fixtures.ts` - Test data fixtures

## Running Tests

### Development

```bash
# Watch mode
npm run test

# UI mode
npm run test:ui
```

### CI/Production

```bash
# Run once
npm run test:run

# With coverage
npm run test:coverage

# CI mode (with thresholds)
npm run test:coverage:ci
```

## Coverage Requirements

- **Statements**: 95%
- **Branches**: 95%
- **Functions**: 95%
- **Lines**: 95%

Coverage is enforced in CI. PRs that don't meet the threshold will be blocked.

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the component does, not how it does it
2. **Use Accessible Queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Keep Tests Simple**: One assertion per test when possible
4. **Use Descriptive Names**: Test names should describe what is being tested
5. **Mock External Dependencies**: Mock API calls, external libraries, etc.
6. **Clean Up**: Use `beforeEach`/`afterEach` to reset state between tests

## Common Patterns

### Testing Forms

```typescript
const user = userEvent.setup();
const input = screen.getByLabelText("Email");
await user.type(input, "test@example.com");
await user.click(screen.getByRole("button", { name: "Submit" }));
```

### Testing Loading States

```typescript
const { rerender } = render(<Component loading={true} />);
expect(screen.getByText("Loading...")).toBeInTheDocument();

rerender(<Component loading={false} />);
expect(screen.getByText("Content")).toBeInTheDocument();
```

### Testing Error States

```typescript
vi.mock("@/api", () => ({
  fetchData: vi.fn().mockRejectedValue(new Error("API Error")),
}));

render(<Component />);
await waitFor(() => {
  expect(screen.getByText("Error occurred")).toBeInTheDocument();
});
```

## Troubleshooting

### Tests Failing in CI but Passing Locally

- Check Node.js version matches CI
- Ensure all dependencies are installed (`npm ci`)
- Check for timing issues with async operations

### Coverage Not Meeting Threshold

- Review coverage report: `npm run test:coverage`
- Add tests for uncovered branches
- Consider if some code paths are truly unreachable

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
