# Tessera Repository Plan

## Product boundary

Tessera is open-source software for personal use and self-hosting. The repository ships an app and a server; it does not run a shared service.

Out of scope for the current stage:

- SaaS accounts, teams, subscriptions, billing, or multi-tenancy.
- A Tessera-operated production database or sync server.
- Public APIs intended for third-party tenants.

In scope:

- A local-first macOS app.
- A browser UI that each owner can run on their own server.
- Optional sync between one owner's desktop cache and their own server.
- Clear backups, release artifacts, tests, and self-hosting documentation.

## Responsibility split

| Area | Repository responsibility | Operator responsibility |
| --- | --- | --- |
| Core notebook model | `model.cjs`, `store.cjs`, migrations, tests | Keep a backup of notebook files |
| Desktop application | Electron main process, renderer, local storage, packaged macOS artifact | Install and update the app |
| Web application | Static UI, HTTP API, SSE updates, Docker image | Run the container and expose it safely |
| Sync | Protocol, merge rules, tombstones, regression tests | Choose whether to enable it; keep credentials local |
| Access control | Support ordinary HTTP headers and local config | Cloudflare Access, reverse proxy, VPN, TLS, domain, service token |
| Operations | Compose defaults, health endpoint, recovery documentation | Backups, upgrades, monitoring, storage permissions |
| Releases | Build instructions and tagged release artifacts | Download the correct artifact; verify compatibility |

## Recommended repository shape

Keep the current single repository and make ownership obvious instead of splitting into separate repositories too early.

```text
Tessera/
├── app/                 # future home for Electron-only files
├── web/                 # future home for browser-only assets
├── core/                # future home for model, store, and merge primitives
├── server/              # future home for HTTP, SSE, and sync routes
├── scripts/             # packaging, recovery, and release scripts
├── test/                # unit and integration tests
├── docs/                # public English documentation
├── README.md            # Chinese project introduction
├── README.en.md         # English download and self-hosting entry point
└── .dev/                # private/local development journal; never required at runtime
```

This is a target structure, not a mandatory immediate refactor. Until the codebase grows enough to justify moving files, use clear file-level ownership:

- `model.cjs` and `store.cjs`: core data contract.
- `main.cjs`, `preload.cjs`, `renderer.js`: desktop shell and user interface.
- `server.cjs`, `web-adapter.js`: self-hosted web transport.
- `sync-client.cjs`, `sync-merge.cjs`: optional sync boundary.
- `Dockerfile`, `docker-compose.yml`: operator-facing deployment interface.

## Sync safety rules

Sync is the highest-risk component because it can change user data. It must have:

1. A persisted common base for each successful sync.
2. Deletion tombstones so an old offline cache cannot revive a deleted note.
3. Deterministic conflict handling and explicit conflict copies only for genuine concurrent edits.
4. Regression tests for restart, one-sided edit, one-sided delete, concurrent edit, and concurrent delete/edit cases.
5. A documented recovery path that backs up data before any repair.

## Release and deployment responsibilities

### Desktop release

1. Run the complete test suite.
2. Build `dist/Tessera-mac-arm64.zip`.
3. Create a Git tag and GitHub Release.
4. Attach the ZIP and describe supported macOS/architecture.

### Self-hosted server release

1. Document schema or protocol changes.
2. Require the operator to back up `data/notebook.json` before deployment.
3. Build and restart with `docker compose up -d --build`.
4. Verify `/api/health` and the notebook count after deployment.

### Future automation

GitHub Actions can deploy to a personally owned VM after a push to `main`. The workflow should use a dedicated deploy account and repository secrets (`VM_HOST`, `VM_USER`, `VM_SSH_KEY`), and may require a manual environment approval. This remains an operator convenience, not a Tessera-hosted service.
