"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useWallet } from "./wallet-modal";
import { shortHash } from "@/lib/format";

export function TopNav() {
  const { address, open, lock } = useWallet();

  return (
    <header className="border-b border-parchment/10 bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1520px] items-center gap-6 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seal.svg" alt="GuardKing shield" className="h-8 w-8" />
          <span className="font-display text-lg font-bold tracking-tight">GuardKing</span>
        </Link>
        <nav className="ml-2 hidden items-center gap-5 text-sm text-parchdim sm:flex" aria-label="Primary">
          <Link href="/app" className="hover:text-parchment">Proposals</Link>
          <Link href="/app/new" className="hover:text-parchment">New proposal</Link>
          <Link href="/app/profile" className="hover:text-parchment">Profile</Link>
          <Link href="/how-it-works" className="hover:text-parchment">How it works</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[11px] text-sage md:inline">studionet</span>
          {!address ? (
            <button
              onClick={open}
              className="rounded-sm bg-brass px-3 py-1.5 text-sm font-semibold text-ink hover:bg-parchment"
            >
              Connect wallet
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/app/profile"
                title={address}
                className="flex items-center gap-2 rounded-sm border border-pine/50 px-3 py-1.5 font-mono text-xs text-pine hover:bg-ink3"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-pine"></span>
                {shortHash(address, 4)}
              </Link>
              <button
                onClick={lock}
                title="Disconnect wallet"
                aria-label="Disconnect wallet"
                className="rounded-sm border border-seal/50 p-1.5 text-seal hover:bg-seal hover:text-parchment"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
