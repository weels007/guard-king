# GuardKing — Design v1 (approved + live)

> Scope: review + treasury payout. Appeal: proposer or charter-owner, 1 round.
> Live: `0xea81D2Bd097c087346661539673eBB3C066FF5B9` (studionet, all flows tested).

> Scope: review + treasury payout. Appeal: proposer or charter-owner, 1 round.

## Lifecycle

```
publish_charter(articles) ──▶ version N (append-only, immutable once superseded)
        │
submit_proposal(title, body, action{type, amount, recipient}, rationale)
        │  pins charter_version=N · permissionless · author recorded
        ▼  status = pending
review_proposal ── consensus ──▶ approved ──▶ reputation? none (no agents)
     leader: grade body+action      │              execute_after = now + window
     against pinned articles        │                         │
     validator: rerun, compare      │                         ▼
     compliant+violated+severity    │              execute_proposal (anyone, after window)
                                    │                treasury type → emit_transfer to recipient
                                    │                → status executed
                                    └─▶ rejected ──▶ terminal (or appeal)
open_appeal (proposer OR owner, 1 round, before execute_after)
        │  appellant note stored, status = disputed
        ▼
resolve_appeal ── consensus (note + pinned articles) ──▶ approved/rejected
cancel_proposal (proposer or owner, while pending) ──▶ cancelled
fund_treasury (payable, anyone) ──▶ contract balance backs payouts
```

## Consensus rule (mirrors PactLedger, adapted)
- Decision fields: `compliant` (exact), `violated` article-id SET (exact as sets),
  `severity` 0–100 (±15 tolerance, unanimous-zero gate).
- `reason` display-only, never drives execution or appeal.
- Evidence = pinned charter text + proposal body/action (all on-chain, same input
  for leader and validators). No URL fetching in v1 (nothing external to fetch).

## Storage
- `charters: DynArray[str]` (each = JSON list of {id,title,text}), append-only.
- `current_version: u256`.
- `Proposal` dataclass: id, proposer: Address, title, body, action_json,
  charter_version: u256, status, appeal_count: u256, executed: bool,
  verdict_time/settle_after→`execute_after: u256`, appeal_note.
- `Verdict`: compliant, violated_json (list of article ids), severity, reason.
- `proposals: TreeMap[str, Proposal]`, `proposal_ids: DynArray[str]`,
  `verdicts: TreeMap[str, Verdict]`.
- Treasury: `self.balance` checked at execute time (no separate ledger).

## Access matrix
| Action | Who |
|---|---|
| publish_charter, cancel (any pending) | charter owner only |
| submit_proposal | anyone (fees deter spam) |
| review_proposal | charter owner triggers (pays consensus gas) |
| open_appeal / resolve_appeal | proposer OR owner, 1 round, pre-execute_after |
| execute_proposal | anyone, after execute_after, once |
| fund_treasury | anyone, payable |

## Guards (from AGENTS.md, applied)
- Charter versions immutable; proposals pin version (no retroactive rule change).
- Execution only from `approved` + window passed + unexecuted + balance covers.
- Appeal reverses nothing monetary (no reputation in v1) but resets timers.
- Caps: articles ≤ 30/version, 5000 chars body, note ≤ 2000.
- Views: `get_proposal_card` (proposal + verdict + articles snapshot meta),
  `get_charter`, `list_proposals`, `get_equivalence_info`.
