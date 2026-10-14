import { NextResponse } from "next/server";
import { CONTRACT_ADDRESS } from "@/lib/config";

// Slim consensus trail per workflow, sourced from the Studio explorer API
// (server-side: no browser CORS issue). Display-only: the method is matched
// at the calldata ASCII tail and the workflow id as a standalone token —
// good enough for a UI trail, never used for consensus.
const EXPLORER_API = "https://explorer-studio.genlayer.com/api/transactions";
const CACHE_MS = 60_000;

export interface SlimTx {
  hash: string;
  kind: string;
  method: string | null;
  status: string;
  exec: string | null;
  consensus: "accepted" | "undetermined" | null;
  agree: number;
  disagree: number;
  idle: number;
  rotations: number;
  appealed: boolean;
  time: string;
  value: string;
  rounds: { exec: string | null; vote: string | null }[];
  proposal: { compliant: boolean | null; severity: number | null; violated: string[] | null; reason: string | null } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fullCache: { t: number; list: any[] } | null = null;

const METHODS = [
  "publish_charter",
  "submit_proposal",
  "review_proposal",
  "open_appeal",
  "resolve_appeal",
  "execute_proposal",
  "cancel_proposal",
  "fund_treasury",
];

function asciiText(b64: string): string {
  try {
    return Buffer.from(b64, "base64").toString("latin1").replace(/[^\x20-\x7e]/g, " ");
  } catch {
    return "";
  }
}

function methodOf(b64: string | null): string | null {
  if (!b64) return null;
  const tail = asciiText(b64).trimEnd();
  for (const m of METHODS) {
    if (tail.endsWith(m)) return m;
  }
  return null;
}

/** Parse the FIRST positional arg (workflow/proposal id) structurally:
 *  `args` + ULEB(array) + typed elements. The old ASCII-split heuristic
 *  broke whenever the string length byte was printable (ids of length
 *  4–15 glue onto the id, e.g. `lprop-clean-01`). */
function firstArgOf(b64: string | null): string | null {
  if (!b64) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  const marker = Buffer.from("args", "utf8");
  const mi = buf.indexOf(marker);
  if (mi < 0) return null;
  const [n, pos] = readUleb(buf, mi + marker.length);
  if (n % 8 !== 5) return null; // not an array
  if (Math.floor(n / 8) < 1) return null;
  const [m, next] = readUleb(buf, pos);
  if (m % 8 !== 4) return null; // first element not a string
  const len = Math.floor(m / 8);
  if (len <= 0 || len > 200 || next + len > buf.length) return null;
  return buf.toString("utf8", next, next + len);
}

// --- Leader-proposal decoder (GenVM calldata map, flat keys) ---------------
// Values start with a ULEB128 number: low 3 bits = type (0 atom, 1 uint,
// 4 string), remaining bits = value/length. Keys are FastStrings (ULEB128
// length + bytes, no type bits).
function readUleb(buf: Buffer, pos: number): [number, number] {
  let n = 0;
  let shift = 0;
  let i = pos;
  for (; i < buf.length && i < pos + 10; i++) {
    const b = buf[i];
    n += (b & 0x7f) * 2 ** shift;
    shift += 7;
    if ((b & 0x80) === 0) {
      i++;
      break;
    }
  }
  return [n, i];
}

function readProposalValue(buf: Buffer, key: string): { bool?: boolean; num?: number; str?: string; arr?: string[] } | null {
  const kb = Buffer.from(key, "utf8");
  const idx = buf.indexOf(kb);
  if (idx <= 0 || buf[idx - 1] !== kb.length) return null;
  const [n, next] = readUleb(buf, idx + kb.length);
  const type = n % 8;
  const val = Math.floor(n / 8);
  if (type === 0) {
    if (val > 2) return null;
    return { bool: val === 2 ? true : val === 1 ? false : undefined };
  }
  if (type === 1) return { num: val };
  if (type === 4) {
    if (next + val > buf.length || val > 100000) return null;
    return { str: buf.toString("utf8", next, next + val) };
  }
  if (type === 5) {
    // Array of calldata values; we only need string items (article ids).
    const out: string[] = [];
    let pos = next;
    for (let i = 0; i < val && i < 100 && pos < buf.length; i++) {
      const [m, nx] = readUleb(buf, pos);
      if (m % 8 !== 4) break;
      const len = Math.floor(m / 8);
      if (nx + len > buf.length || len > 200) break;
      out.push(buf.toString("utf8", nx, nx + len));
      pos = nx + len;
    }
    return { arr: out };
  }
  return null;
}

function decodeProposal(b64: string | null): SlimTx["proposal"] {
  if (!b64) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  const c = readProposalValue(buf, "compliant");
  const s = readProposalValue(buf, "severity");
  const v = readProposalValue(buf, "violated");
  const reason = readProposalValue(buf, "reason");
  if (!c && !s && !v && !reason) return null;
  return {
    compliant: c && "bool" in c ? (c.bool as boolean | undefined) ?? null : null,
    severity: s && "num" in s ? (s.num as number) : null,
    violated: v && "arr" in v ? (v.arr as string[]) : null,
    reason: reason && "str" in reason ? (reason.str as string) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slim(tx: any, workflowId: string): SlimTx | null {
  const cd = tx?.data?.calldata;
  const firstArg = firstArgOf(typeof cd === "string" ? cd : null);
  if (firstArg !== workflowId) return null;
  const votes = tx?.consensus_data?.votes;
  let agree = 0,
    disagree = 0,
    idle = 0;
  if (votes && typeof votes === "object") {
    for (const v of Object.values(votes)) {
      if (v === "agree") agree++;
      else if (v === "disagree") disagree++;
      else idle++;
    }
  }
  const lr = tx?.consensus_data?.leader_receipt;
  const exec = Array.isArray(lr) && lr.length > 0 ? String(lr[0]?.execution_result ?? "") || null : null;
  const rounds: SlimTx["rounds"] = [];
  if (Array.isArray(lr)) {
    for (const r of lr) {
      rounds.push({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exec: String((r as any)?.execution_result ?? "") || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vote: String((r as any)?.vote ?? "") || null,
      });
    }
  }
  const total = agree + disagree + idle;
  // Matches the explorer: majority agreement accepts, otherwise undetermined.
  const consensus = total === 0 ? null : agree > total / 2 ? "accepted" : "undetermined";
  const method = methodOf(typeof cd === "string" ? cd : null);
  const proposal =
    method === "review_proposal" || method === "resolve_appeal"
      ? (() => {
          try {
            const first = Array.isArray(lr) && lr.length > 0 ? lr[0] : null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const eq = (first as any)?.eq_outputs;
            const key = eq && typeof eq === "object" ? Object.keys(eq)[0] : null;
            return key ? decodeProposal(String(eq[key])) : null;
          } catch {
            return null;
          }
        })()
      : null;
  const from = String(tx.from_address || "").toLowerCase();
  return {
    hash: String(tx.hash),
    kind: tx.type === 1 ? "deploy" : from === CONTRACT_ADDRESS.toLowerCase() ? "send" : "call",
    method,
    status: String(tx.status),
    exec,
    consensus,
    agree,
    disagree,
    idle,
    rotations: Number(tx.rotation_count || 0),
    appealed: !!tx.appealed,
    time: String(tx.created_at || ""),
    value: String(tx.value ?? "0"),
    rounds,
    proposal,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workflowId = (searchParams.get("workflow") || "").trim();
  if (!workflowId) return NextResponse.json({ error: "missing ?workflow=" }, { status: 400 });

  const now = Date.now();
  if (!fullCache || now - fullCache.t >= CACHE_MS) {
    const upstream = await fetch(`${EXPLORER_API}?address=${CONTRACT_ADDRESS}&limit=100`, {
      cache: "no-store",
    });
    if (!upstream.ok) return NextResponse.json({ error: `explorer ${upstream.status}` }, { status: 502 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await upstream.json()) as any;
    fullCache = { t: now, list: Array.isArray(body.transactions) ? body.transactions : [] };
  }
  const out: SlimTx[] = [];
  for (const tx of fullCache.list) {
    const s = slim(tx, workflowId);
    if (s) out.push(s);
  }
  return NextResponse.json({ txs: out });
}
