"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shield, type ShieldKind } from "@/components/shield";
import { read, readMany } from "@/lib/chain";
import { fmtGen } from "@/lib/format";
import { getAddress } from "@/lib/wallet";

type Tab = "all" | "mine";
type StatusF = "all" | "pending" | "disputed" | "approved" | "rejected" | "executed" | "cancelled";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shieldKind(r: any): ShieldKind {
  if (r.executed) return "settled";
  if (r.status === "disputed") return "disputed";
  if (r.verdict && Object.keys(r.verdict).length > 0) return r.verdict.compliant ? "compliant" : "breached";
  return r.status === "cancelled" ? "pending" : "open";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowNote(r: any): string {
  const judged = r.verdict && Object.keys(r.verdict).length > 0;
  if (!judged) return r.status === "cancelled" ? "withdrawn" : "awaiting review";
  if (!r.executed && r.status === "approved") return "approved · executable";
  if (r.executed) return "executed";
  return r.status;
}

export default function Registry() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState<StatusF>("all");
  const [query, setQuery] = useState("");
  const [me, setMe] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const ids = (await read("list_proposals")) as string[];
      const list = (Array.isArray(ids) ? ids : []).slice().reverse();
      const cards = await readMany<Record<string, unknown>>(list.map((id) => ({ method: "get_proposal_card", args: [id] })));
      const out = [];
      for (const card of cards) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = card as any;
        if (c && c.proposal_id) out.push(c);
      }
      setRows(out);
    } catch {
      setError("Registry unreachable. The chain may be busy — retry in a moment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMe((getAddress() || "").toLowerCase());
    load();
  }, []);

  const visible = rows.filter((r) => {
    if (tab === "mine" && String(r.proposer || "").toLowerCase() !== me) return false;
    if (status === "executed" && !r.executed) return false;
    if (status !== "all" && status !== "executed" && r.status !== status) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!String(r.proposal_id).toLowerCase().includes(q) && !String(r.title).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="rise-in mx-auto max-w-[1520px] px-4 py-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-brass">Registry</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Every proposal on record</h1>
        </div>
        <Link href="/app/new" className="ml-auto rounded-sm bg-primary-text px-4 py-2 text-sm font-semibold text-black hover:bg-white">
          + New proposal
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-sm border border-parchment/15 p-1 text-sm">
          {(["all", "mine"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-sm px-3 py-1.5 ${tab === t ? "bg-ink3 text-parchment" : "text-parchdim hover:text-parchment"}`}
            >
              {t === "all" ? "All proposals" : "Mine"}
            </button>
          ))}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusF)}
          aria-label="Filter by status"
          className="rounded-sm border border-parchment/15 bg-ink px-3 py-2 text-sm text-parchdim"
        >
          {(["all", "pending", "disputed", "approved", "rejected", "executed", "cancelled"] as StatusF[]).map((s) => (
            <option key={s} value={s}>{s === "all" ? "Any status" : s}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search id or title…"
          aria-label="Search proposals"
          className="w-full rounded-sm border border-parchment/15 bg-ink px-3 py-2 text-sm sm:w-64"
        />
        {tab === "mine" && !me && (
          <span className="text-xs text-brass">Connect a wallet to use this tab.</span>
        )}
      </div>

      {loading ? (
        <div className="mt-8 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-ink2"></div>
          ))}
        </div>
      ) : error ? (
        <p className="mt-8 rounded-sm border border-seal/50 bg-sealdeep/20 px-4 py-3 text-sm text-seal" role="alert">
          {error} <button className="ml-2 underline underline-offset-2" onClick={load}>Retry</button>
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-parchment/25 px-6 py-14 text-center">
          <div className="mx-auto w-fit opacity-80"><Shield kind="pending" size="md" /></div>
          <p className="mt-4 font-display text-2xl font-semibold">The registry is empty.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-parchdim">No proposals submitted yet. Write the first one — and let the charter judge it.</p>
          <Link href="/app/new" className="mt-6 inline-block rounded-sm bg-primary-text px-5 py-2.5 text-sm font-semibold text-black hover:bg-white">
            Submit the first proposal
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-parchment/25 px-6 py-10 text-center text-sm text-parchdim">
          No proposals match this filter. Try another tab, status, or search.
        </p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-md border border-parchment/10">
          {visible.map((r) => (
            <Link
              key={r.proposal_id}
              href={`/app/proposal/${r.proposal_id}`}
              className="ledger-row grid items-center gap-3 bg-ink2/60 px-4 py-4 transition hover:bg-ink2 md:grid-cols-[auto_1fr_auto_auto_auto]"
            >
              <Shield kind={shieldKind(r)} score={r.verdict?.severity ?? null} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold">{r.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-sage">
                  {r.proposal_id} · charter v{String(r.charter_version)} · {rowNote(r)}
                </p>
              </div>
              <span className="font-mono text-xs text-brass">{r.action_json ? actionSummary(r.action_json) : ""}</span>
              <span className={`font-mono text-xs ${r.executed ? "text-pine" : "text-parchdim"}`}>{r.executed ? "executed" : r.status}</span>
              <span className="font-mono text-xs text-brass underline underline-offset-4">Detail →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actionSummary(actionJson: any): string {
  try {
    const a = typeof actionJson === "string" ? JSON.parse(actionJson) : actionJson;
    if (a?.type === "treasury") {
      const amt = a.amount_atto ? fmtGen(a.amount_atto) : "";
      return `${amt} → ${String(a.recipient || "").slice(0, 10)}…`;
    }
    return String(a?.type || "");
  } catch {
    return "";
  }
}
