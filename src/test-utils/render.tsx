/* eslint-disable react-refresh/only-export-components */
import { ReactElement } from "react";
import { User } from "@supabase/supabase-js";
import { render as rtlRender, RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { vi } from "vitest";

// Default mock auth value
const mockAuthValue = {
  user: { id: "user-1", email: "test@example.com" } as unknown as User,
  session: null,
  userRole: "admin" as const,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

// Create a test query client with default options
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
}

const AllTheProviders = ({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient?: QueryClient;
}) => {
  const client = queryClient || createTestQueryClient();

  return (
    <QueryClientProvider client={client}>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider mockState={mockAuthValue}>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const customRender = (ui: ReactElement, options?: CustomRenderOptions) => {
  const { queryClient, ...renderOptions } = options || {};

  return rtlRender(ui, {
    wrapper: (props) => (
      <AllTheProviders {...props} queryClient={queryClient} />
    ),
    ...renderOptions,
  });
};

// Re-export everything
export * from "@testing-library/react";
export { customRender as render };
