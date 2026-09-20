# USL Privacy Semantics & Semantic Write Contract

**Status:** LOCKED FOR v1.6.0-qa.4  
**Mutation state:** DRY-RUN ONLY

## Core rule

Privacy classification is part of semantic meaning, not a UI decoration.

No downstream consumer may receive a semantic fact that the current user is not allowed to know.

## Note classes

| Semantic | Authority | Visibility | Reveal state | Canonical source |
| --- | --- | --- | --- | --- |
| notes.private | system/adapter | owner-only | private | system-native private notes field |
| notes.gm | Tome | gm-only | hidden | Contextual Private Vault |
| notes.public | Tome | player-visible | revealed | Known Information |

The `notes` parent is a catalog container. Mixed-visibility note payloads are not flattened into one unsafe object.

## GM secret storage

GM notes must not be written to player-readable Actor flags.

Tome GM-private semantic data uses the existing UUID-backed Contextual Private Vault.

## Write architecture

`planWrite()` is the only write-facing API in qa.4.

It returns an explainable plan but cannot execute it.

No `write()`, `executeWrite()`, or implicit mutation exists.

## Denied-plan redaction

Permission-denied plans disclose only the semantic privacy class and required permission.

They do not disclose:

- current value
- provider identity
- target/source path
- private source metadata
- proposed value echo

This prevents write-planning itself from becoming a side-channel.

## Conflict policy

Authorized dry-run plans may use `expectedCurrentValue`.

Mismatch creates a conflict plan rather than silently accepting stale state.

This is the optimistic concurrency foundation for future controlled execution.

## Authority

If Foundry/system owns a value, write planning points back to that canonical field through an adapter.

If Tome owns a value, write planning points to the canonical Tome subsystem.

No second authoritative copy is created.

## Future execution gate

A later QA package may add controlled execution only after:

- permission safety
- dry-run accuracy
- conflict handling
- multi-client behavior
- loop prevention
- audit trail

are verified.

qa.4 itself performs zero semantic mutations.
