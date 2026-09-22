# Semantic Contacts World Projection Contract

**Status:** QA IMPLEMENTATION — v1.6.0-qa.9

## Purpose

Tome may present a system-owned semantic entity even when Foundry has no corresponding document.

This is presentation, not authority takeover.

## Contact projection

```text
System semantic Contact
        ↓
Adapter entityDiscovery
        ↓
Universal Campaign Discovery
        ↓
semantic-only entity
        ↓
Tome Contact projection
        ↓
World / Contacts / <Name>
```

The Contact Journal is Tome-owned presentation.

The semantic source remains canonical for source-owned facts.

## Stable identity

Projection identity is semantic key, not name.

Names may change. A later Actor link may appear. The projection remains the same Tome Contact.

## Materialization

A semantic Contact can declare:

```text
materialization: optional
```

This means absence of a Foundry Actor is valid.

Tome must not create one merely because it can.

## Source upgrade

When a canonical Actor UUID later appears, the existing Contact projection upgrades in place and stores that linkage.

No duplicate Contact is created.

## Permissions

A projected Contact initially mirrors its semantic source Actor's Foundry ownership.

Automatic permission mirroring stops if the GM manually diverges the Contact Journal's ownership.

## Edit preservation

Projection-owned facts may refresh.

GM-authored custom facts are retained.

A GM-edited summary is retained after it diverges from the previously generated summary.

## Removal

Automatic projection never deletes a Contact.

If its semantic source disappears, the projection becomes inactive until the source returns or the GM explicitly manages it.

## Safety

Automatic projection may create/update Tome World presentation but may not:

- create a Foundry Actor
- silently link by name
- delete a Contact automatically when source disappears
- overwrite GM-authored custom content indiscriminately
- grant broader permissions than the source without an explicit GM change
