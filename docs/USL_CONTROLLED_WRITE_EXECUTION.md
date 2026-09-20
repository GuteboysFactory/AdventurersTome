# USL Controlled Semantic Write Execution

**Status:** QA IMPLEMENTATION — v1.6.0-qa.6

## Execution invariant

A write plan is descriptive evidence, not mutation authority.

Before every mutation Tome must reconstruct a fresh plan against the current canonical source and compare it with the supplied plan.

## Execution flow

```text
supplied dry-run plan
        ↓
source UUID validation
        ↓
fresh planWrite()
using supplied currentValue as expectedCurrentValue
        ↓
permission + conflict validation
        ↓
provider/path/operation identity comparison
        ↓
single targeted apply handler
        ↓
canonical source update
        ↓
semantic resolve verification
        ↓
redacted session audit event
```

## Targeted provider execution

Mutation is never broadcast across all adapters.

The Adapter API exposes `executeAdapter(adapterId, capability, payload)` so only the provider that produced the fresh canonical plan may apply the write.

## Initial mutation authorities

System-owned semantics are executed by the matching system adapter.

Tome-owned public Character Information is executed by Tome Core against its already existing canonical Foundry flag path.

GM Private Vault remains plan-only in qa.6.

## Conflict model

The supplied plan's `currentValue` becomes the execution-time expected value.

If canonical state changed since planning, the fresh plan becomes a conflict and mutation stops.

This provides optimistic concurrency without locks.

## Audit model

Write audit is session-local diagnostics, not campaign content.

No semantic payloads are recorded.

A later milestone may add a persistent audit ledger if needed, but that requires its own privacy/storage design.

## Creation remains out of scope

qa.6 updates existing canonical sources only.

Actor/NPC/Item creation belongs to the later semantic create contract after controlled write execution is proven.
