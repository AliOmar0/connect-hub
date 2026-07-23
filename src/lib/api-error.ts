export class ApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

async function readErrorDetail(
  response: Response,
): Promise<string | undefined> {
  try {
    const body = await response.clone().json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.message === "string") return body.message;
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) return text.trim();
    } catch {
      // The status and fallback message still provide a useful error.
    }
  }
  return undefined;
}

export async function requireOk(
  response: Response,
  fallbackMessage: string,
): Promise<Response> {
  if (response.ok) return response;
  throw new ApiResponseError(
    fallbackMessage,
    response.status,
    await readErrorDetail(response),
  );
}
