# Hetzner Production Deployment Guide

> **NOTE:** As of March 2026, production is deployed on GKE at https://baeb90.com.
> This document is retained as a legacy reference for Docker Compose / Hetzner VPS deployments.
> For the current deployment, see `k8s/` manifests and `.github/workflows/deploy.yml`.

Deploys the Career Concierge app to a Hetzner VPS using Docker Compose with Caddy as a reverse proxy for automatic HTTPS. DNS is managed at GoDaddy (A record only — no nameserver transfer required).

---

## Prerequisites

- A GitHub repository with the codebase pushed
- A Hetzner account at [console.hetzner.com](https://console.hetzner.com)
- A domain registered at GoDaddy
- An OpenAI API key (or compatible endpoint)
- Google Drive API credentials (Client ID + Secret)
- SSH key pair on your local machine (`~/.ssh/id_rsa.pub`)

---

## Step 1 — Configure the Caddyfile

Edit `Caddyfile` in the project root and replace `yourdomain.com` with your real domain:

```
yourdomain.com {
    reverse_proxy app:3000
}
```

If you want `www` to redirect to the root domain, add:

```
www.yourdomain.com {
    redir https://yourdomain.com{uri} permanent
}
```

---

## Step 2 — Commit and Push to GitHub

```bash
git add Dockerfile docker-compose.yml Caddyfile .dockerignore
git commit -m "Add Docker + Caddy production deployment"
git push origin main
```

---

## Step 3 — Create the Hetzner VPS

1. Log in to [console.hetzner.com](https://console.hetzner.com)
2. Click **Create Server** with these settings:
   - **Location**: Any (choose closest to your users)
   - **Image**: Ubuntu 24.04 LTS
   - **Type**: **CX22** — 2 vCPU, 4GB RAM, 40GB SSD (~€3.79/mo)
   - **SSH Keys**: Add your public key (paste contents of `~/.ssh/id_rsa.pub`)
   - **Name**: `career-concierge`
3. Click **Create & Buy Now**
4. After the server boots, copy the **IPv4 address** from the server list

---

## Step 4 — Update DNS at GoDaddy

1. Log in to GoDaddy → **My Products** → **DNS** for your domain
2. Add or update an **A record**:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `@` | `<Hetzner IPv4>` | 600 |

3. If you want `www` to work, add a second A record with **Name**: `www`
4. Save and wait for DNS propagation (5–30 minutes)
5. Verify with:
   ```bash
   dig yourdomain.com A +short
   # Should return the Hetzner IP
   ```

---

## Step 5 — Initial Server Setup

SSH into the server as root:

```bash
ssh root@<hetzner-ip>
```

Install Docker:

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin
systemctl enable --now docker
```

Create a non-root deploy user:

```bash
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
```

Optional — set up a firewall:

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

Switch to the deploy user for all remaining steps:

```bash
su - deploy
```

---

## Step 6 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/career-concierge.git
cd career-concierge
```

---

## Step 7 — Create the Production `.env`

The `.env` file is never committed to git — create it directly on the server:

```bash
nano .env
```

Paste and fill in the following:

```env
# Database
DATABASE_URL=file:./data/db.sqlite

# Auth
JWT_SECRET=<generate — see below>
OWNER_OPEN_ID=dz-admin
VITE_APP_ID=career-concierge-prod
OAUTH_SERVER_URL=

# LLM (no /v1 suffix — the app appends it automatically)
BUILT_IN_FORGE_API_URL=https://api.openai.com
BUILT_IN_FORGE_API_KEY=sk-...

# Google Drive
GOOGLE_DRIVE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=<your-client-secret>
GOOGLE_DRIVE_FOLDER_URL=https://drive.google.com/drive/folders/<folder-id>

# Optional — LangSmith observability
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=...
# LANGCHAIN_PROJECT=career-concierge-prod
```

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the file: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Step 8 — Build and Start

```bash
docker compose up -d --build
```

This will:
1. Build the Docker image (compiles native deps, runs `pnpm build`)
2. Start the `app` container (Express server on port 3000)
3. Start the `caddy` container (reverse proxy, automatically issues a Let's Encrypt TLS cert once DNS has propagated)

Check that both containers are running:

```bash
docker compose ps
```

View live logs:

```bash
docker compose logs -f app
```

---

## Step 9 — Initialize the Database (First Deploy Only)

Run the Drizzle schema migration from a builder-stage container that has `drizzle-kit`:

```bash
docker run --rm \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  $(docker build -q --target builder .) \
  sh -c "pnpm db:push"
```

This creates the SQLite database and all tables. Only needed on the first deploy — subsequent deploys preserve the database via the `sqlite_data` Docker volume.

---

## Step 10 — Create Your Admin Session

The `/api/dev-login` endpoint is **disabled in production**. Generate a session JWT manually:

```bash
docker compose exec app node --input-type=module <<'EOF'
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({
  openId: process.env.OWNER_OPEN_ID,
  appId: process.env.VITE_APP_ID,
  name: 'DZ Admin'
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime('1y')
  .sign(secret);
console.log(token);
EOF
```

Copy the JWT output. Then in your browser:

1. Open `https://yourdomain.com`
2. Open **DevTools → Application → Cookies → `https://yourdomain.com`**
3. Click **+** to add a new cookie:
   - **Name**: `app_session_id`
   - **Value**: the JWT from above
   - **Path**: `/`
4. Refresh the page — you are now logged in as admin

> Save this JWT somewhere safe. It expires in 1 year. Regenerate it using the same command when needed.

---

## Step 11 — Update Google Drive OAuth Redirect URI

The production callback URL must be registered in Google Cloud Console:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs & Services → Credentials** → your OAuth 2.0 client
3. Under **Authorized redirect URIs**, click **Add URI**:
   ```
   https://yourdomain.com/api/google-drive/callback
   ```
4. Click **Save**

> Keep the `http://localhost:3000/api/google-drive/callback` entry — it's still needed for local development.

---

## Step 12 — Connect Google Drive

1. Visit `https://yourdomain.com/admin`
2. Click **Connect Google Drive** → complete the OAuth consent screen
3. After redirect back, click **Sync Documents**
4. Wait for indexing to complete (progress shown on the page)

---

## Deploying Updates

On your local machine, push your changes:

```bash
git push origin main
```

SSH into the server and redeploy:

```bash
ssh deploy@<hetzner-ip>
cd career-concierge
git pull origin main
docker compose up -d --build
```

The old container is replaced with zero manual steps. The SQLite database and TLS certs are preserved in their Docker volumes.

---

## Step 13 — Set Up CI/CD with GitHub Actions

The repository includes `.github/workflows/deploy.yml`, which automatically runs on every push to `main`:

1. **`ci` job** — installs dependencies, runs `pnpm check` (TypeScript), then unit tests (integration tests excluded)
2. **`deploy` job** — SSHes into the Hetzner server and runs `git pull origin main && docker compose up -d --build`

### Add GitHub Repository Secrets

Go to your repository on GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `HETZNER_HOST` | The server's IPv4 address (from the Hetzner console) |
| `HETZNER_SSH_KEY` | The deploy user's private SSH key (see below) |

### Capture the Deploy User's Private Key

If you set up the `deploy` user by copying `root`'s `authorized_keys`, the private key is the one on your **local machine** that corresponds to the public key you uploaded to Hetzner during server creation. Copy it:

```bash
cat ~/.ssh/id_rsa
```

Paste the entire output (including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`) as the value of `HETZNER_SSH_KEY`.

If you want a dedicated deploy key instead:

```bash
# On the server, as deploy user
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys

# Print the private key — paste this into the GitHub secret
cat ~/.ssh/deploy_key
```

### Verify the Workflow

After adding the secrets, push any commit to `main`. In the GitHub repository, go to **Actions** and confirm:
- The `ci` job passes (type-check + unit tests)
- The `deploy` job connects, pulls, and rebuilds containers
- `docker compose ps` on the server shows healthy containers

---

## Database Backups

Back up the SQLite database to a local `.tar.gz`:

```bash
docker run --rm \
  -v sqlite_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz /data
```

Restore from backup:

```bash
docker run --rm \
  -v sqlite_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/db-backup-YYYYMMDD.tar.gz -C /
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Site not loading after deploy | DNS not propagated yet | Wait 5–30 min; run `dig yourdomain.com A` |
| Caddy shows certificate error | DNS not pointing to server yet | Confirm A record is correct; Caddy retries automatically |
| `redirect_uri_mismatch` from Google | Redirect URI not registered for prod | Add `https://yourdomain.com/api/google-drive/callback` in Google Console |
| `docker compose exec` hangs | App container not running | Run `docker compose ps` and `docker compose logs app` |
| Database errors on first start | Migrations not run | Re-run Step 9 |
| Admin page says "Unauthorized" | Cookie not set or expired | Re-run Step 10 to generate a new JWT |
| Build fails on `better-sqlite3` | Native module compile error | Ensure `python3 make g++` are in the Dockerfile `apk add` line |

---

## File Reference

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: compiles native deps + Vite/esbuild bundle |
| `docker-compose.yml` | Orchestrates `app` + `caddy` with persistent volumes |
| `Caddyfile` | Reverse proxy config — edit domain name before deploying |
| `.dockerignore` | Excludes `node_modules/`, `.env`, `data/`, `dist/` from image context |
| `.env` (server only) | Production secrets — never commit this file |
| `docs/google_drive_setup.md` | Google Cloud project + Drive OAuth setup |
| `docs/oauth_setup_instructions.md` | Local dev auth setup (JWT cookie method) |
