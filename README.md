# GuardKing

**Charter compliance for DAOs — no proposal above the charter.**

[![GenLayer](https://img.shields.io/badge/GenLayer-studionet-8B38B7)](https://docs.genlayer.com/)
[![Contract](https://img.shields.io/badge/contract-0xea81D2Bd…66FF5B9-blue)](https://explorer-studio.genlayer.com/address/0xea81D2Bd097c087346661539673eBB3C066FF5B9)
[![Frontend](https://img.shields.io/badge/frontend-Next.js_16-black)](./frontend)
[![Tests](https://img.shields.io/badge/pytest-4_passed-green)](#development)

DAOs vote, but votes don't check constitutions. GuardKing pins every proposal to a
versioned on-chain charter and lets independent AI validators rule on compliance
before a single GEN moves: full treasury payout on clean rulings, automatic block
on breaches — with one appeal round and no locked funds.

No councils, no chat debates, no rubber stamps. Judgment is trustless.

[How it works](#-how-it-works) · [Smart contract](#-smart-contract) · [dApp](#-dapp) · [Development](#-development)

---

## 📖 About

`Guard` (enforcement) + `King` (final authority of the charter). GuardKing turns the
GenLayer use case *"Policy and rule evaluation"* into a working product:

1. The DAO publishes its charter as numbered articles (append-only versions).
2. Anyone submits a proposal pinned to a charter version: body, treasury action, rationale.
3. Leader + validator AIs independently grade compliance (`compliant`, violated
   article ids, `severity`) through on-chain consensus.
4. After the window: permissionless execution — treasury pays on approval, nothing
   moves on breach. One appeal round, then the ruling stands.

## ⚙️ How it works

```
publish_charter(articles) ──▶ version N (append-only, immutable history)
        │
submit_proposal(title, body, action, rationale) ──▶ pending (pins version N)
        │  treasury actions validated up front (amount, recipient)
        ▼
fund_treasury (payable, anyone) ──▶ shared pot backs payouts
        ▼
review_proposal (owner) ── consensus ──▶ approved ──▶ reserve payout
     leader: grade vs pinned articles      │              execute_after = now + window
     validator: rerun + compare fields     │                         │
     (exact ruling + article set, ±15)     │                         ▼
                                           │              execute_proposal (anyone, after window)
                                           │                treasury → recipient · reserve released
                                           └─▶ rejected ──▶ terminal (or appeal)
open_appeal (proposer/owner, 1 round, pre-window) ──▶ disputed
resolve_appeal ── consensus with note ──▶ new ruling (timers reset)
cancel_proposal (proposer/owner, while pending) ──▶ cancelled
withdraw_treasury (owner, unreserved only) ──▶ reclaim free funds
```

**Consensus rule** (custom `run_nondet_unsafe` validator): `compliant` must match
exactly, `violated` article sets must match exactly (ids bound to the on-chain
charter — unknown ids are rejected as malformed), `severity` within ±15 (zero must
be unanimous). `FINALIZED` alone never means success: execution results are always checked.

## 📜 Smart contract

`contracts/guardking.py` — `GuardKing` (`gl.Contract`, pinned runner, `TreeMap`/
`DynArray`/`u256`/`Address` storage, atto-scale wei, deterministic tx-time, no `float`).

| Method | Type | Description |
|---|---|---|
| `publish_charter` | write | New immutable version (owner, ≤30 articles, validated) |
| `submit_proposal` | write | New proposal → `pending` (pins version, validates action) |
| `fund_treasury` | write payable | Shared pot top-up (zero-value refused) |
| `review_proposal` | write + consensus | AI ruling, reservation applied, timers set |
| `open_appeal` | write | Proposer/owner, 1 round, pre-window |
| `resolve_appeal` | write + consensus | Re-grade with note, timers reset |
| `execute_proposal` | write | Permissionless payout after window |
| `cancel_proposal` | write | Proposer/owner withdrawal while pending |
| `withdraw_treasury` | write | Owner reclaim of unreserved funds only |
| `get_proposal` / `get_verdict_card` | view | Reads (card = one-call frontend bundle) |
| `get_charter` / `list_proposals` | view | Versioned articles, index |
| `get_equivalence_info` | view | Consensus rules, live from chain |

Network: **GenLayer studionet**.

**Contract:** `0xea81D2Bd097c087346661539673eBB3C066FF5B9`
([view in explorer](https://explorer-studio.genlayer.com/address/0xea81D2Bd097c087346661539673eBB3C066FF5B9))

> Approved-but-unexecuted payouts stay reserved: withdrawals can never steal a
> pending execution, and every amount moving on-chain is capped by real escrow.

## 🖥️ dApp

`frontend/` — Next.js 16 App Router + TypeScript + Tailwind v4 + `genlayer-js` + shadcn-style
components, animated raycast field, bento-grid hero.

| Route | Purpose |
|---|---|
| `/` | Bento hero with live stats + lifecycle + judgment rules |
| `/how-it-works` | The five-part machine + live equivalence rules from chain |
| `/app` | Proposals registry: tabs (All / Mine), status + search filters |
| `/app/new` | Submit proposal + publish charter (article editor) |
| `/app/proposal/[id]` | Ruling shield, pinned articles, violated chips, actions, consensus trail |
| `/app/profile` | Your proposals, treasury balance |
| `/api/rpc` | Same-origin RPC proxy (Studio RPC has no browser CORS headers) |
| `/api/history` | Slim per-proposal consensus trail from the Studio explorer API |

Wallet options (modal, one click): **browser wallet** (EIP-6963 picker),
**keystore file**, **private key**. Keys live in session storage only.

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000
```

## 🗂️ Project structure

```
guard-king/
├── contracts/        # GuardKing intelligent contract (GenLayer/Python)
├── tests/            # Fast unit tests for LLM-resilience parsers (pytest)
├── tools/            # call.mjs — typed writes via genlayer-js (CLI mangles quotes)
├── frontend/         # Next.js 16 dApp (TypeScript, Tailwind, shadcn-style)
│   ├── app/          # routes (+ /api/rpc, /api/history)
│   ├── components/   # shield, wallet-modal, tx-track, top-nav, ui/
│   └── lib/          # chain client, wallet session, EIP-6963, formatting
├── AGENTS.md         # standing agent memory (rules paid for in debugging hours)
└── DESIGN.md         # approved v1 design + live deployment
```

## 🛠️ Development

```bash
genvm-lint check contracts/guardking.py   # must pass, pinned runner
genvm-lint typecheck contracts/guardking.py
python -m pytest tests/ -v                # LLM-parser unit tests
genlayer deploy --contract contracts/guardking.py
node tools/call.mjs <method> @args.json [valueGen]   # KSPW env for keystore
```

Notes: the CLI mangles quoted JSON args — file-based args via `tools/`; `u256`
travels as `bigint`; reads are throttled client-side under the 30 req/min RPC budget.

## 🔒 Security model

- Charter owner gates publishing, review triggers, and withdrawals; proposals stay
  open to anyone (fees deter spam).
- Dual-party appeals: proposer **or** owner can open/resolve (both on-chain addresses).
- No locked funds: permissionless execution after the window; reserved counter
  protects pending payouts from withdrawals; plain transfers refused.
- No double actions: executed flags, single appeal round, duplicate guards,
  frontend ref-guards against double-click transactions.
- Unverified text stays display-only: the LLM `reason` never drives execution.
