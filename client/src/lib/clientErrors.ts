import { MAX_CLIENT_ERROR_REPORTS } from "../constants";

const reportedClientErrors = new Set<string>();
let clientErrorReportCount = 0;

export function installClientErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => {
    reportClientError({
      source: "window.error",
      name: event.error instanceof Error ? event.error.name : "Error",
      message: event.message || (event.error instanceof Error ? event.error.message : "Script error"),
      line: event.lineno,
      column: event.colno,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportClientError({
      source: "unhandledrejection",
      name: reason instanceof Error ? reason.name : "UnhandledRejection",
      message: reason instanceof Error ? reason.message : "Unhandled promise rejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function reportClientError(input: { source: string; name: string; message: string; line?: number; column?: number }): void {
  if (clientErrorReportCount >= MAX_CLIENT_ERROR_REPORTS) {
    return;
  }

  const payload = {
    source: redactClientText(input.source, 80),
    name: redactClientText(input.name, 80),
    message: redactClientText(input.message, 240),
    path: window.location.pathname,
    line: Number.isFinite(input.line) ? input.line : undefined,
    column: Number.isFinite(input.column) ? input.column : undefined,
  };
  const fingerprint = `${payload.source}:${payload.name}:${payload.message}:${payload.path}`;
  if (reportedClientErrors.has(fingerprint)) {
    return;
  }

  reportedClientErrors.add(fingerprint);
  clientErrorReportCount += 1;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon("/client-error", new Blob([body], { type: "application/json" }));
    if (sent) {
      return;
    }
  }

  void fetch("/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function redactClientText(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/([?&](?:token|password|inviteCode|code|state|linuxdoPending|linuxdoError)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, maxLength);
}
