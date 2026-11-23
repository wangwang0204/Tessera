# Tessera

Tessera is a personal, Markdown-first notes app with a freeform canvas, timeline, Master Notes view, macOS desktop app, and an optional self-hosted web companion.

Tessera is **not a SaaS product**. It has no Tessera account, billing system, central user database, or hosted sync service. You own the app and, if you want web access or sync, you run the server that stores your data.

## Choose your setup

### 1. Use Tessera on macOS

Download the latest `Tessera-mac-arm64.zip` from the [GitHub Releases page](https://github.com/wangwang0204/Tessera/releases), unzip it, and move `Tessera.app` to `/Applications`.

If a release asset is not available yet, build it locally instead:

```bash
git clone https://github.com/wangwang0204/Tessera.git
cd Tessera
npm install
zsh scripts/package-macos.sh
open dist/Tessera.app
```

The desktop app stores its local notebook at:

```text
~/Library/Application Support/Tessera/notebook.json
```

### 2. Run the web app on your own server

You need a machine you control with Docker Compose. Clone the repository onto that machine, then run:

```bash
git clone https://github.com/wangwang0204/Tessera.git
cd Tessera
docker compose up -d --build
```

The service listens on `127.0.0.1:3000` and persists its notebook in `./data/notebook.json`. Put a reverse proxy, Cloudflare Tunnel, VPN, or another access layer in front of it if you need remote access.

```bash
curl http://127.0.0.1:3000/api/health
```

Back up the `data/` directory before upgrades. It contains your notes.

### 3. Enable desktop-to-server sync (optional)

Desktop sync is for a single owner who runs their own Tessera server. It is not required for using the desktop app or the web app separately.

Create this local-only file on your Mac:

```text
~/Library/Application Support/Tessera/sync.json
```

```json
{
  "syncUrl": "https://your-tessera.example.com",
  "cfClientId": "optional-cloudflare-service-token-id",
  "cfClientSecret": "optional-cloudflare-service-token-secret"
}
```

Do not commit this file. It can contain credentials.

When enabled, the desktop app syncs once after launch, after local edits settle, every 60 seconds while open, or manually with `Cmd+Shift+S`.

## What Tessera owns, and what you own

| Tessera repository | You, the operator |
| --- | --- |
| Desktop app, web server, sync protocol, Docker configuration, tests, and release artifacts | Your server, domain, reverse proxy, access policy, backups, and sync credentials |

Tessera deliberately does not operate a shared production server or handle other users' notes.

## Development

```bash
npm install
npm run build:editor
npm test
npm start
```

For the web server without Docker:

```bash
npm run start:web
```

## Project documentation

- [Repository plan and responsibility boundaries](docs/REPOSITORY-PLAN.md)
- [Chinese README](README.md)

## License

MIT License.
