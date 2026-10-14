"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shield, type ShieldKind } from "@/components/shield";
import { Button } from "@/components/ui/button";
import { useTx } from "@/components/tx-track";
import { useWallet } from "@/components/wallet-modal";
import { executionOutcome, friendlyError, read, write } from "@/lib/chain";
import { fmtCountdown, fmtGen, fmtUnix, genToAtto, toNum } from "@/lib/format";
import { getAddress, onWalletChange } from "@/lib/wallet";
import { EXPLORER_BASE } from "@/lib/config";

const METHOD_LABEL: Record<string, string> = {
  publish_charter: "Charter published",
  submit_proposal: "Proposal submitted",
  review_proposal: "Proposal reviewed",
  open_appeal: "Appeal opened",
  resolve_appeal: "Appeal re-ruled",
  execute_proposal: "Proposal executed",
  cancel_proposal: "Proposal cancelled",
  fund_treasury: "Treasury funded",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Card = Record<string, any>;

interface TrailTx {
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

function ActionCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-parchment/10 bg-ink2 p-5">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-parchdim">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TrailRow({ t, ai }: { t: TrailTx; ai: boolean }) {
  const [open, setOpen] = useState(false);
  const consensusCls =
    t.consensus === "accepted" ? "text-pine" : t.consensus === "undetermined" ? "text-seal" : "text-sage";
  return (
    <div className={`ledger-row px-4 py-3 ${ai ? "border-l-2 border-l-brass" : ""}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="block w-full text-left">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-sm font-semibold">
            {t.method ? (METHOD_LABEL[t.method] || t.method) : t.kind === "send" ? "GEN transfer" : t.kind}
          </span>
          {ai && <span className="rounded-sm bg-brass/20 px-1.5 py-0.5 font-mono text-[10px] text-brass">AI ruling</span>}
          {t.consensus && <span className={`font-mono text-[11px] font-semibold uppercase ${consensusCls}`}>{t.consensus}</span>}
          <span className="ml-auto font-mono text-[11px] text-sage">{open ? "▾ detail" : "▸ detail"}</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-parchdim">
          leader exec: {t.exec || "?"} · {t.agree + t.disagree + t.idle > 0
            ? `${t.agree} agree · ${t.disagree} disagree · ${t.idle} idle`
            : "no validator votes recorded"}
          {t.rotations > 0 ? ` · ${t.rotations} rotation${t.rotations > 1 ? "s" : ""}` : ""}
          {t.appealed ? " · appealed" : ""}
          {t.time ? ` · ${t.time.slice(0, 16).replace("T", " ")} UTC` : ""}
        </p>
      </button>
      {open && (
        <div className="mt-2 rounded-sm border border-parchment/10 bg-ink px-3 py-2">
          {t.proposal && (t.proposal.compliant !== null || t.proposal.severity !== null || t.proposal.reason) ? (
            <div className="text-xs">
              <p className="font-mono text-[11px] uppercase tracking-wider text-brass">Leader proposal</p>
              <p className="mt-1">
                <b className={t.proposal.compliant ? "text-pine" : "text-seal"}>
                  {t.proposal.compliant === null ? "?" : t.proposal.compliant ? "compliant" : "breach"}
                </b>
                {t.proposal.severity !== null && <span className="font-mono"> · severity {t.proposal.severity}</span>}
                {t.proposal.violated && t.proposal.violated.length > 0 && (
                  <span> · violated: <span className="font-mono">{t.proposal.violated.join(", ")}</span></span>
                )}
              </p>
              {t.proposal.reason && <p className="mt-1 leading-relaxed text-parchdim">{t.proposal.reason}</p>}
              {t.consensus === "undetermined" && (
                <p className="mt-2 text-parchdim">No majority agreed — nothing was stored by this transaction. The proposal keeps its previous state.</p>
              )}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-sage">No AI proposal on this transaction.</p>
          )}
          {t.rounds.length > 1 && (
            <div className="mt-2 border-t border-parchment/10 pt-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-brass">Rounds</p>
              {t.rounds.map((r, i) => (
                <p key={i} className="mt-0.5 font-mono text-[11px] text-parchdim">
                  round {i}: exec {r.exec || "?"} · vote {r.vote || "—"}
                </p>
              ))}
            </div>
          )}
          <a href={`${EXPLORER_BASE}/tx/${t.hash}`} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-[11px] text-sage underline-offset-2 hover:text-parchment hover:underline">
            {t.hash.slice(0, 14)}… full receipt in explorer ↗
          </a>
        </div>
      )}
    </div>
  );
}

export default function ProposalDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string>("");
  const tx = useTx();
  const wallet = useWallet();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [fundAmt, setFundAmt] = useState("0.5");
  const [note, setNote] = useState("");
  const [articles, setArticles] = useState<{ id: string; title: string; text: string }[]>([]);
  const [trail, setTrail] = useState<TrailTx[]>([]);
  const [trailNote, setTrailNote] = useState("Reading the consensus trail…");
  const [me, setMe] = useState("");
  const actingRef = useRef(false);
  const cardRef = useRef<Card | null>(null);
  const [nowTick, setNowTick] = useState(0);

  const input = "w-full rounded-sm border border-parchment/20 bg-ink px-3 py-2 text-sm";

  useEffect(() => {
    params.then((p) => setId(decodeURIComponent(p.id)));
    setMe((getAddress() || "").toLowerCase());
  }, [params]);

  useEffect(() => {
    setNowTick(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNowTick(Math.floor(Date.now() / 1000)), 1000);
    const off = onWalletChange(() => setMe((getAddress() || "").toLowerCase()));
    return () => {
      clearInterval(t);
      off();
    };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const c = (await read("get_proposal_card", [id])) as Card;
      if (!c || !c.proposal_id) throw new Error("empty");
      setCard(c);
      cardRef.current = c;
      try {
        const ch = await read("get_charter", [c.charter_version]);
        const list = typeof ch === "string" ? JSON.parse(ch) : ch;
        setArticles(Array.isArray(list) ? list : []);
      } catch {
        setArticles([]);
      }
    } catch {
      setError("Proposal not found or chain unreachable.");
    } finally {
      setLoading(false);
    }
    try {
      const r = await fetch(`/api/history?workflow=${encodeURIComponent(id)}`);
      const body = await r.json();
      const txs = Array.isArray(body.txs) ? body.txs : [];
      setTrail(txs);
      if (txs.length === 0) setTrailNote("No trail entries indexed yet for this proposal.");
    } catch {
      setTrailNote("Consensus trail unreachable right now.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const hasVerdict = !!card?.verdict && Object.keys(card.verdict).length > 0;
  const shieldKind = !card
    ? "pending"
    : card.executed
      ? "settled"
      : card.status === "disputed"
        ? "disputed"
        : hasVerdict
          ? card.verdict.compliant
            ? "compliant"
            : "breached"
          : card.status === "cancelled"
            ? "pending"
            : "open";

  const isAuthed = !!me;
  const isOwner = !!card; // charter-owner check needs owner address: compare via treasury? owner-only actions will revert honestly
  const isProposer = !!card && !!me && String(card.proposer || "").toLowerCase() === me;

  const canReview = isAuthed && card?.status === "pending";
  const canAppeal =
    isAuthed &&
    ["approved", "rejected"].includes(card?.status) &&
    !card?.executed &&
    Number(card?.appeal_count ?? 1) < 1 &&
    !!card?.execute_after &&
    nowTick < Number(card.execute_after);
  const canResolve = isAuthed && card?.status === "disputed";
  const canExecute = isAuthed && card?.status === "approved" && !card?.executed;
  const execReady = !!card?.execute_after && nowTick >= Number(card.execute_after);
  const canCancel = isAuthed && card?.status === "pending";

  function action(): string {
    try {
      const a = typeof card?.action_json === "string" ? JSON.parse(card.action_json) : card?.action_json;
      if (a?.type === "treasury") return `Pays ${fmtGen(a.amount_atto)} → ${String(a.recipient || "").slice(0, 12)}…`;
      return "Record only — no money moves.";
    } catch {
      return "";
    }
  }

  async function act(
    title: string,
    method: string,
    args: unknown[],
    opts: { valueAtto?: bigint },
    doneMsg: string,
    confirm?: (fresh: Card | null) => boolean
  ) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(true);
    setActionError("");
    setActionOk("");
    const tracker = tx.push({ title, hash: "…" });
    try {
      const { hash, receipt } = await write(method, args, {
        ...opts,
        onHash: (h) => tx.update(tracker, { hash: h }),
      });
      const out = executionOutcome(receipt);
      if (out.expectedMessage) {
        const msg = `Rejected: ${out.expectedMessage}`;
        tx.update(tracker, { tone: "bad", hash, note: msg });
        setActionError(msg);
        return;
      }
      await load();
      const confirmed = confirm ? confirm(cardRef.current) : out.ok;
      if (!confirmed && !out.ok) {
        const msg = "Finalized without visible effect — check the trail below before retrying.";
        tx.update(tracker, { tone: "bad", hash, note: msg });
        setActionError(msg);
        return;
      }
      tx.update(tracker, { tone: "good", hash, note: doneMsg });
      setActionOk(confirmed ? doneMsg : `${doneMsg} (receipt was ambiguous — verify above.)`);
      await load();
    } catch (e) {
      const msg = friendlyError(e);
      tx.update(tracker, { tone: "bad", note: msg });
      setActionError(msg);
    } finally {
      actingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="rise-in mx-auto max-w-[1520px] px-4 py-10">
      <Link href="/app" className="font-mono text-xs text-brass hover:underline">← Registry</Link>

      {loading ? (
        <div className="mt-6 h-64 animate-pulse rounded-md bg-ink2"></div>
      ) : error || !card ? (
        <p className="mt-6 rounded-sm border border-seal/50 bg-sealdeep/20 px-4 py-3 text-sm text-seal" role="alert">
          {error} <button className="ml-2 underline underline-offset-2" onClick={load}>Retry</button>
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start gap-5 rounded-md border border-parchment/10 bg-ink2 p-6">
              <Shield kind={shieldKind} score={card.verdict?.severity ?? null} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-brass">{card.proposal_id} · charter v{String(card.charter_version)}</p>
                <h1 className="mt-1 font-display text-3xl font-bold leading-tight">{card.title}</h1>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-parchdim">
                  <span>Status: <b className={card.status === "rejected" ? "text-seal" : card.status === "approved" ? "text-pine" : "text-brass"}>{card.status}</b></span>
                  <span>Treasury: <b className="text-brass">{fmtGen(card.treasury_atto)}</b></span>
                  <span>Execute: {card.execute_after ? `${fmtUnix(card.execute_after)} (${fmtCountdown(card.execute_after)})` : "after ruling"}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-parchment/10 bg-ink2 p-6">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">Proposal body</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{card.body}</p>
              {card.rationale && <p className="mt-3 border-l-2 border-brass pl-3 text-sm italic text-parchdim">Rationale: “{card.rationale}”</p>}
              <div className="mt-4 grid gap-3 font-mono text-xs text-parchdim sm:grid-cols-2">
                <p>Proposer <span className="block truncate text-parchment">{card.proposer}</span></p>
                <p>Action <span className="block text-parchment">{action()}</span></p>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-parchment/10 bg-ink2 p-6">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">Pinned charter · v{String(card.charter_version)}</h2>
              {articles.length === 0 ? (
                <p className="mt-2 font-mono text-xs text-sage">Charter text unreachable.</p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-sm border border-parchment/10">
                  {articles.map((a) => (
                    <div key={a.id} className="ledger-row px-4 py-3">
                      <p className="font-mono text-xs text-brass">{a.id} · {a.title}</p>
                      <p className="mt-1 text-sm text-parchdim">{a.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {hasVerdict && (
              <div className="mt-6 rounded-md border border-parchment/10 bg-ink2 p-6">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">Sealed ruling</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
                  <div className={`font-display text-6xl font-bold ${card.verdict.compliant ? "text-pine" : "text-seal"}`}>{String(card.verdict.severity)}</div>
                  <div>
                    <p className="font-display text-xl font-semibold">
                      {card.verdict.compliant ? "Compliant — may execute" : "Breach — blocked"}
                    </p>
                    {Array.isArray(card.verdict.violated) && card.verdict.violated.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {card.verdict.violated.map((v: string) => (
                          <span key={v} className="rounded-sm border border-seal/50 px-2 py-0.5 font-mono text-[11px] text-seal">{v}</span>
                        ))}
                      </p>
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-parchdim">{card.verdict.reason}</p>
                    <p className="mt-2 font-mono text-xs text-sage">Ruled twice under ±15 consensus · article set matched exactly</p>
                  </div>
                </div>
                {card.appeal_note && <div className="mt-4 border-l-2 border-brass pl-3 text-sm italic text-parchdim">Appeal note: “{card.appeal_note}”</div>}
              </div>
            )}

            <div className="mt-6 rounded-md border border-parchment/10 bg-ink2 p-6">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">Consensus trail</h2>
              <p className="mt-1 text-xs text-parchdim">Every transaction for this proposal, with validator votes as recorded in the explorer.</p>
              {trail.length === 0 ? (
                <p className="mt-3 font-mono text-xs text-sage">{trailNote}</p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-sm border border-parchment/10">
                  {trail.map((t) => {
                    const ai = t.method === "review_proposal" || t.method === "resolve_appeal";
                    return <TrailRow key={t.hash} t={t} ai={ai} />;
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            {!isAuthed && (
              <div className="rounded-md border border-brass/40 bg-ink2 p-5 text-sm">
                <p className="font-display text-lg font-semibold">Reading is free. Acting needs keys.</p>
                <p className="mt-1 text-parchdim">Connect a wallet to review, appeal, fund, or execute.</p>
                <button onClick={() => wallet.open()} className="mt-4 block w-full rounded-sm bg-brass px-4 py-2 text-center text-sm font-semibold text-ink">Connect wallet</button>
              </div>
            )}

            {isAuthed && card?.status === "pending" && (
              <ActionCard title="Pass judgment" hint="Charter owner triggers the full validator consensus.">
                <Button variant="primary" size="block" disabled={busy} onClick={() => act(`Reviewing ${id}`, "review_proposal", [id], {}, "Ruling sealed by validator consensus.",
                  (c) => !!c?.verdict && Object.keys(c.verdict).length > 0)}>Review now</Button>
              </ActionCard>
            )}

            {isAuthed && card?.status === "pending" && (
              <ActionCard title="Cancel proposal" hint="Proposer or charter owner. Withdraws it permanently.">
                <Button variant="danger" size="block" disabled={busy} onClick={() => act(`Cancelling ${id}`, "cancel_proposal", [id], {}, "Proposal cancelled.",
                  (c) => c?.status === "cancelled")}>Cancel</Button>
              </ActionCard>
            )}

            {canAppeal && (
              <ActionCard title="Open appeal" hint="One round only, before the execution deadline.">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why is the ruling wrong?" className={`${input} mb-2`} />
                <Button variant="danger" size="block" disabled={busy} onClick={() => act(`Appealing ${id}`, "open_appeal", [id, note.trim()], {}, "Appeal opened.",
                  (c) => c?.status === "disputed")}>Appeal ruling</Button>
              </ActionCard>
            )}

            {canResolve && (
              <ActionCard title="Resolve appeal" hint="Re-runs judgment with the appeal note.">
                <Button variant="brass" size="block" disabled={busy} onClick={() => act(`Re-ruling ${id}`, "resolve_appeal", [id], {}, "Appeal resolved with a fresh ruling.",
                  (c) => ["approved", "rejected"].includes(c?.status))}>Re-rule</Button>
              </ActionCard>
            )}

            {canExecute && (
              <ActionCard title="Execute proposal" hint="Anyone can trigger it once the window closes. Treasury pays out on approved payouts.">
                <Button variant="pine" size="block" disabled={busy || !execReady} onClick={() => act(`Executing ${id}`, "execute_proposal", [id], {}, "Proposal executed.",
                  (c) => !!c?.executed)}>
                  {execReady ? "Execute now" : `Opens in ${fmtCountdown(card.execute_after)}`}
                </Button>
              </ActionCard>
            )}

            {isAuthed && (
              <ActionCard title="Fund treasury" hint="Top up the shared pot backing payouts.">
                <div className="flex gap-2">
                  <input value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" placeholder="0.5" className="w-full rounded-sm border border-parchment/20 bg-ink px-3 py-2 font-mono text-sm" />
                  <Button variant="brass" size="sm" disabled={busy} onClick={() => {
                    const before = toNum(cardRef.current?.treasury_atto);
                    return act(`Funding treasury`, "fund_treasury", [], { valueAtto: genToAtto(fundAmt || "0") }, `${fundAmt} GEN added to treasury.`,
                      (c) => toNum(c?.treasury_atto) > before);
                  }}>Fund</Button>
                </div>
              </ActionCard>
            )}

            {actionError && <p className="rounded-sm border border-seal/50 bg-sealdeep/20 px-3 py-2 text-sm text-seal" role="alert">{actionError}</p>}
            {actionOk && <p className="rounded-sm border border-pine/50 bg-pinedeep/30 px-3 py-2 text-sm text-pine" role="status">{actionOk}</p>}
          </aside>
        </div>
      )}
    </div>
  );

  function ActionCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
    return (
      <section className="rounded-md border border-parchment/10 bg-ink2 p-5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-parchdim">{hint}</p>
        <div className="mt-3">{children}</div>
      </section>
    );
  }
}
