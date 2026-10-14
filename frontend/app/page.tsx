"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import HaosShowcase from "@/components/ui/tech-solutions-hero-section";
import { Component as RaycastBlue } from "@/components/ui/raycast-animated-blue-background";
import { Shield } from "@/components/shield";
import { read, readMany } from "@/lib/chain";
import { fmtGen } from "@/lib/format";

const STEPS = [
  { t: "Write the charter", d: "Codify the rules as articles with stable ids. Versions are append-only — a new version never rewrites judgment already in flight." },
  { t: "Propose openly", d: "Anyone submits a proposal pinned to a charter version: what to do, the treasury action, and why it complies." },
  { t: "Get judged", d: "Validators grade the proposal against the pinned articles only. Violated article ids must match exactly; severity within ±15." },
  { t: "Appeal once", d: "Proposer or charter owner can force a re-review with a note — one round, then the ruling stands." },
  { t: "Execute if clean", d: "After the window closes, anyone triggers execution: treasury pays out, or nothing moves. No signatures to chase." },
];

interface Sample {
  proposal_id: string;
  title: string;
  status: string;
  executed: boolean;
  verdict?: { compliant?: boolean; severity?: number };
}

export default function Landing() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sample, setSample] = useState<any>(null);
  const [stats, setStats] = useState({ proposals: "0", treasury: "0 GEN", executed: "0" });

  useEffect(() => {
    (async () => {
      try {
        const ids = (await read("list_proposals")) as string[];
        const list = Array.isArray(ids) ? ids : [];
        let executed = 0;
        let treasury = "0";
        let last: Sample | null = null;
        const cards = await readMany<Sample>(list.slice(-5).map((id) => ({ method: "get_proposal_card", args: [id] })));
        for (const card of cards) {
          if (!card || !card.proposal_id) continue;
          if (card.executed) executed++;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          treasury = (card as any).treasury_atto || treasury;
          if (card.verdict && Object.keys(card.verdict).length > 0) last = card;
        }
        setStats({ proposals: String(list.length), treasury: fmtGen(treasury), executed: String(executed) });
        if (last) setSample(last);
      } catch {
        /* registry unreachable — hero still renders with zeros */
      }
    })();
  }, []);

  const ruled = sample ? "1" : "0";

  return (
    <div className="rise-in mx-auto max-w-[1520px] px-4 py-8">
      <HaosShowcase
        bg={<RaycastBlue opacity={0.85} />}
        category="Governance"
        year="2026"
        solutionLabel="Automation"
        solutionValue="Charter compliance"
        title="GuardKing"
        subtitle="No proposal above the charter"
        statLabel="Proposals ruled"
        statValue={ruled === "0" ? stats.proposals : `${stats.proposals} ruled`}
        bottomValue={`${stats.treasury} treasury · ${stats.executed} executed`}
        progressPercent={Math.min(100, Number(stats.proposals) * 10)}
        logoText="GK"
        actionHref="/app/new"
        onAction={() => router.push("/app/new")}
        className="min-h-[520px]"
      />

      {sample && (
        <div className="mt-4 grid gap-4 rounded-lg border border-line bg-black/40 p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
          <Shield
            kind={
              !sample.verdict || Object.keys(sample.verdict).length === 0
                ? sample.status === "disputed"
                  ? "disputed"
                  : "open"
                : sample.executed
                  ? "settled"
                  : sample.verdict.compliant
                    ? "compliant"
                    : "breached"
            }
            score={sample.verdict?.severity ?? null}
            size="sm"
          />
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-secondary-text">FRESH FROM THE REGISTRY · {sample.proposal_id}</p>
            <p className="mt-1 truncate font-display text-xl font-semibold text-primary-text">{sample.title}</p>
          </div>
          <Link href={`/app/proposal/${sample.proposal_id}`} className="font-mono text-xs text-primary-text underline-offset-4 hover:underline">
            Inspect →
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          ["Proposals", stats.proposals, "sealed on-chain"],
          ["Treasury", stats.treasury, "backing payouts"],
          ["Executed", stats.executed, "clean rulings paid"],
        ].map(([k, v, s]) => (
          <div key={k} className="rounded-lg border border-line bg-black/40 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold text-primary-text">{v}</p>
            <p className="mt-1 font-mono text-[11px] text-secondary-text">{s}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        <div className="grid gap-1 border-b border-line bg-black/40 px-5 py-4 md:grid-cols-[3rem_1fr_2fr] md:gap-4">
          <span className="font-mono text-sm text-primary-text">／／</span>
          <h2 className="font-display text-2xl font-bold text-primary-text">Five entries. One charter. No exceptions.</h2>
          <p className="font-mono text-[11px] text-secondary-text">THE LIFECYCLE</p>
        </div>
        {STEPS.map((s, i) => (
          <div key={s.t} className="ledger-row grid gap-1 bg-black/40 px-5 py-5 md:grid-cols-[3rem_1fr_2fr] md:gap-4">
            <span className="font-mono text-sm text-primary-text">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="font-display text-xl font-semibold text-primary-text">{s.t}</h3>
            <p className="text-sm leading-relaxed text-secondary-text">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-black/40 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">Judgment, not vibes</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-primary-text md:text-3xl">Two graders. One charter. Zero invention.</h2>
          <p className="mt-3 text-sm leading-relaxed text-secondary-text">
            Every ruling is produced twice against the pinned articles. Only exact agreement on the
            outcome and the violated set — with severity within ±15 — gets written into the registry.
          </p>
          <Link href="/how-it-works" className="mt-5 inline-block rounded-sm border border-line px-5 py-2.5 text-sm font-semibold text-primary-text hover:bg-ink3">
            Read the equivalence rules
          </Link>
        </div>
        <div className="rounded-lg border border-line bg-black/40 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">Start here</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-primary-text md:text-3xl">Put a proposal to the test.</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/app/new" className="rounded-sm bg-primary-text px-5 py-2.5 text-sm font-semibold text-black hover:bg-white">
              Submit a proposal
            </Link>
            <Link href="/app" className="rounded-sm border border-line px-5 py-2.5 text-sm font-semibold text-primary-text hover:bg-ink3">
              Browse proposals
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
