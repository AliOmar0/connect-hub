import { vi } from "vitest";
import { User, Session } from "@supabase/supabase-js";
import { AppRole } from "@/types/database";

// Mock Supabase client
export const mockSupabaseClient = {
  auth: {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    count: vi.fn(),
  })),
  rpc: vi.fn(),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(() => ({
      unsubscribe: vi.fn(),
    })),
  })),
};

// Mock user data
export const createMockUser = (overrides?: Partial<User>): User => ({
  id: "123e4567-e89b-12d3-a456-426614174000",
  email: "test@example.com",
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  confirmation_sent_at: null,
  recovery_sent_at: null,
  email_change_sent_at: null,
  new_email: null,
  invited_at: null,
  action_link: null,
  email_change: null,
  phone: null,
  phone_confirmed_at: null,
  phone_change: null,
  phone_change_token: null,
  confirmed_at: new Date().toISOString(),
  email_change_confirm_status: 0,
  banned_until: null,
  is_anonymous: false,
  ...overrides,
} as User);

// Mock session data
export const createMockSession = (user?: User): Session => ({
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: user || createMockUser(),
});

// Mock auth context
export const createMockAuthContext = (overrides?: {
  user?: User | null;
  userRole?: AppRole | null;
  loading?: boolean;
}) => ({
  user: overrides?.user ?? createMockUser(),
  session: overrides?.user ? createMockSession(overrides.user) : null,
  userRole: overrides?.userRole ?? "admin",
  loading: overrides?.loading ?? false,
  signIn: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
  signUp: vi.fn().mockResolvedValue({
    data: { user: createMockUser(), session: createMockSession() },
    error: null,
  }),
});

// Mock useAuth hook
export const mockUseAuth = (overrides?: {
  user?: User | null;
  userRole?: AppRole | null;
  loading?: boolean;
}) => {
  const { vi } = require("vitest");
  return vi.fn(() => createMockAuthContext(overrides));
};

// Mock useNavigate
export const mockNavigate = vi.fn();
export const mockUseNavigate = () => mockNavigate;

// Mock useQuery
export const mockUseQuery = (data: unknown, isLoading = false, error = null) => {
  const { vi } = require("vitest");
  return vi.fn(() => ({
    data,
    isLoading,
    isError: !!error,
    error,
    refetch: vi.fn(),
  }));
};

// Mock useMutation
export const mockUseMutation = (mutateFn?: () => Promise<unknown>) => {
  const { vi } = require("vitest");
  return vi.fn(() => ({
    mutate: mutateFn || vi.fn(),
    mutateAsync: mutateFn || vi.fn().mockResolvedValue({}),
    isLoading: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }));
};

