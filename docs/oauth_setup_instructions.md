# OAuth Setup — Localhost Development

This app was originally built for Manus.ai, which provided its own OAuth login server
(`OAUTH_SERVER_URL`). Running on localhost means that service is unavailable.
The sections below explain what each auth-related env var does and how to get a working
session without Manus.

---

## How authentication works

1. The browser sends a session cookie (`app_session_id`) with every request.
2. The server verifies the cookie as a JWT signed with `JWT_SECRET` (local operation — no
   external call needed).
3. If the JWT is valid and the `openId` inside it matches a row in the `users` table, the
   user is authenticated.
4. If the user's `openId` matches `OWNER_OPEN_ID`, Drizzle assigns them `role = 'admin'`,
   which is required for Google Drive sync and document management.

The Manus OAuth server is only called during the **initial login flow**
(`GET /api/oauth/callback`). Once a valid JWT cookie exists, the app never contacts Manus again.

---

## Required env vars for localhost

```env
JWT_SECRET=any-long-random-string     # Signs and verifies session JWTs
VITE_APP_ID=career-concierge-dev      # Embedded in the JWT payload — any string works
OWNER_OPEN_ID=local-dev-user          # The openId that gets admin role
OAUTH_SERVER_URL=                     # Leave blank — not used after login is bypassed
```

Generate a strong `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Creating a local dev session (one-time setup)

Because the Manus login page is unreachable from localhost, seed the database and generate
a session cookie manually.

### Step 1 — Initialise the database

```bash
pnpm db:push
```

### Step 2 — Seed an admin user

Run this once from the project root (replace values to match your `.env`):

```bash
node --input-type=module <<'EOF'
import Database from 'better-sqlite3';
const db = new Database('./data/db.sqlite');
db.exec(`
  INSERT OR IGNORE INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
  VALUES ('local-dev-user', 'Dev User', 'dev@localhost', 'local',  'admin',
          unixepoch(), unixepoch(), unixepoch())
`);
console.log('User seeded');
db.close();
EOF
```

> Change `local-dev-user` to whatever you set for `OWNER_OPEN_ID`.

### Step 3 — Generate a session JWT

```bash
node --input-type=module <<'EOF'
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode('PASTE_YOUR_JWT_SECRET_HERE');
const token = await new SignJWT({ openId: 'local-dev-user', appId: 'career-concierge-dev', name: 'Dev User' })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setExpirationTime('1y')
  .sign(secret);
console.log(token);
EOF
```

### Step 4 — Set the cookie in your browser

1. Open `http://localhost:3000` in Chrome/Firefox.
2. Open DevTools → Application → Cookies → `http://localhost:3000`.
3. Create a new cookie:
   - **Name**: `app_session_id`
   - **Value**: the JWT from Step 3
   - **Path**: `/`
4. Refresh the page — you are now logged in as admin.

---

## Manus env vars you can safely ignore on localhost

| Variable | Purpose | Localhost value |
|---|---|---|
| `OAUTH_SERVER_URL` | Manus token exchange endpoint | Leave blank |
| `VITE_APP_ID` | Manus project ID | Any string, e.g. `dev` |
| `OWNER_OPEN_ID` | openId that gets admin role | Must match what you seeded in DB |
