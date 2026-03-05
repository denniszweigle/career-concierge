# Hetzner + Docker + GitHub Actions Connectivity Troubleshooting

This document records the exact problems encountered when setting up CI/CD between GitHub Actions and a Hetzner VPS, why they happened, and how they were resolved. Use this as a reference if you ever rebuild the server or repeat this setup.

---

## Overview of What We Were Trying to Do

The goal was to wire up GitHub Actions so that every push to `main` automatically:
1. Runs `pnpm check` (TypeScript) and unit tests
2. SSHes into the Hetzner server as the `deploy` user and runs `git pull && docker compose up -d --build`

This required:
- The `deploy` user to exist on the server with Docker access
- The `deploy` user's `~/.ssh/authorized_keys` to contain the local machine's public key
- GitHub Actions to have `HETZNER_HOST` and `HETZNER_SSH_KEY` secrets set

---

## Problem 1 — SSH Key Not Working After Server Creation

### Symptom
```
deploy@5.78.180.44's password:
Permission denied, please try again.
```
And also for root:
```
root@5.78.180.44: Permission denied (publickey,password).
```

### Why It Happened
When you create a Hetzner server, the SSH key you select at creation time is injected into the server's `/root/.ssh/authorized_keys` **once**, at boot. If you add or change an SSH key in the Hetzner account **after** the server already exists, that key is NOT automatically pushed to running servers — it only applies to new servers created after that point.

In this case, the SSH key `dennis@DESKTOP-SDOB5OD` was added to the Hetzner account after the server was already running. The server had no authorized keys at all.

### How It Was Resolved
Used Hetzner's **Rescue System** to mount the server's disk and manually inject the public key. See Problem 2 for the full process.

---

## Problem 2 — Accessing the Server Without SSH (Rescue Mode)

### When to Use This
Use rescue mode any time you are locked out of your server (wrong key, no key, forgotten password, misconfigured sshd).

### Steps

**1. Enable Rescue Mode in Hetzner Console**
- Log in to [console.hetzner.com](https://console.hetzner.com)
- Click the server → **Rescue** tab
- Click **Enable Rescue System** → select `linux64` → click **Activate rescue system**
- The page confirms "Rescue System enabled — the server will boot into the chosen rescue OS on the next reboot"

**2. Reboot the Server**
- Click **Actions** (top right of the server page) → **Power off**
- Wait a few seconds, then power back on (toggle the ON switch or Actions → Power on)
- The server boots into the rescue OS (Debian-based minimal environment)

**3. Clear the Stale Host Key Locally**
Because the rescue OS has a different SSH host key than the normal Ubuntu install, SSH will refuse the connection with:
```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
```
Fix it:
```bash
ssh-keygen -f '/home/dennis/.ssh/known_hosts' -R '5.78.180.44'
```

**4. Connect to Rescue Mode**
The rescue system accepts your Hetzner-registered SSH key:
```bash
ssh root@5.78.180.44
# Type "yes" to accept the new fingerprint
```
You land at `root@rescue ~ #`.

**5. Mount the Server's Real Disk**
The rescue system does not automatically mount the server's disk. Mount it manually:
```bash
mount /dev/sda1 /mnt
```
The server's real filesystem is now accessible under `/mnt`.

**6. Inject the Public Key**
Create the `.ssh` directory if it doesn't exist, then write the public key:
```bash
mkdir -p /mnt/root/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN+Ovqc73fREP4u422FbtDfi5Eef3Vsh4bYkTr6zMMTC dennis@DESKTOP-SDOB5OD" >> /mnt/root/.ssh/authorized_keys
chmod 700 /mnt/root/.ssh
chmod 600 /mnt/root/.ssh/authorized_keys
```

> The public key above is the contents of `~/.ssh/id_ed25519.pub` on the local WSL machine.

**7. Reboot Back into Normal OS**
```bash
reboot
```
The rescue system is single-use — after one reboot the server boots from its own disk again.

**8. Clear the Host Key Again and Reconnect**
```bash
ssh-keygen -f '/home/dennis/.ssh/known_hosts' -R '5.78.180.44'
ssh root@5.78.180.44
# Type "yes" to accept the normal Ubuntu fingerprint
```
You are now logged in as root on the normal Ubuntu 24.04 OS.

---

## Problem 3 — `deploy` User Did Not Exist

### Symptom
```
chown: invalid user: 'deploy:deploy'
```

### Why It Happened
The Hetzner deployment guide (Step 5) includes creating the `deploy` user, but this step had not been completed before attempting to set up CI/CD. The server was fresh with only root access.

### How It Was Resolved
Created the user, set up the SSH directory, and copied root's authorized key:

```bash
useradd -m -s /bin/bash deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Note: `useradd -m` creates the home directory. If the directory already exists (because we ran `mkdir` earlier), `useradd` will warn "home directory already exists" but this is harmless.

---

## Problem 4 — Docker Not Installed / `docker-compose-plugin` Not Found

### Symptom
```
E: Unable to locate package docker-compose-plugin
Failed to enable unit: Unit file docker.service does not exist.
usermod: group 'docker' does not exist
```

### Why It Happened
Two issues:
1. `docker.io` (Ubuntu's bundled Docker package) installed but `docker-compose-plugin` is not available in Ubuntu 24.04 (Noble) default repositories — it only ships in Docker's own apt repository.
2. Because `docker.io` didn't fully install, the `docker` group didn't exist, so `usermod -aG docker deploy` failed.

### How It Was Resolved
Removed reliance on Ubuntu's Docker package and installed from Docker's official apt repository instead:

```bash
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
usermod -aG docker deploy
```

**Why this works:** `docker-ce` + `docker-compose-plugin` are maintained by Docker Inc. and are always available for the current Ubuntu LTS. The Ubuntu-packaged `docker.io` lags behind and does not include `docker-compose-plugin` as a separate installable package on Noble.

---

## Final Verification

After all fixes, the end-to-end test passed:

```bash
# From local WSL
ssh deploy@5.78.180.44 "echo connected"
# Output: connected
```

This confirms:
- The `deploy` user exists
- The SSH key is correctly placed in `/home/deploy/.ssh/authorized_keys`
- Docker is installed and the `deploy` user is in the `docker` group

---

## GitHub Actions Secrets Setup

The workflow (`.github/workflows/deploy.yml`) requires two repository secrets:

| Secret | Value | Where to find it |
|---|---|---|
| `HETZNER_HOST` | `5.78.180.44` | Hetzner console → server IPv4 |
| `HETZNER_SSH_KEY` | Contents of `~/.ssh/id_ed25519` | Run `cat ~/.ssh/id_ed25519` locally |

To add secrets:
1. GitHub repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret** (or the pencil icon to update)
3. For `HETZNER_SSH_KEY`, paste the **entire private key** including:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   ...
   -----END OPENSSH PRIVATE KEY-----
   ```

> The private key (`id_ed25519`) never leaves your machine except for this one-time paste into the GitHub secret. GitHub encrypts it immediately and it is never readable again after saving.

---

## Key Files on the Server

| Path | Purpose |
|---|---|
| `/root/.ssh/authorized_keys` | SSH public key for root access |
| `/home/deploy/.ssh/authorized_keys` | SSH public key for deploy user (used by GitHub Actions) |
| `/home/deploy/career-concierge/` | App repository (cloned in Step 6 of hetzner_deployment.md) |
| `/home/deploy/career-concierge/.env` | Production secrets (never committed to git) |

---

## Quick Reference: If You Get Locked Out Again

1. Hetzner console → **Rescue** tab → Enable Rescue System → **Actions → Power off → Power on**
2. Locally: `ssh-keygen -f '/home/dennis/.ssh/known_hosts' -R '5.78.180.44'`
3. `ssh root@5.78.180.44` (rescue accepts your Hetzner-registered key)
4. `mount /dev/sda1 /mnt`
5. Re-inject key: `echo "YOUR_PUBLIC_KEY" >> /mnt/root/.ssh/authorized_keys`
6. `reboot`
7. Clear known_hosts again and reconnect normally
