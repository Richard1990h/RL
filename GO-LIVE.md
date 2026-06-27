# Getting rallylive.ca live

The site is hosted **from your own PC** via a Cloudflare Tunnel managed by the
Rally Watchdog. It cannot be hosted from a cloud sandbox — a Cloudflare tunnel
needs outbound port **7844**, which restricted/cloud networks block, and the
domain is tied to **your** Cloudflare account. So "live" = this machine running.

## One command

```powershell
powershell -ExecutionPolicy Bypass -File .\GO-LIVE.ps1
```

It checks your `.env`, sets up the DB, builds the app, **preflights the tunnel**
(the thing a 530 means is broken), launches the watchdog, and tells you the
live status. When it's green: **https://rallylive.ca**.

## What a 530 means

Cloudflare resolved `rallylive.ca` to your tunnel, but **no `cloudflared` is
connected** to it right now. It is a tunnel problem, not an app problem (a dead
app behind a connected tunnel returns 502, not 530). Causes, most common first:

1. **Tunnel never finished setup** — `~/.cloudflared/rally-config.yml` still has
   the `TUNNEL_ID_HERE` placeholder. Fix: run `tools\cloudflare\setup-tunnel.bat`
   once (login → create tunnel `rally` → paste the real UUID → route DNS).
2. **cloudflared isn't running / crash-looping** — open the watchdog dashboard
   at http://localhost:9877; the **Cloudflare Tunnel** row will be red.
3. **Credentials file missing** — `~/.cloudflared/<UUID>.json` doesn't exist.
   Re-run `cloudflared tunnel login` / `setup-tunnel.bat`.

Quick check of tunnel health:
```
cloudflared tunnel info rally
```
`0 connections` (or "not found") = the tunnel is down → that's your 530.

## One-time prerequisites

- **Node.js** + **MySQL** running locally.
- `.env` filled in (`copy .env.example .env`, then set `DATABASE_URL` and a
  strong `JWT_SECRET`).
- **cloudflared** installed at `C:\cloudflared\cloudflared.exe`.
- Tunnel created once via `tools\cloudflare\setup-tunnel.bat` and DNS routed to
  `rallylive.ca` + `www.rallylive.ca`.

After that, `GO-LIVE.ps1` is all you run to come back online.

## Staying live without leaving your PC on

If you want it up 24/7 independent of this machine, it has to move to an
always-on Linux server (the app uses long-running RTMP via `node-media-server`,
local file storage, and Prisma/MySQL — it needs a real server, not Cloudflare
Pages/Workers). That path needs a VPS + a database; ask and I'll write the
server deploy.
