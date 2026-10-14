"use client";

import React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HaosShowcaseProps {
  bg?: React.ReactNode;
  category?: string;
  year?: string | number;
  solutionLabel?: string;
  solutionValue?: string;
  title?: string;
  subtitle?: string;
  statLabel?: string;
  statValue?: string;
  bottomValue?: string;
  progressPercent?: number;
  logoText?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Bento-grid hero: corner metadata cells, central claim, emblem cell,
 * progress ledger and a circular action. Fueled by live chain data.
 */
export default function HaosShowcase({
  bg,
  category = "CATEGORY",
  year = "2026",
  solutionLabel = "TECH SOLUTIONS",
  solutionValue = "—",
  title = "GuardKing",
  subtitle = "Charter compliance for DAOs",
  statLabel = "RULED",
  statValue = "—",
  bottomValue = "—",
  progressPercent = 0,
  logoText = "GK",
  actionHref,
  onAction,
  className,
}: HaosShowcaseProps) {
  const clamped = Math.max(0, Math.min(100, progressPercent));
  const actionInner = (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-black/60 text-primary-text transition-all group-hover:border-glow-2 group-hover:text-white group-hover:shadow-[0_0_24px_var(--glow-color-2)]">
        <ArrowUpRight size={22} />
      </span>
    </>
  );
  return (
    <section
      className={cn(
        "relative grid w-full grid-cols-2 overflow-hidden rounded-lg border border-line bg-black/40 md:grid-cols-4",
        className
      )}
      role="region"
      aria-label="GuardKing showcase"
    >
      {bg && <div className="pointer-events-none absolute inset-0">{bg}</div>}

      <div className="relative border-b border-r border-line p-4">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">{category}</span>
        <span className="mt-1 block font-mono text-xs text-primary-text">{solutionValue}</span>
      </div>
      <div className="relative border-b border-line p-4 md:border-r">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">Year</span>
        <span className="mt-1 block font-mono text-xs text-primary-text">{year}</span>
      </div>
      <div className="relative hidden border-b border-r border-line p-4 md:block">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">{solutionLabel}</span>
        <span className="mt-1 block font-mono text-xs text-primary-text">Charter compliance</span>
      </div>
      <div className="relative hidden border-b border-line p-4 md:block">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">Network</span>
        <span className="mt-1 block font-mono text-xs text-primary-text">GenLayer studionet</span>
      </div>

      <div className="relative col-span-2 border-b border-line p-6 md:col-span-3 md:p-10">
        <h1 className="font-display text-4xl font-bold leading-[1.02] tracking-tight text-primary-text md:text-6xl">
          {title}
        </h1>
        <h2 className="mt-2 font-display text-lg italic text-secondary-text md:text-xl">{subtitle}</h2>
        <div className="mt-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-text">{statLabel}</span>
          <div className="font-display text-3xl font-bold text-primary-text md:text-4xl">{statValue}</div>
        </div>
      </div>

      <div className="relative col-span-2 flex items-center justify-center border-b border-line p-6 md:col-span-1">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-line bg-black/60 font-display text-2xl font-bold text-primary-text shadow-[0_0_32px_var(--glow-color-1)]">
          {logoText}
        </div>
      </div>

      <div className="relative col-span-2 border-r border-line p-4 md:col-span-3">
        <div className="font-mono text-sm text-primary-text">{bottomValue}</div>
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded bg-line/40"
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded bg-[linear-gradient(90deg,var(--glow-color-2),var(--glow-color-1))] transition-all"
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>

      <div className="group relative flex items-center justify-end p-4 md:col-span-1 md:justify-center">
        {actionHref ? (
          <a
            href={actionHref}
            role="button"
            tabIndex={0}
            aria-label="Perform action"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAction?.();
              }
            }}
            onClick={onAction}
          >
            {actionInner}
          </a>
        ) : (
          <span
            role="button"
            tabIndex={0}
            aria-label="Perform action"
            onClick={onAction}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAction?.();
              }
            }}
          >
            {actionInner}
          </span>
        )}
      </div>
    </section>
  );
}
