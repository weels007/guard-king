"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { read } from "@/lib/chain";

const SECTIONS = [
  {
    t: "1 · Write the charter",
    d: "The charter is a versioned list of articles with stable ids. Publishing a new version never rewrites history: proposals already in flight stay pinned to the version they were submitted under.",
    points: ["Max 30 articles per version, each with id, title, and text", "Only the charter owner can publish", "Every version stays readable forever for audit"],
  },
  {
    t: "2 · Propose openly",
    d: "Anyone submits a proposal: title, body, a treasury-or-record action, and a rationale. The proposal pins the current charter version at submit time.",
    points: ["Treasury actions name amount and recipient up front", "Spam costs real transaction fees", "Proposer or owner can cancel while pending"],
  },
  {
    t: "3 · Get judged",
    d: "The charter owner triggers review. A leader validator grades the proposal; the rest independently re-grade the same pinned text and compare only what matters: the ruling exactly, the violated article set exactly, severity within ±15.",
    points: ["Article ids must be copied exactly — invented rules fail validation", "A breach with no listed article is rejected as malformed", "Reasons are display-only and never drive execution"],
  },
  {
    t: "4 · Appeal once",
    d: "Proposer or charter owner can force a re-review with a note before the execution window opens. One round, then the ruling stands.",
    points: ["Fresh context, same articles, same comparison rules", "Timers reset on the new ruling"],
  },
  {
    t: "5 · Execute if clean",
    d: "After the window closes, anyone triggers execution. Approved treasury proposals pay the recipient in full; everything else just records the outcome. Rejected proposals can never execute.",
    points: ["Insufficient treasury balance blocks execution honestly", "Double execution impossible", "Fund the treasury any time with a payable top-up"],
  },
];

export default function HowItWorks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [eq, setEq] = useState<any>(null);
  const [eqNote, setEqNote] = useState("Reading the rules from chain…");

  useEffect(() => {
    read("get_equivalence_info")
      .then(setEq)
      .catch(() => setEqNote("Rules unreachable right now — the chain may be busy."));
  }, []);

  return (
    <div className="rise-in mx-auto max-w-[1520px] px-4 py-14">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-brass">How it works</p>
      <h1 className="mt-3 font-display text-4xl font-bold md:text-5xl">A charter is a machine with five moving parts.</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-parchdim">
        Each part is enforced on-chain by the GuardKing contract on GenLayer. Nothing runs on
        anyone&apos;s server — every decision reproduced here can be re-read from the registry.
      </p>

      <section className="mt-10 space-y-6">
        {SECTIONS.map((s) => (
          <article key={s.t} className="rounded-md border border-parchment/10 bg-ink2 p-6">
            <h2 className="font-display text-2xl font-semibold">{s.t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-parchdim">{s.d}</p>
            {s.points && (
              <ul className="mt-4 space-y-2">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm">
                    <span className="text-brass">▪</span>
                    <span className="text-parchdim">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section className="brass-frame mt-10 rounded-md bg-ink2 p-6">
        <h2 className="font-display text-2xl font-semibold">The equivalence rules, verbatim</h2>
        <p className="mt-2 text-sm text-parchdim">Fetched live from the contract — the same rules every ruling was judged under.</p>
        {eq ? (
          <dl className="mt-4 grid gap-x-8 gap-y-3 font-mono text-xs sm:grid-cols-2">
            {Object.entries(eq).map(([k, v]) => (
              <div key={k} className="ledger-row py-2">
                <dt className="uppercase tracking-wider text-brass">{k}</dt>
                <dd className="mt-1 text-parchment">{JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 font-mono text-xs text-sage">{eqNote}</p>
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/app/new" className="rounded-sm bg-primary-text px-5 py-2.5 text-sm font-semibold text-black hover:bg-white">
          Submit a proposal
        </Link>
        <Link href="/app" className="rounded-sm border border-parchment/25 px-5 py-2.5 text-sm font-semibold hover:bg-ink2">
          Browse proposals
        </Link>
      </div>
    </div>
  );
}
