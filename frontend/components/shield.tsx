"use client";

export type ShieldKind = "compliant" | "breached" | "disputed" | "open" | "settled" | "pending";

const INK: Record<ShieldKind, string> = {
  compliant: "#7ee387",
  settled: "#7ee387",
  breached: "#e5484d",
  disputed: "#95bdc9",
  open: "#7fa8cf",
  pending: "#484e58",
};

const LABEL: Record<ShieldKind, string> = {
  compliant: "Pass",
  settled: "Done",
  breached: "Block",
  disputed: "Appeal",
  open: "Open",
  pending: "Guard",
};

export function Shield({
  kind = "pending",
  score = null,
  size = "md",
}: {
  kind?: ShieldKind;
  score?: number | string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? "h-32 w-28" : size === "sm" ? "h-14 w-12" : "h-20 w-[4.5rem]";
  const labelCls = size === "lg" ? "text-xl" : size === "sm" ? "text-[9px]" : "text-[11px]";
  const subCls = size === "lg" ? "text-sm" : size === "sm" ? "text-[9px]" : "text-[10px]";
  return (
    <div
      className="seal-stamp inline-flex items-center justify-center"
      style={{ color: INK[kind] }}
      role="img"
      aria-label={`Shield: ${LABEL[kind]}`}
    >
      <svg viewBox="0 0 72 84" className={dims} fill="none" aria-hidden="true">
        <path
          d="M36 3 66 13v26c0 19-12.5 31.5-30 42C18.5 70.5 6 58 6 39V13L36 3z"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M36 10 59 17.5V39c0 15-10 25.5-23 33.5C23 64.5 13 54 13 39V17.5L36 10z"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.7"
        />
        <text
          x="36"
          y="42"
          textAnchor="middle"
          fontFamily="'Space Grotesk', Inter, sans-serif"
          fontWeight="bold"
          fontSize={size === "lg" ? 15 : size === "sm" ? 10 : 12}
          fill="currentColor"
          className={labelCls}
        >
          {LABEL[kind].toUpperCase()}
        </text>
        {score !== null && score !== undefined && score !== "" && (
          <text x="36" y="58" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={size === "lg" ? 13 : 10} fill="currentColor" className={subCls}>
            {String(score)}
          </text>
        )}
      </svg>
    </div>
  );
}
