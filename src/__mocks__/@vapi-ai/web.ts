/**
 * Manual Vitest/Jest mock for @vapi-ai/web.
 * Used in tests because the actual package requires a network install
 * that may not be available in all environments.
 */
import { vi } from "vitest";

const Vapi = vi.fn().mockImplementation(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
  setMuted: vi.fn(),
  isMuted: vi.fn().mockReturnValue(false),
}));

export default Vapi;
