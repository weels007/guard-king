import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { TxProvider } from "@/components/tx-track";
import { WalletProvider } from "@/components/wallet-modal";
import { Component as RaycastBlue } from "@/components/ui/raycast-animated-blue-background";
import { shortHash } from "@/lib/format";
import { CONTRACT_ADDRESS, NETWORK_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "GuardKing — Charter Compliance for DAOs",
  description: "GuardKing — every proposal judged against the charter before it can execute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/seal.svg" />
      </head>
      <body>
        {/* Global animated field: one shared raycast backdrop for every page */}
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
          <RaycastBlue opacity={0.35} />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10">
        <TxProvider>
          <WalletProvider>
          <TopNav />
          <main className="min-h-[calc(100vh-120px)]">{children}</main>
          <footer className="border-t border-parchment/10">
            <div className="mx-auto flex max-w-[1520px] flex-col gap-2 px-4 py-6 text-xs text-sage sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 font-display italic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="GuardKing emblem" className="h-8 w-8" />
                GuardKing — no proposal above the charter.
              </p>
              <p className="font-mono sm:ml-auto">
                contract {shortHash(CONTRACT_ADDRESS, 8)} · {NETWORK_NAME}
              </p>
            </div>
          </footer>
          </WalletProvider>
        </TxProvider>
        </div>
      </body>
    </html>
  );
}
