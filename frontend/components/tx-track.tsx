"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { EXPLORER_BASE } from "@/lib/config";
import { shortHash } from "@/lib/format";

export type TxTone = "wait" | "good" | "bad";
export interface TxItem {
  id: number;
  title: string;
  hash: string;
  tone: TxTone;
  note: string;
}

interface TxApi {
  push: (t: { title: string; hash: string; tone?: TxTone; note?: string }) => number;
  update: (id: number, patch: Partial<TxItem>) => void;
  dismiss: (id: number) => void;
}

const TxCtx = createContext<TxApi>({
  push: () => 0,
  update: () => {},
  dismiss: () => {},
});

export const useTx = () => useContext(TxCtx);

export function TxProvider({ children }: { children: React.ReactNode }) {
  const [txs, setTxs] = useState<TxItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback<TxApi["push"]>(({ title, hash, tone = "wait", note = "" }) => {
    const id = nextId.current++;
    setTxs((prev) => [{ id, title, hash, tone, note }, ...prev].slice(0, 4));
    return id;
  }, []);

  const update = useCallback<TxApi["update"]>((id, patch) => {
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const dismiss = useCallback<TxApi["dismiss"]>((id) => {
    setTxs((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  return (
    <TxCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {txs.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto rounded-md border border-parchment/15 bg-ink2 p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-sm font-semibold">{t.title}</p>
              <button className="text-parchdim hover:text-parchment" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ✕
              </button>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-parchdim">{shortHash(t.hash)}</p>
            {t.note && (
              <p className={`mt-1 text-xs ${t.tone === "bad" ? "text-seal" : "text-sage"}`}>{t.note}</p>
            )}
            <div className="mt-2 flex gap-2 text-xs">
              <button className="rounded border border-parchment/20 px-2 py-1 hover:bg-ink3" onClick={() => copy(t.hash)}>
                Copy hash
              </button>
              <a
                className="rounded border border-parchment/20 px-2 py-1 hover:bg-ink3"
                href={`${EXPLORER_BASE}/tx/${t.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Explorer ↗
              </a>
              {t.tone === "wait" && <span className="ml-auto self-center font-mono text-[11px] text-brass">sealing…</span>}
              {t.tone === "good" && <span className="ml-auto self-center font-mono text-[11px] text-pine">sealed ✓</span>}
              {t.tone === "bad" && <span className="ml-auto self-center font-mono text-[11px] text-seal">failed</span>}
            </div>
          </div>
        ))}
      </div>
    </TxCtx.Provider>
  );
}
