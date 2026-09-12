# SEO Playground — Local Setup Notes

Local, stock install of the official [SEO Playground](https://github.com/paulmassen/seo-playground) project, running via Docker Desktop on this Windows machine. No source code changes were made except restricting the Docker port binding to localhost (see below).

## Locations

- **Install directory:** `C:\seo-tools\seo-playground`
- **Persistent data (SQLite DB, settings, scan history, cached results, DataForSEO config):** `C:\seo-tools\seo-playground\data\seo-playground.db`
  (mounted into the container at `/data`, defined in `docker-compose.yml`). This directory lives outside the container, so rebuilding or restarting the container never touches it.

## Docker

- **Container name:** `seo-playground-app-1`
- **Image:** `seo-playground-app` (built locally from the repo's `Dockerfile`)
- **Port:** `3000`, bound to `127.0.0.1:3000` only (not exposed to the LAN or internet — see `docker-compose.yml`)
- **App URL (this machine only):** http://localhost:3000

## Common Commands

Run these from `C:\seo-tools\seo-playground`.

**Start (detached/background):**
```bash
docker compose up -d
```

**Stop:**
```bash
docker compose down
```

**Restart:**
```bash
docker compose restart
```

**View logs (follow):**
```bash
docker compose logs -f
```

**View recent logs (no follow):**
```bash
docker compose logs --tail=50
```

## Updating SEO Playground Later (without losing data)

The database lives in `./data/` on the host, outside the container, so pulling new code and rebuilding never touches it.

```bash
git pull
docker compose up --build -d
```

## DataForSEO Credentials

Not configured here. Enter DataForSEO username/API key manually through the app's **Settings** page at http://localhost:3000/dashboard/settings — credentials are stored only in the local SQLite database (`data/seo-playground.db`), never in source code, `.env` files, or Git.
