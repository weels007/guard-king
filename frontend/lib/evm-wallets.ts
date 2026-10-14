"use client";
// EIP-1193 / EIP-6963 browser wallet support (MetaMask, Rabby, and any
// injected wallet). Discovery never fights over the page: every announced
// provider is listed and the user picks exactly one.

export interface EIP1193Provider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on?: (event: string, cb: (...a: any[]) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener?: (event: string, cb: (...a: any[]) => void) => void;
}

export interface DiscoveredWallet {
  rdns: string;
  name: string;
  icon: string;
  provider: EIP1193Provider;
}

let cache: DiscoveredWallet[] | null = null;
let connectedProvider: EIP1193Provider | null = null;

/** Discover all injected wallets via EIP-6963, plus legacy fallback. */
export function discoverWallets(timeoutMs = 800): Promise<DiscoveredWallet[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (cache) return Promise.resolve(cache);
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        info: { rdns: string; name: string; icon: string };
        provider: EIP1193Provider;
      };
      if (!d?.info?.rdns || found.has(d.info.rdns)) return;
      found.set(d.info.rdns, { rdns: d.info.rdns, name: d.info.name, icon: d.info.icon, provider: d.provider });
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      // Legacy fallback for wallets without EIP-6963 (older MetaMask).
      const legacy = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (legacy && ![...found.values()].some((w) => w.provider === legacy)) {
        found.set("legacy", { rdns: "legacy", name: "Injected wallet", icon: "", provider: legacy });
      }
      cache = [...found.values()];
      resolve(cache);
    }, timeoutMs);
  });
}

export function getConnectedProvider(): EIP1193Provider | null {
  return connectedProvider;
}

/** Request accounts from the chosen provider. Returns the first address. */
export async function connectProvider(w: DiscoveredWallet): Promise<string> {
  const accounts = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) throw new Error("Wallet returned no accounts.");
  connectedProvider = w.provider;
  watchAccounts(w.provider);
  return accounts[0];
}

export function disconnectProvider(): void {
  connectedProvider = null;
  cache = null;
}

const STUDIONET_CHAIN = {
  chainId: "0xF22F", // 61999
  chainName: "Genlayer Studio Network",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
};

/**
 * Universal chain bind: plain EIP-3326/3085 switch-or-add. The SDK's
 * connect() goes through wallet_getSnaps, which Rabby (and others) don't
 * implement — hence code -32601. This works on MetaMask, Rabby, and any
 * EIP-1193 wallet.
 */
export async function ensureStudionet(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN.chainId }],
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({ method: "wallet_addEthereumChain", params: [STUDIONET_CHAIN] });
    } else {
      throw e;
    }
  }
}

/**
 * Silent recovery after a tab reload: the provider object is gone but the
 * session remembers which wallet (rdns) and address were used. Re-discover,
 * then ask for accounts WITHOUT a popup (eth_accounts only returns
 * already-authorized ones). Returns true when the same address is back.
 */
export async function silentReconnect(rdns: string, address: string): Promise<boolean> {
  try {
    const wallets = await discoverWallets();
    const match =
      wallets.find((w) => w.rdns === rdns) ||
      (rdns === "legacy" ? wallets[0] : undefined);
    if (!match) return false;
    const accounts = (await match.provider.request({ method: "eth_accounts" })) as string[];
    const hit = (accounts || []).find((a) => a.toLowerCase() === address.toLowerCase());
    if (!hit) return false;
    connectedProvider = match.provider;
    watchAccounts(match.provider);
    return true;
  } catch {
    return false;
  }
}

let watching = false;
/** Keep the session honest when the user switches/locks accounts in-wallet. */
export function watchAccounts(provider: EIP1193Provider): void {
  if (watching || !provider.on) return;
  watching = true;
  provider.on("accountsChanged", (accs: unknown) => {
    const list = Array.isArray(accs) ? accs : [];
    if (list.length === 0) {
      // Wallet locked or disconnected: drop the session loudly.
      disconnectProvider();
      window.dispatchEvent(new Event("guardking:wallet"));
    }
  });
}
