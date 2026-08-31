# GitHub release plan for Adventurer's Tome

## Goal
Publish Adventurer's Tome as a self-hosted Foundry VTT module through GitHub Releases. Users install the module by pasting one stable manifest URL into Foundry's Add-on Module installer.

## Repository
`https://github.com/GuteboysFactory/AdventurersTome`

## Release candidate
Current RC: `1.0.0-rc.1`

Version-specific manifest for clean-install QA:

`https://github.com/GuteboysFactory/AdventurersTome/releases/download/1.0.0-rc.1/module.json`

Release package:

`https://github.com/GuteboysFactory/AdventurersTome/releases/download/1.0.0-rc.1/adventurers-tome.zip`

Install the RC manifest into a clean Foundry VTT 13.351 environment and complete the final regression gate before promoting the same runtime line to `1.0.0`.

## Publish 1.0.0
1. Open **Actions → Release Adventurer's Tome → Run workflow**.
2. Enter `1.0.0`.
3. The workflow stamps `module.json`, builds the Foundry package, and uploads:
   - `module.json`
   - `adventurers-tome.zip`
4. The stable production Manifest URL becomes:

`https://github.com/GuteboysFactory/AdventurersTome/releases/latest/download/module.json`

Users paste that URL into **Foundry Setup → Add-on Modules → Install Module → Manifest URL**.

## Public package boundary
The public build includes the neutral `assets/default-hero.webp` and The Ashen Road demo. The legacy/private `assets/Bree.webp` compatibility asset is excluded from generated public release ZIPs.

## Release permissions
GitHub Actions requires `contents: write` in the workflow. Repository Actions must be enabled. Before broad public 1.0 distribution, complete the public-content/license audit.

## Future releases
For `1.0.1`, `1.1.0`, and later, run the same workflow with the new version. Stable versions use the `latest/download/module.json` manifest URL while each package download remains pinned to its exact version tag.
