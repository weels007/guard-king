"use client";
// genlayer-js client + read/write helpers with friendly errors.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CONTRACT_ADDRESS } from "./config";
import { errText } from "./errors";
import { genlayerAccount, getAddress, walletType } from "./wallet";
import { ensureStudionet, getConnectedProvider } from "./evm-wallets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// All chain traffic goes through the same-origin /api/rpc proxy — the
// Studio RPC has no CORS headers for browsers.
const ENDPOINT = "/api/rpc";

export function getClient(): any {
  if (!client) client = createClient({ chain: studionet, endpoint: ENDPOINT });
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAuthedClient(): any {
  // Browser wallet (MetaMask / Rabby / …): SDK signs through the provider.
  if (walletType() === "browser") {
    const provider = getConnectedProvider();
    if (!provider) throw new Error("Browser wallet session expired (tab reloaded or wallet locked). Open Connect wallet and pick it again — no popup needed if still authorized.");
    const address = getAddress();
    if (!address) throw new Error("Browser wallet session expired. Open Connect wallet and pick it again.");
    return createClient({ chain: studionet, endpoint: ENDPOINT, account: address as `0x${string}`, provider });
  }
  const account = genlayerAccount();
  if (!account) throw new Error("Wallet is locked. Connect a wallet first.");
  return createClient({ chain: studionet, endpoint: ENDPOINT, account });
}

/** Bind the browser provider to studionet. Call once right after the user
 *  picks a wallet; the SDK then routes signatures to it. Uses the universal
 *  switch-or-add flow (the SDK Snap-based connect is MetaMask-only). */
export async function bindBrowserChain(): Promise<void> {
  const provider = getConnectedProvider();
  if (!provider) throw new Error("No browser wallet connected.");
  await ensureStudionet(provider);
}

// --- Read throttle + cache -------------------------------------------
// Studio RPC allows ~30 req/min sustained but tolerates small bursts.
// Reads run at most CONCURRENCY at a time with a short gap, and repeat
// reads are served from a brief cache; every write bumps the epoch.
const CONCURRENCY = 3;
const MIN_GAP_MS = 700;
const CACHE_TTL_MS = 12000;
let nextSlot = 0;
let epoch = 0;
let inFlight = 0;
const waiting: (() => void)[] = [];
const readCache = new Map<string, { t: number; v: unknown }>();

async function takeSlot(): Promise<void> {
  while (inFlight >= CONCURRENCY) {
    await new Promise<void>((r) => waiting.push(r));
  }
  inFlight++;
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + MIN_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function releaseSlot(): void {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  await takeSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function read(method: string, args: unknown[] = []): Promise<any> {
  const key = `${epoch}:${method}:${JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
  const v = await throttle(() => {
    const c = getClient();
    return c.readContract({ address: CONTRACT_ADDRESS, functionName: method, args });
  });
  readCache.set(key, { t: Date.now(), v });
  return v;
}

export async function write(
  method: string,
  args: unknown[] = [],
  opts: { valueAtto?: bigint; onHash?: (h: string) => void } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ hash: string; receipt: any }> {
  const c = getAuthedClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call: any = { address: CONTRACT_ADDRESS, functionName: method, args };
  if (opts.valueAtto && opts.valueAtto > BigInt(0)) call.value = opts.valueAtto;
  const hash = await c.writeContract(call);
  if (opts.onHash) opts.onHash(hash);
  // Slow poll: consensus takes minutes; every poll is an RPC request
  // against the same 30/min budget as reads.
  const receipt = await c.waitForTransactionReceipt({ hash, status: "FINALIZED", retries: 120, interval: 8000 });
  epoch++; // fresh reads after every state change
  return { hash, receipt };
}

function receiptText(receipt: unknown): string {
  try {
    return JSON.stringify(receipt, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return "";
  }
}

/** Parallel reads with the shared throttle. Failures resolve to null. */
export async function readMany<T>(calls: { method: string; args?: unknown[] }[]): Promise<(T | null)[]> {
  return Promise.all(
    calls.map((c) =>
      read(c.method, c.args || [])
        .then((v) => v as T)
        .catch(() => null)
    )
  );
}

export interface Outcome {
  ok: boolean;
  successes: number;
  errors: number;
  expectedMessage: string | null;
  undetermined: boolean;
}

// Rotation rounds also record ERROR entries, so success is judged from the
// leader receipts structurally: any SUCCESS wins; hard failure markers or
// zero successes mean the call did not take effect.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function executionOutcome(receipt: any): Outcome {
  const leaders: unknown[] = Array.isArray(receipt?.consensus_data?.leader_receipt)
    ? receipt.consensus_data.leader_receipt
    : [];
  let successes = 0;
  let errors = 0;
  let fatal = false;
  for (const r of leaders) {
    const rec = r as Record<string, unknown>;
    const exec = String(rec?.execution_result ?? "");
    if (exec === "SUCCESS") successes++;
    else if (exec) errors++;
    if (/FINISHED_WITH_ERROR|contract_error/.test(JSON.stringify(rec?.result ?? rec ?? ""))) fatal = true;
  }
  const text = receiptText(receipt);
  if (leaders.length === 0) {
    // Fallback for simplified receipts without leader breakdown.
    errors = (text.match(/execution_result[^,]*ERROR/g) || []).length;
    successes = (text.match(/SUCCESS/g) || []).length;
    if (/FINISHED_WITH_ERROR|contract_error/.test(text)) fatal = true;
  }
  const m = /\[EXPECTED\]\s*([^"\\]+)/.exec(text);
  const undetermined = successes === 0;
  return {
    ok: !fatal && !undetermined,
    successes,
    errors,
    expectedMessage: m ? m[1].trim() : null,
    undetermined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function friendlyError(err: any): string {
  const msg = errText(err);
  if (/insufficient|balance/i.test(msg)) return "Insufficient GEN balance for this transaction.";
  if (/rejected|denied/i.test(msg)) return "Signature rejected in wallet.";
  if (/429|rate limit|too many/i.test(msg)) return "Chain is rate-limiting (30/min). Cooling down — retry in a few seconds.";
  if (/fetch|network|timeout/i.test(msg)) return "Network hiccup reaching studionet. Wait a moment and retry.";
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}
