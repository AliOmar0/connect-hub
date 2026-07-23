/**
 * Manual mock for @vapi-ai/web.
 * Used in dev and test environments when the npm package is not installed.
 */
class VapiMock {
  constructor(_token?: string, _apiBase?: string) {}

  async start(..._args: unknown[]): Promise<unknown> {
    console.log("[VapiMock] start called", ..._args);
    return undefined;
  }

  stop(): void {
    console.log("[VapiMock] stop called");
  }

  send(..._args: unknown[]): void {
    console.log("[VapiMock] send called", ..._args);
  }

  on(event: string, _callback: (...args: unknown[]) => void): this {
    console.log("[VapiMock] on event listener added:", event);
    return this;
  }

  off(_event: string, _callback: (...args: unknown[]) => void): this {
    return this;
  }

  removeAllListeners(): this {
    return this;
  }

  setMuted(_muted: boolean): void {}

  isMuted(): boolean {
    return false;
  }
}

export default VapiMock;
