// Masking helpers so the agent UI never shows raw PII (G28, "Respect safe outputs").
// Person 1 returns already-masked summaries; this is defense-in-depth for anything
// rendered directly from transcripts.

// Mask all but the last `visible` characters of a digit run.
export function maskDigits(value: string, visible = 4): string {
  return value.replace(/\d{5,}/g, (match) => {
    const tail = match.slice(-visible);
    return "•".repeat(Math.max(0, match.length - visible)) + tail;
  });
}

// Mask emails to first char + domain.
export function maskEmail(value: string): string {
  return value.replace(
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)/g,
    (_m, first, domain) => `${first}•••${domain}`,
  );
}

// Mask common OTP/account patterns in free text before display.
export function maskText(value: string | null | undefined): string {
  if (!value) return "";
  let out = maskDigits(value);
  out = maskEmail(out);
  return out;
}
