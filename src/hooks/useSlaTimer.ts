// SLA countdown hook for the escalation queue (G28).
import { useEffect, useState } from "react";
import {
  SLA_BUSINESS_HOURS_SECONDS,
  SLA_OUT_OF_HOURS_SECONDS,
} from "@/lib/config";

// Business hours: Sun–Thu 08:00–16:00 (PIB). Adjust as policy dictates.
function isBusinessHours(d = new Date()): boolean {
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const hour = d.getHours();
  const isWorkday = day >= 0 && day <= 4; // Sun–Thu
  return isWorkday && hour >= 8 && hour < 16;
}

export interface SlaState {
  remainingSeconds: number;
  breached: boolean;
  windowSeconds: number;
  elapsedSeconds: number;
}

export function useSlaTimer(startedAt: string | null | undefined): SlaState {
  const window = isBusinessHours()
    ? SLA_BUSINESS_HOURS_SECONDS
    : SLA_OUT_OF_HOURS_SECONDS;

  const compute = (): SlaState => {
    const start = startedAt ? new Date(startedAt).getTime() : Date.now();
    const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const remaining = window - elapsed;
    return {
      remainingSeconds: remaining,
      breached: remaining <= 0,
      windowSeconds: window,
      elapsedSeconds: elapsed,
    };
  };

  const [state, setState] = useState<SlaState>(compute);

  useEffect(() => {
    const id = setInterval(() => setState(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  return state;
}

export function formatCountdown(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}
