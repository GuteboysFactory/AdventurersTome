# Adventurer's Tome Export Formats

## Portable Tome Package v2

Schema: `adventurers-tome.import`, version `2`.

This is the recommended transfer format. It is intentionally compatible with Import 2.0 and exports Sessions, Quests, World entries, summaries, content, **player-visible facts**, artwork paths, and name-based cross-links. Per-GM private-vault data (GM Notes and GM-only Facts/Relations) is deliberately excluded; use Full GM Archive for a private backup of that material. Actor Tome profiles are also excluded because Actor identity cannot be assumed to match in another Foundry World.

## Player-safe Package

Uses the same Import 2.0 schema, but exports only entries that are discovered, not Tome GM-only, and have Observer-or-higher default Foundry ownership. GM-only structured facts and all private GM Notes are omitted. Raw Journal page text is also omitted; only explicit public Tome summaries/metadata are serialized, and cross-links to hidden targets are removed.

Foundry can also apply user-specific ownership overrides, so a GM should still review the package before sharing it outside the group.

## Full GM Archive

Schema: `adventurers-tome.backup`, version `1`.

This private archive captures Tome presentation settings, Tome-managed Actor and Journal flags, access/discovery metadata, cross-links, structured GM Notes, and Journal text. It is intended for backup/audit and must be kept private.

Import 2.0 does not currently restore a Full GM Archive automatically. Use Portable Tome Package v2 for re-importable campaign content.


## v0.19 private GM workspace

The **Full GM Archive** also includes the current GM user's private `gmWorkspace` (Campaign Scratchpad plus standalone GM Notebook notes). Portable and Player-safe packages intentionally exclude this private workspace.
