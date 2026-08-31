# GitHub release plan for Adventurer's Tome

## Goal
Publish Adventurer's Tome as a self-hosted Foundry VTT module through GitHub Releases. Users install the module by pasting one stable manifest URL into Foundry's Add-on Module installer.

## One-time repository setup
1. Create a public GitHub repository, preferably named `adventurers-tome`.
2. Upload the prepared repository tree to the repository root.
3. In GitHub, open **Settings → Actions → General** and allow GitHub Actions if they are disabled.
4. Under **Workflow permissions**, allow the release workflow to write repository contents/releases.
5. Choose and add a software license before public 1.0 distribution.
6. Complete the public-content checklist in `PUBLIC-RELEASE-AUDIT.md`.

## Release candidate
Before publishing 1.0.0, run the workflow with:

`1.0.0-rc.1`

Test the version-specific manifest:

`https://github.com/OWNER/REPO/releases/download/1.0.0-rc.1/module.json`

Install that manifest into a clean Foundry VTT 13.351 environment.

## Publish 1.0.0
1. Open **Actions → Release Adventurer's Tome → Run workflow**.
2. Enter `1.0.0`.
3. The workflow builds and uploads:
   - `module.json`
   - `adventurers-tome.zip`
4. The stable Manifest URL becomes:

`https://github.com/OWNER/REPO/releases/latest/download/module.json`

Users paste that URL into **Foundry Setup → Add-on Modules → Install Module → Manifest URL**.

## Public package boundary
The public build includes the original neutral `assets/default-hero.webp` and The Ashen Road demo. The legacy private `assets/Bree.webp` compatibility file is excluded from generated public release ZIPs.

## Future releases
For 1.0.1, 1.1.0, and later, run the same workflow with the new version. The generated manifest pins its `download` URL to that exact version while the `manifest` field continues to point to the latest release.
