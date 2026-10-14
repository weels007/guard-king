"use client";
// Wallet session: two kinds —
//   local:   private key in sessionStorage (keystore file / raw key)
//   browser: EIP-1193 provider held in memory + address in sessionStorage
// Nothing secret ever touches disk; tab close forgets everything.
import { Wallet } from "ethers";
import { createAccount } from "genlayer-js";

const KEY = "guardking.pk";
const TYPE = "guardking.wtype";
const ADDR = "guardking.waddr";
const RDNS = "guardking.wrdns";
const EVT = "guardking:wallet";

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}

export function onWalletChange(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}

export type WalletType = "local" | "browser" | null;

export function walletType(): WalletType {
  if (typeof window === "undefined") return null;
  const t = sessionStorage.getItem(TYPE);
  if (t === "browser") return "browser";
  if (sessionStorage.getItem(KEY)) return "local";
  return null;
}

export function hasWallet(): boolean {
  return walletType() !== null;
}

export function getPrivateKey(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY);
}

export function getAddress(): string | null {
  if (typeof window === "undefined") return null;
  if (sessionStorage.getItem(TYPE) === "browser") return sessionStorage.getItem(ADDR);
  const pk = getPrivateKey();
  if (!pk) return null;
  try {
    return new Wallet(pk).address;
  } catch {
    return null;
  }
}

export async function unlockWithKeystore(jsonText: string, password: string): Promise<string> {
  const wallet = await Wallet.fromEncryptedJson(jsonText, password);
  sessionStorage.setItem(KEY, wallet.privateKey);
  sessionStorage.setItem(TYPE, "local");
  sessionStorage.removeItem(ADDR);
  notify();
  return wallet.address;
}

export function unlockWithPrivateKey(pk: string): string {
  const clean = pk.trim().startsWith("0x") ? pk.trim() : `0x${pk.trim()}`;
  const wallet = new Wallet(clean); // throws on invalid key
  sessionStorage.setItem(KEY, wallet.privateKey);
  sessionStorage.setItem(TYPE, "local");
  sessionStorage.removeItem(ADDR);
  notify();
  return wallet.address;
}

/** Remember a browser-wallet address (provider itself stays in memory). */
export function rememberBrowserWallet(address: string, rdns = ""): void {
  sessionStorage.setItem(TYPE, "browser");
  sessionStorage.setItem(ADDR, address);
  if (rdns) sessionStorage.setItem(RDNS, rdns);
  else sessionStorage.removeItem(RDNS);
  sessionStorage.removeItem(KEY);
  notify();
}

export function rememberedRdns(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(RDNS) || "";
}

export function lockWallet(): void {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(TYPE);
  sessionStorage.removeItem(ADDR);
  sessionStorage.removeItem(RDNS);
  notify();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function genlayerAccount(): any {
  const pk = getPrivateKey();
  if (!pk) return null;
  return createAccount(pk as `0x${string}`);
}
