# Self-Hosting aniwatch-api for NijiStream

This guide sets up a self-hosted aniwatch-api instance on your home server,
exposed to the internet via Tailscale Funnel (free, no domain needed).

## Prerequisites

- A Linux server with Docker installed (CasaOS has Docker built-in)
- A free Tailscale account (https://tailscale.com)

---

## Step 1: Deploy aniwatch-api with Docker

```bash
# Clone or copy the docker-compose.yml to your server
mkdir -p ~/aniwatch-api && cd ~/aniwatch-api

# Copy the docker-compose.yml from this directory, or create it:
curl -fsSL https://raw.githubusercontent.com/usmanbutt-dev/nijistream-extensions/master/self-hosting/docker-compose.yml -o docker-compose.yml

# Start the container
docker compose up -d

# Verify it's running
curl http://localhost:3000/api/v2/hianime/home
# Should return JSON with {success: true, data: {...}}
```

**On CasaOS:** You can also install via the CasaOS app store by importing
the `docker-compose.yml` file directly from the UI.

---

## Step 2: Install Tailscale

```bash
# Install Tailscale (one-liner for Linux)
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up

# This opens a browser link to log in to your Tailscale account.
# Follow the link to authenticate your server.
```

---

## Step 3: Enable Tailscale Funnel

Funnel exposes a local port to the public internet through Tailscale's
network. Anyone can access it — no VPN client needed on their end.

```bash
# Enable HTTPS and Funnel in your Tailscale admin console first:
# 1. Go to https://login.tailscale.com/admin/dns
# 2. Enable "MagicDNS" if not already on
# 3. Enable HTTPS certificates
# 4. Go to https://login.tailscale.com/admin/acls
# 5. Add to your ACL policy:
#    "nodeAttrs": [{"target": ["*"], "attr": ["funnel"]}]

# Then expose port 3000 via Funnel:
sudo tailscale funnel 3000
```

This gives you a permanent public URL like:
```
https://your-server-name.tailnet-1234.ts.net
```

**Test it from any device:**
```bash
curl https://your-server-name.tailnet-1234.ts.net/api/v2/hianime/home
```

---

## Step 4: Update the HiAnime Extension

Edit `extensions/com.nijistream.hianime.js` and change `API_BASE`:

```javascript
// Before (public fallback):
var API_BASE = "https://aniwatch-api-stream.vercel.app";

// After (your self-hosted instance):
var API_BASE = "https://your-server-name.tailnet-1234.ts.net";
```

Then push the change:
```bash
cd /path/to/nijistream-extensions
git add extensions/com.nijistream.hianime.js
git commit -m "feat: point HiAnime extension to self-hosted API"
git push
```

Users who reinstall the extension from the repo will get the updated URL.

---

## Step 5: Auto-start on Boot

**Docker:** The `restart: unless-stopped` policy in docker-compose.yml
handles this automatically — the container restarts after reboot.

**Tailscale Funnel:** Tailscale runs as a systemd service and Funnel
persists across restarts. To verify:

```bash
# Check Tailscale is running
sudo systemctl status tailscaled

# Check Funnel is active
tailscale funnel status
```

---

## Troubleshooting

### API returns empty sources / "Failed extracting client key"
The aniwatch-api's source extraction fails intermittently (~30% of the time).
The NijiStream extension has built-in retry logic (3 attempts + hd-2 fallback).
If it consistently fails, the upstream site may have changed their encryption.
Check https://github.com/ghoshRitesh12/aniwatch-api/issues for updates.

### Container won't start / build errors
Use the pre-built Docker image (`ghcr.io/ghoshritesh12/aniwatch:latest`)
instead of building from source. This avoids the `pino.stdTimeFunctions`
build error (GitHub issue #154).

### Tailscale Funnel not working
1. Ensure MagicDNS is enabled in admin console
2. Ensure HTTPS certificates are enabled
3. Ensure the `funnel` node attribute is in your ACL policy
4. Run `tailscale funnel status` to check current state

### M3U8 returns 403
Some CDN servers block non-browser requests. The extension passes the
`Referer` header from the API response to the video player, which helps.
If it still fails, try a different server (the extension tries hd-1 then
falls back to hd-2 automatically).
