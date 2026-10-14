// Single error formatter for the whole app. Wallets, viem and the SDK
// throw three shapes: Error, EIP-1193 objects ({code,message}), and plain
// strings. Naive String(err) on an object prints "[object Object]" — this
// unwraps every shape into something a human can act on.

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message || String(e);
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const details =
      typeof o.details === "string"
        ? o.details
        : Array.isArray((o as { metaMessages?: unknown }).metaMessages)
          ? String((o as { metaMessages: unknown[] }).metaMessages[0] ?? "")
          : "";
    const core =
      typeof o.shortMessage === "string"
        ? o.shortMessage
        : typeof o.message === "string"
          ? o.message
          : "";
    const code = o.code !== undefined ? ` (code ${String(o.code)})` : "";
    const combined = [core, details].filter(Boolean).join(" — ");
    if (combined) {
      const withCode = combined + code;
      return withCode.length > 240 ? withCode.slice(0, 240) + "…" : withCode;
    }
    try {
      const s = JSON.stringify(o);
      return s.length > 240 ? s.slice(0, 240) + "…" : s;
    } catch {
      return "Unknown error.";
    }
  }
  return "Unknown error.";
}
