"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAddress,
  lockWallet,
  rememberedRdns,
  rememberBrowserWallet,
  unlockWithKeystore,
  unlockWithPrivateKey,
  walletType,
} from "@/lib/wallet";
import {
  connectProvider,
  disconnectProvider,
  discoverWallets,
  silentReconnect,
  type DiscoveredWallet,
} from "@/lib/evm-wallets";
import { bindBrowserChain } from "@/lib/chain";
import { errText } from "@/lib/errors";

interface WalletApi {
  address: string | null;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  refresh: () => void;
  lock: () => void;
}

const WalletCtx = createContext<WalletApi>({
  address: null,
  isOpen: false,
  open: () => {},
  close: () => {},
  refresh: () => {},
  lock: () => {},
});

export const useWallet = () => useContext(WalletCtx);

type Tab = "browser" | "file" | "key";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("browser");
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [scanning, setScanning] = useState(false);
  const [fileText, setFileText] = useState("");
  const [password, setPassword] = useState("");
  const [privkey, setPrivkey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  /** Sync guard: returns false when another unlock is already running. */
  function claimBusy(): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    return true;
  }
  function freeBusy(): void {
    busyRef.current = false;
    setBusy(false);
  }

  const refresh = useCallback(() => setAddress(getAddress()), []);
  const open = useCallback(() => {
    setError("");
    refresh();
    setIsOpen(true);
  }, [refresh]);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    refresh();
    // After a tab reload the provider object is gone while the session
    // remains: silently reattach when the wallet still authorizes us.
    if (walletType() === "browser" && getAddress()) {
      silentReconnect(rememberedRdns(), getAddress() || "").then((ok) => {
        if (ok) refresh();
      });
    }
  }, [refresh]);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      setWallets(await discoverWallets());
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && tab === "browser") scan();
  }, [isOpen, tab, scan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function lock() {
    disconnectProvider();
    lockWallet();
    refresh();
  }

  /** Two isolated steps so the real culprit is visible: accounts first,
   *  chain binding second. A bind failure keeps the wallet connected but
   *  warns — writes will prompt the network switch at signing time. */
  async function connectBrowser(w: DiscoveredWallet) {
    if (!claimBusy()) return;
    try {
      const addr = await connectProvider(w);
      rememberBrowserWallet(addr, w.rdns);
      try {
        await bindBrowserChain();
      } catch (bindErr) {
        refresh();
        setError(
          `Connected to ${w.name}, but the GenLayer network switch needs approval: ${errText(bindErr)} — approve it in the wallet, then retry any action.`
        );
        return;
      }
      refresh();
      close();
    } catch (e) {
      const msg = errText(e);
      if (/rejected|denied|user/i.test(msg)) setError("Connection rejected in wallet. Click the wallet again to retry.");
      else setError(`Could not connect to ${w.name}: ${msg.slice(0, 200)}`);
    } finally {
      freeBusy();
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setFileText(String(r.result || ""));
    r.onerror = () => setError("Could not read that file.");
    r.readAsText(f);
  }

  async function unlockFile() {
    if (!claimBusy()) return;
    try {
      await unlockWithKeystore(fileText, password);
      setPassword("");
      setFileText("");
      refresh();
      close();
    } catch {
      setError("Wrong password or invalid keystore file. Check both and retry.");
    } finally {
      freeBusy();
    }
  }

  function unlockKey() {
    if (!claimBusy()) return;
    try {
      unlockWithPrivateKey(privkey);
      setPrivkey("");
      refresh();
      close();
    } catch {
      setError("That doesn't look like a valid private key.");
    } finally {
      freeBusy();
    }
  }

  return (
    <WalletCtx.Provider value={{ address, isOpen, open, close, refresh, lock }}>
      {children}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Connect a wallet"
        >
          <div
            className="brass-frame rise-in w-full max-w-md rounded-md bg-ink2 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">Wallet</p>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  {address ? "Connected" : "Connect a wallet"}
                </h2>
              </div>
              <button onClick={close} aria-label="Close" className="rounded-sm px-2 py-1 text-parchdim hover:bg-ink3 hover:text-parchment">✕</button>
            </div>

            {address ? (
              <div className="mt-4">
                <p className="mt-1 break-all font-mono text-sm text-pine">{address}</p>
                <p className="mt-2 text-xs text-parchdim">Key lives in this tab only and is forgotten when the tab closes.</p>
                <Button variant="danger" size="sm" className="mt-4" onClick={lock}>Lock wallet</Button>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2 text-sm">
                  <button onClick={() => setTab("browser")} className={cn("rounded-sm px-3 py-1.5", tab === "browser" ? "bg-ink3 text-parchment" : "text-parchdim hover:text-parchment")}>Browser</button>
                  <button onClick={() => setTab("file")} className={cn("rounded-sm px-3 py-1.5", tab === "file" ? "bg-ink3 text-parchment" : "text-parchdim hover:text-parchment")}>Keystore</button>
                  <button onClick={() => setTab("key")} className={cn("rounded-sm px-3 py-1.5", tab === "key" ? "bg-ink3 text-parchment" : "text-parchdim hover:text-parchment")}>Key</button>
                </div>

                {tab === "browser" && (
                  <div className="mt-4">
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {wallets.map((w) => (
                        <button
                          key={w.rdns}
                          disabled={busy}
                          onClick={() => connectBrowser(w)}
                          className="flex w-full items-center gap-3 rounded-sm border border-parchment/15 px-3 py-2.5 text-left hover:border-brass/60 hover:bg-ink3 disabled:opacity-50"
                        >
                          {w.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.icon} alt="" className="h-7 w-7 rounded-full" />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-brass font-display text-sm font-bold text-brass">
                              {w.name.slice(0, 1)}
                            </span>
                          )}
                          <span className="text-sm font-semibold">{w.name}</span>
                          <span className="ml-auto font-mono text-[11px] text-brass">{busy ? "…" : "→"}</span>
                        </button>
                      ))}
                    </div>
                    {wallets.length === 0 && !scanning && (
                      <div className="mt-2 rounded-sm border border-dashed border-parchment/25 px-4 py-4 text-sm text-parchdim">
                        <p>No browser wallet detected.</p>
                        <p className="mt-2 flex gap-3 text-xs">
                          <a className="text-brass underline underline-offset-2" href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask ↗</a>
                          <a className="text-brass underline underline-offset-2" href="https://rabby.io/" target="_blank" rel="noreferrer">Rabby ↗</a>
                        </p>
                        <button className="mt-2 text-xs underline underline-offset-2" onClick={scan}>Rescan</button>
                      </div>
                    )}
                    {scanning && <p className="mt-2 font-mono text-xs text-sage">Scanning for wallets…</p>}
                  </div>
                )}

                {tab === "file" && (
                  <div className="mt-4">
                    <label className="block text-xs text-parchdim" htmlFor="wm-ks">Keystore JSON file</label>
                    <input id="wm-ks" type="file" accept=".json,application/json" onChange={onFile} className="mt-2 block w-full text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-ink3 file:px-3 file:py-2 file:text-parchment" />
                    <label className="mt-3 block text-xs text-parchdim" htmlFor="wm-pw">Password</label>
                    <input id="wm-pw" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="off" placeholder="••••••••" className="mt-2 w-full rounded-sm border border-parchment/20 bg-ink px-3 py-2 text-sm" />
                    <Button variant="brass" size="block" disabled={!fileText || !password || busy} onClick={unlockFile} className="mt-4">
                      {busy ? "Decrypting…" : "Unlock keystore"}
                    </Button>
                  </div>
                )}

                {tab === "key" && (
                  <div className="mt-4">
                    <label className="block text-xs text-parchdim" htmlFor="wm-pk">Private key (0x…)</label>
                    <input id="wm-pk" value={privkey} onChange={(e) => setPrivkey(e.target.value)} type="password" autoComplete="off" placeholder="0x…" className="mt-2 w-full rounded-sm border border-parchment/20 bg-ink px-3 py-2 font-mono text-sm" />
                    <Button variant="brass" size="block" disabled={!privkey || busy} onClick={unlockKey} className="mt-4">
                      {busy ? "Checking…" : "Use this key"}
                    </Button>
                  </div>
                )}

                {error && <p className="mt-3 rounded-sm border border-seal/50 bg-sealdeep/20 px-3 py-2 text-sm text-seal" role="alert">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </WalletCtx.Provider>
  );
}
