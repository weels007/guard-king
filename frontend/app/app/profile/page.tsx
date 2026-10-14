"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shield, type ShieldKind } from "@/components/shield";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet-modal";
import { read, readMany } from "@/lib/chain";
import { fmtGen } from "@/lib/format";
import { getAddress, onWalletChange } from "@/lib/wallet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Card = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shieldKind(r: any): ShieldKind {
  if (r.executed) return "settled";
  if (r.status === "disputed") return "disputed";
  if (r.verdict && Object.keys(r.verdict).length > 0) return r.verdict.compliant ? "compliant" : "breached";
  return r.status === "cancelled" ? "pending" : "open";
}

export default function Profile() {
  const wallet = useWallet();
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<Card[]>([]);
  const [treasury, setTreasury] = useState("0");

  useEffect(() => {
    setMe((getAddress() || "").toLowerCase());
    const off = onWalletChange(() => setMe((getAddress() || "").toLowerCase()));
    return off;
  }, []);

  useEffect(() => {
    if (!me) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError("");
      try {
        const ids = (await read("list_proposals")) as string[];
        const list = Array.isArray(ids) ? ids : [];
        const cards = await readMany<Card>(list.map((id) => ({ method: "get_proposal_card", args: [id] })));
        const own: Card[] = [];
        for (const card of cards) {
          if (!card || !card.proposal_id) continue;
          if (String(card.proposer || "").toLowerCase() === me) own.push(card);
          if (card.treasury_atto) setTreasury(String(card.treasury_atto));
        }
        setMine(own.reverse());
      } catch {
        setError("Registry unreachable. The chain may be busy — retry in a moment.");
      } finally {
        setLoading(false);
      }
    })();
  }, [me]);

  const executedCount = mine.filter((c) => c.executed).length;
  const disputedCount = mine.filter((c) => c.status === "disputed").length;

  function proposalRow(c: Card) {
    return (
      <Link
        key={c.proposal_id}
        href={`/app/proposal/${c.proposal_id}`}
        className="ledger-row grid items-center gap-3 bg-ink2/60 px-4 py-4 transition hover:bg-ink2 md:grid-cols-[auto_1fr_auto_auto_auto]"
      >
        <Shield kind={shieldKind(c)} score={c.verdict?.severity ?? null} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold">{c.title}</p>
          <p className="mt-0.5 font-mono text-[11px] text-sage">{c.proposal_id} · charter v{String(c.charter_version)}</p>
        </div>
        <span className="font-mono text-xs text-brass">v{String(c.charter_version)}</span>
        <span className={`font-mono text-xs ${c.executed ? "text-pine" : "text-parchdim"}`}>{c.executed ? "executed" : c.status}</span>
        <span className="font-mono text-xs text-brass underline underline-offset-4">Detail →</span>
      </Link>
    );
  }

  return (
    <div className="rise-in mx-auto max-w-[1520px] px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-brass">Profile</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Your ledger page</h1>

      {!me ? (
        <div className="mt-8 max-w-xl rounded-md border border-brass/40 bg-ink2 p-6">
          <p className="font-display text-xl font-semibold">No wallet connected.</p>
          <p className="mt-1 text-sm text-parchdim">Connect to see your proposals and the treasury you back.</p>
          <Button variant="brass" size="md" className="mt-4" onClick={() => wallet.open()}>Connect wallet</Button>
        </div>
      ) : loading ? (
        <div className="mt-8 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-ink2"></div>
          ))}
        </div>
      ) : error ? (
        <p className="mt-8 rounded-sm border border-seal/50 bg-sealdeep/20 px-4 py-3 text-sm text-seal" role="alert">{error}</p>
      ) : (
        <>
          <p className="mt-2 break-all font-mono text-xs text-sage">{me}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["Proposals by you", String(mine.length)],
              ["Treasury balance", fmtGen(treasury)],
              ["Executed", String(executedCount)],
              ["In dispute", String(disputedCount)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-parchment/10 bg-ink2 px-4 py-4">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-sage">{k}</dt>
                <dd className="mt-1 font-display text-2xl font-bold">{v}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-10 font-display text-2xl font-semibold">Your proposals</h2>
          {mine.length === 0 ? (
            <p className="mt-3 text-sm text-parchdim">None yet. <Link href="/app/new" className="text-brass underline underline-offset-2">Submit your first proposal</Link>.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-md border border-parchment/10">{mine.map(proposalRow)}</div>
          )}

          <div className="mt-10">
            <Button variant="danger" size="sm" onClick={() => { wallet.lock(); setMe(""); }}>Lock wallet</Button>
          </div>
        </>
      )}
    </div>
  );
}
