"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTx } from "@/components/tx-track";
import { useWallet } from "@/components/wallet-modal";
import { cn } from "@/lib/utils";
import { executionOutcome, friendlyError, read, write } from "@/lib/chain";
import { genToAtto, toNum } from "@/lib/format";
import { getAddress } from "@/lib/wallet";

interface Article {
  id: string;
  title: string;
  text: string;
}

export default function NewPact() {
  const router = useRouter();
  const wallet = useWallet();
  const tx = useTx();
  const [tab, setTab] = useState<"proposal" | "charter">("proposal");

  const [f, setF] = useState({
    id: "",
    title: "",
    body: "",
    atype: "treasury",
    amount: "1",
    recipient: getAddress() || "",
    rationale: "",
    window: "86400",
  });
  const [articles, setArticles] = useState<Article[]>([{ id: "A-1", title: "", text: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const input = "mt-1.5 w-full rounded-sm border border-parchment/20 bg-ink px-3 py-2 text-sm";

  async function submitProposal(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!getAddress()) {
      wallet.open();
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setError("");
    const id = f.id.trim();
    const tracker = tx.push({ title: `Submitting ${id}`, hash: "…" });
    try {
      const action =
        f.atype === "treasury"
          ? { type: "treasury", amount_atto: genToAtto(f.amount).toString(), recipient: f.recipient.trim() }
          : { type: "record" };
      const { hash, receipt } = await write(
        "submit_proposal",
        [id, f.title.trim(), f.body.trim(), JSON.stringify(action), f.rationale.trim(), BigInt(Number(f.window))],
        { onHash: (h) => tx.update(tracker, { hash: h }) }
      );
      const out = executionOutcome(receipt);
      if (out.expectedMessage) {
        tx.update(tracker, { tone: "bad", note: `Rejected: ${out.expectedMessage}` });
        setError(`Rejected: ${out.expectedMessage}`);
        return;
      }
      try {
        const check = await (await import("@/lib/chain")).read("get_proposal", [id]);
        if (!check || !check.proposal_id) throw new Error("missing");
      } catch {
        tx.update(tracker, { tone: "bad", note: "Finalized without visible effect — check the registry before retrying." });
        setError("Finalized but the proposal is not visible yet. Check the registry before submitting again.");
        return;
      }
      tx.update(tracker, { tone: "good", hash, note: "Proposal pinned to the charter." });
      router.push(`/app/proposal/${id}`);
    } catch (err) {
      const msg = friendlyError(err);
      tx.update(tracker, { tone: "bad", note: msg });
      setError(msg);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function publishCharter(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!getAddress()) {
      wallet.open();
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setError("");
    const tracker = tx.push({ title: "Publishing charter", hash: "…" });
    let preVersion = -1;
    try {
      try {
        preVersion = toNum(await read("get_current_version"));
      } catch {
        /* read failed — fall back to receipt outcome */
      }
      const clean = articles
        .map((a) => ({ id: a.id.trim(), title: a.title.trim(), text: a.text.trim() }))
        .filter((a) => a.id && a.title && a.text);
      if (clean.length === 0) {
        setError("Add at least one complete article (id, title, text).");
        return;
      }
      const { hash, receipt } = await write("publish_charter", [JSON.stringify(clean)], {
        onHash: (h) => tx.update(tracker, { hash: h }),
      });
      const out = executionOutcome(receipt);
      if (out.expectedMessage) {
        tx.update(tracker, { tone: "bad", note: `Rejected: ${out.expectedMessage}` });
        setError(`Rejected: ${out.expectedMessage}`);
        return;
      }
      if (preVersion >= 0) {
        try {
          const now = toNum(await read("get_current_version"));
          if (now <= preVersion) throw new Error("missing");
        } catch {
          tx.update(tracker, { tone: "bad", note: "Finalized without visible effect — check How it works before retrying." });
          setError("Finalized but no new version is visible yet. Check before publishing again.");
          return;
        }
      }
      tx.update(tracker, { tone: "good", hash, note: "New charter version sealed." });
      router.push("/app");
    } catch (err) {
      const msg = friendlyError(err);
      tx.update(tracker, { tone: "bad", note: msg });
      setError(msg);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  function setArticle(i: number, k: keyof Article, v: string) {
    setArticles((prev) => prev.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  }

  return (
    <div className="rise-in mx-auto max-w-3xl px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-brass">Registry desk</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Write it precisely.</h1>
      <div className="mt-4 flex gap-2 text-sm">
        <button onClick={() => setTab("proposal")} className={cn("rounded-sm px-3 py-1.5", tab === "proposal" ? "bg-ink3 text-parchment" : "text-parchdim hover:text-parchment")}>New proposal</button>
        <button onClick={() => setTab("charter")} className={cn("rounded-sm px-3 py-1.5", tab === "charter" ? "bg-ink3 text-parchment" : "text-parchdim hover:text-parchment")}>Publish charter</button>
      </div>

      {tab === "proposal" ? (
        <form className="mt-6 space-y-5 rounded-md border border-parchment/10 bg-ink2 p-6" onSubmit={submitProposal}>
          <div>
            <label className="text-xs text-parchdim" htmlFor="pid">Proposal ID — short, unique, no spaces</label>
            <input id="pid" value={f.id} onChange={(e) => set("id", e.target.value)} required pattern="[A-Za-z0-9_-]+" placeholder="treasury-docs-01" className={`${input} font-mono`} />
          </div>
          <div>
            <label className="text-xs text-parchdim" htmlFor="pt">Title</label>
            <input id="pt" value={f.title} onChange={(e) => set("title", e.target.value)} required placeholder="What should the DAO do?" className={input} />
          </div>
          <div>
            <label className="text-xs text-parchdim" htmlFor="pb">Body — the full proposal text the judges read</label>
            <textarea id="pb" value={f.body} onChange={(e) => set("body", e.target.value)} required rows={4} placeholder="Facts, scope, delivery, evidence…" className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-parchdim" htmlFor="at">Action type</label>
              <select id="at" value={f.atype} onChange={(e) => set("atype", e.target.value)} className={input}>
                <option value="treasury">Treasury payout</option>
                <option value="record">Record only (no money moves)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-parchdim" htmlFor="win">Execution window after ruling</label>
              <select id="win" value={f.window} onChange={(e) => set("window", e.target.value)} className={input}>
                <option value="300">5 minutes (demo)</option>
                <option value="3600">1 hour</option>
                <option value="86400">24 hours (recommended)</option>
                <option value="604800">7 days</option>
              </select>
            </div>
          </div>
          {f.atype === "treasury" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-parchdim" htmlFor="amt">Amount (GEN)</label>
                <input id="amt" value={f.amount} onChange={(e) => set("amount", e.target.value)} required inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" placeholder="1" className={`${input} font-mono`} />
              </div>
              <div>
                <label className="text-xs text-parchdim" htmlFor="rcp">Recipient (0x…)</label>
                <input id="rcp" value={f.recipient} onChange={(e) => set("recipient", e.target.value)} required pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" className={`${input} font-mono`} />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-parchdim" htmlFor="rat">Rationale — why this complies</label>
            <textarea id="rat" value={f.rationale} onChange={(e) => set("rationale", e.target.value)} rows={2} placeholder="Cite the articles…" className={input} />
          </div>
          {error && <p className="rounded-sm border border-seal/50 bg-sealdeep/20 px-3 py-2 text-sm text-seal" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="block" disabled={busy}>
            {busy ? "Pinning on-chain…" : "Submit proposal"}
          </Button>
        </form>
      ) : (
        <form className="mt-6 space-y-4 rounded-md border border-parchment/10 bg-ink2 p-6" onSubmit={publishCharter}>
          <p className="text-sm text-parchdim">Charter owner only. Versions are append-only — publishing never rewrites history.</p>
          {articles.map((a, i) => (
            <div key={i} className="rounded-sm border border-parchment/10 p-4">
              <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
                <input value={a.id} onChange={(e) => setArticle(i, "id", e.target.value)} placeholder="A-1" aria-label="Article id" className="rounded-sm border border-parchment/20 bg-ink px-3 py-2 font-mono text-sm" />
                <input value={a.title} onChange={(e) => setArticle(i, "title", e.target.value)} placeholder="Article title" aria-label="Article title" className="rounded-sm border border-parchment/20 bg-ink px-3 py-2 text-sm" />
                {articles.length > 1 && (
                  <button type="button" onClick={() => setArticles((p) => p.filter((_, j) => j !== i))} className="text-xs text-seal hover:underline" aria-label="Remove article">Remove</button>
                )}
              </div>
              <textarea value={a.text} onChange={(e) => setArticle(i, "text", e.target.value)} rows={2} placeholder="The rule, in plain words…" aria-label="Article text" className="mt-2 w-full rounded-sm border border-parchment/20 bg-ink px-3 py-2 text-sm" />
            </div>
          ))}
          {articles.length < 30 && (
            <button type="button" onClick={() => setArticles((p) => [...p, { id: `A-${p.length + 1}`, title: "", text: "" }])} className="text-sm text-brass hover:underline">
              + Add article
            </button>
          )}
          {error && <p className="rounded-sm border border-seal/50 bg-sealdeep/20 px-3 py-2 text-sm text-seal" role="alert">{error}</p>}
          <Button type="submit" variant="brass" size="block" disabled={busy}>
            {busy ? "Publishing…" : "Publish charter version"}
          </Button>
        </form>
      )}
    </div>
  );
}
