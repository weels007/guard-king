# GuardKing — Agent Memory

> DAO compliance guard on GenLayer: every proposal is checked against the DAO
> charter by independent AI validators before it can execute.
> Read this file at the start of every session. Keep it updated when a new
> hard-won rule is discovered. Past work (PactLedger) is the reference
> implementation — steal its patterns, don't rediscover them.

## Mission
- On-chain charter registry + proposal review + execution gate + appeal.
- Network: **studionet until production**. Wallet: **pactledger only**
  (`0xF615a9F8E6D94964e325C2D7BA417c723d48786F`, keystore in `weels/wallet/`).
- Reference repo: `weels007/pact-ledger` (contract patterns, frontend, tooling).

## Contract rules (paid for in debugging hours — do not violate)
1. **Pinned runner first line**, no exceptions:
   `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`
   Never `test` / `latest` / unversioned.
2. **Sender is `gl.message.sender_address`** — `sender_account` passes lint but
   crashes on-chain (AttributeError). Same distrust for any new SDK name:
   lint-green ≠ runtime-true. Prove on studionet.
3. **Calldata types cross the JS boundary raw**: `u256` must travel as `bigint`,
   `Address` must travel as `CalldataAddress` (from `genlayer-js/types`, same
   class object the encoder uses — verified by `instanceof`). Raw strings crash
   the VM (`to_bytes` / `as_bytes` AttributeError). Validate + checksum before send.
4. **Storage layout**: `TreeMap`/`DynArray` only, no `list`/`dict`/`int`;
   `bool` and `Address` as direct fields are fine. **No nested TreeMap writes,
   no `Address`-typed map values** — both silently fail on the runner. Use flat
   `TreeMap[str, str]` with composite keys (`wid + "|" + key`) and hex strings.
5. **Nondet blocks**: copy storage to memory first (`gl.storage.copy_to_memory`);
   closures capture plain locals only. Custom `run_nondet_unsafe` validators that
   independently re-run the task and compare DECISION fields (exact match for
   categories, tolerance for scores, unanimous-zero gate). Display-only text
   (e.g. LLM reason) must never drive state.
6. **Time is deterministic tx time**: `datetime.now(timezone.utc)` — identical
   for leader and validators. Never wall-clock. Good for deadlines/windows.
7. **Money**: `@gl.public.write.payable` + `gl.message.value`; payouts via
   `@gl.evm.contract_interface` + `emit_transfer(value)` (no `on` param in this
   SDK); zero escrowed balances after every payout; no `__receive__` unless
   designed (plain transfers then reject instead of sticking).
8. **Lifecycle guards on every state-changing method**: status gates, single-use
   flags (`settled`), one-round appeals, owner-or-beneficiary checks where both
   are on-chain addresses. Every escrow state needs an exit (settle / recover);
   recovery must never bypass an existing verdict path.
9. **Bind every consequential LLM field**: require exact article/key ids in the
   prompt AND validate them against on-chain data in `leader_fn` (a breach with
   no listed article, or an unknown id, is an LLM error that forces rotation).
   Treasury-style accounting needs an explicit reserved counter + capped
   withdrawal, or approved-but-unexecuted funds lock implicitly.

## Workflow (in order, no skipping)
1. `genvm-lint check` + `typecheck` must pass.
2. Fast unit tests for pure helpers (`pytest tests/`).
3. Deploy to studionet → confirm receipt FINALIZED **and** stderr empty **and**
   schema readable. `ACCEPTED` alone means nothing.
4. Test every method on-chain incl. negative paths (EXPECTED reverts).
5. **Verify by reading chain state, never by parsing receipts.** Receipt
   FINALIZED ≠ success; undetermined changes nothing. After each write,
   re-read the affected state to decide success.
6. Commit + push with meaningful messages. Secrets never enter the repo
   (keystore lives outside it; passwords via env only).

## CLI realities
- No `--value` flag: payable calls go through `tools/*.mjs` (genlayer-js + ethers).
- `--args` mangles quotes/brackets: prefer comma-separated plain strings in APIs.
- Always capture full tx output to a file to keep the hash; check
  `execution_result` + `payload` in receipts, not just status names.
- Active account can change between sessions — assert `pactledger` before writes.
- Always pipe the keystore password via stdin, never bake it into scripts.

## Frontend realities (Next.js 16 + TS + Tailwind v4)
- Reads go through same-origin `/api/rpc` (Studio RPC has no browser CORS).
- RPC budget ~30 req/min: parallel reads (concurrency 3), 12s cache busted on
  every write, 8s receipt polling, no React StrictMode double-fire in dev.
- Wallet: EIP-6963 picker (no fights) + keystore + raw key in a global modal;
  session-only secrets, silent reattach after reload, one-click disconnect.
- Writes: ref-guards against double-click, state-confirmation after finality,
  `[EXPECTED]` surfaced verbatim, tx toasts with explorer links.
- Explorer API (`explorer-studio…/api/transactions`) feeds the consensus trail;
  slim it server-side (strip node_config), 60s cache.

## Docs to check when unsure (in order)
1. `https://docs.genlayer.com/developers/intelligent-contracts/*`
   (equivalence-principle, storage, when-to-use, features/value-transfers,
   features/transaction-context, features/messages)
2. Installed `genlayer-js/dist/*.d.ts` + runtime chunks (source of truth beats docs)
3. Prior art in `D:\Genlayer-project\weels\pact-ledger` (contract, tools, frontend)
