// On-chain integers arrive as bigint or string; amounts are atto-GEN.
const ATTO = BigInt(10) ** BigInt(18);

export function toStr(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  return String(v ?? "");
}

export function toNum(v: unknown, fallback = 0): number {
  const n = Number(toStr(v));
  return Number.isFinite(n) ? n : fallback;
}

export function fmtGen(atto: unknown): string {
  try {
    const v = typeof atto === "bigint" ? atto : BigInt(toStr(atto) || "0");
    const whole = v / ATTO;
    const frac = v % ATTO;
    if (frac === BigInt(0)) return `${whole} GEN`;
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    return `${whole}.${fracStr} GEN`;
  } catch {
    return "0 GEN";
  }
}

export function genToAtto(gen: string): bigint {
  const s = String(gen).trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) throw new Error('Enter a GEN amount like "0.5".');
  const [w = "0", f = ""] = s.split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  return BigInt(w || "0") * ATTO + BigInt(frac || "0");
}

export function shortHash(h: unknown, n = 6): string {
  const s = toStr(h);
  if (s.length <= n * 2 + 2) return s;
  return `${s.slice(0, n + 2)}…${s.slice(-n)}`;
}

export function fmtUnix(sec: unknown): string {
  const n = toNum(sec, 0);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtCountdown(targetSec: unknown): string {
  const diff = toNum(targetSec, 0) - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "ready";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

import { getAddress as checksummed, hexToBytes } from "viem";
import { CalldataAddress } from "genlayer-js/types";

export function datetimeLocalToUnix(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/** Normalize an EOA string to checksummed form for Address params.
 *  Throws with a friendly message on invalid input — validated BEFORE
 *  sending so the chain never sees a malformed address. */
export function toChecksumAddress(v: string): `0x${string}` {
  const s = v.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error("Beneficiary must be a 0x address with 40 hex characters.");
  try {
    return checksummed(s);
  } catch {
    throw new Error("Beneficiary address is not valid.");
  }
}

/** Wrap an address for genlayer-js calldata: the encoder only emits the
 *  Address type for CalldataAddress instances — raw strings (checksummed
 *  or not) are encoded as strings and crash the VM. Same class object the
 *  encoder uses, so instanceof always matches. */
export function toCalldataAddress(v: string): CalldataAddress {
  const s = toChecksumAddress(v);
  const bytes = hexToBytes(s);
  if (bytes.length !== 20) throw new Error("Beneficiary address is not valid.");
  return new CalldataAddress(bytes);
}
