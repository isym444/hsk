# Deploying HSK4 practice

Three pieces, three homes:

```
   browser
      │
      │  https://hsk4-practice.onrender.com      (Angular bundle, Render free static site)
      ▼
   config.json says where the API and Supabase are
      │
      │  (1) email + password ───────────────▶ Supabase Auth
      │  (2) a session comes back (access + refresh token)
      │  (3) every API call carries  Authorization: Bearer <token>
      │  https://ftapi.isym.uk/api               (Cloudflare DNS: A 187.6.167.78, DNS only)
      ▼
   Hostinger VPS
      Traefik  ──websecure + letsencrypt──▶  hsk4-practice-api:8000
      │                                       verifies each token's signature against
      │                                       Supabase's published public keys
      │  postgresql://…pooler.supabase.com:5432   (sslmode=require)
      ▼
   Supabase Postgres  (questions / sessions / reviews — one history per account)
```

| Piece | Where it lives | Config |
| --- | --- | --- |
| Review API | Hostinger VPS, Docker, routed by your existing Traefik | `deploy/docker-compose.yml`, `deploy/.env` |
| Database | Supabase (PostgreSQL) | `HSK_DATABASE_URL` |
| Sign-in | Supabase Auth, email + password (accounts created in the dashboard) | `HSK_SUPABASE_URL`, `HSK_SUPABASE_JWT_SECRET`, `HSK_ALLOWED_EMAILS` |
| UI | Render free static site | `render.yaml` |
| Image build | GitHub Actions → GHCR | `.github/workflows/backend.yml` |

The API is stateless: the image holds only code plus the generated question
catalogue. All review history is in Supabase, so the container can be replaced
at any time with no data loss.

---

## 1. Supabase

1. Go to <https://supabase.com/dashboard> → **New project**.
   - **Name**: `hsk4-practice`
   - **Database password**: let it generate one, and save it in your password
     manager. You need it in step 2.
   - **Region**: the one nearest the VPS (a European region for a European
     Hostinger box) — every API call crosses this link.
   - **Plan**: Free.
2. Wait for provisioning (~2 minutes).
3. Click **Connect** (top of the page) → **Session pooler** → copy the string.
4. Replace `[YOUR-PASSWORD]` with the real password, **percent-encoding** any of
   `& # ? / : @ space` it contains (e.g. `p@ss word` → `p%40ss%20word`).

The result looks like:

```
postgresql://postgres.abcdefghijklm:YOUR-PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require
```

Use **Session pooler**, not the direct connection: on the free tier the direct
host (`db.<ref>.supabase.co`) is **IPv6-only**, and the session pooler is the
IPv4-reachable one. Session mode also supports everything this API does.
([Supabase: connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres))

Notes:

- **You do not need to create any tables.** On first start the API creates the
  schema (including a `user_id` on every session and review), seeds all 400
  questions from the catalogue baked into the image, and turns on row-level
  security for the three tables. An existing pre-authentication database is
  upgraded in place; rows from before are attributed to nobody and stay
  invisible rather than being deleted.
- You do not need the Supabase service key, and this app never uses Supabase's
  Data API — the API speaks plain Postgres.
- RLS is enabled with no policies on purpose: Supabase exposes the `public`
  schema over its Data API, and this closes that door. The API connects as the
  table owner, which bypasses RLS, so it is unaffected.

### 1b. Turn on email + password sign-in

Email sign-in is enabled on new Supabase projects by default. Two settings
matter, and both are about getting the first account usable.

1. **Create your account.** **Authentication → Users → Add user** (the button in
   your screenshot): enter your email and a password, and tick **Auto Confirm
   User**.

   That tick is the important one. If the project has *Confirm email* switched
   on — the default — an unconfirmed account cannot sign in at all, and the
   dashboard will not have sent it a confirmation email. Either tick **Auto
   Confirm User** when adding each user, or turn *Confirm email* off under
   **Authentication → Sign In / Providers → Email**. The app surfaces the
   difference: an unconfirmed account gets *"This account has not been confirmed
   yet"* rather than a vague failure.

2. **Tell Supabase where a password-reset link may land.**
   **Authentication → URL Configuration**
   - **Site URL**: your frontend, e.g. `https://hsk4-practice.onrender.com`
   - **Redirect URLs**: add `https://hsk4-practice.onrender.com/**` and, for
     local development, `http://localhost:4200/**`.

   The app asks for the reset link to come back to `/reset-password`, so the
   `/**` part matters. A redirect that is not on this list is silently rewritten
   to the Site URL, which is the usual cause of "the reset link signs me in but
   never asks for a new password".

Passwords must be at least 6 characters by default (**Authentication → Sign In /
Providers → Email → Minimum password length** raises that; the app's own form
matches whatever you set there as long as you update the constant in
`reset-password.component.ts`).

Two limits worth knowing before you are surprised by them:

- A reset email can be requested **once per address per 60 seconds**, and each
  link is valid for an hour.
- Projects using Supabase's built-in email sender are capped at a handful of
  messages per hour. That is plenty for password resets on a personal app; if
  you hit it, attach your own SMTP under **Project Settings → Auth → SMTP
  Settings** (Resend, Postmark, SES …). The default sender also lands in spam
  fairly often — check there first.

Because accounts are created in the dashboard, you can — and should — turn
sign-ups off entirely: **Authentication → Sign In / Providers → Email → Allow
new users to sign up: off**. Nothing in the app tries to register, so this costs
you nothing and closes the last public door into your project.

### 1c. Collect the three values the deployment needs

| Where | Value | Goes into |
| --- | --- | --- |
| **Project Settings → API Keys** | publishable key (`sb_publishable_…`), or the legacy `anon` key | Render: `HSK_SUPABASE_ANON_KEY` |
| Project URL | `https://<project-ref>.supabase.co` | Render: `HSK_SUPABASE_URL`, VPS: `HSK_SUPABASE_URL` |
| **Project Settings → API → JWT Settings** | the legacy **JWT Secret** | VPS: `HSK_SUPABASE_JWT_SECRET` |

The publishable/anon key is public — it ships in every Supabase web app and
grants nothing on its own. The JWT secret is not: it stays on the VPS.

Set **both** `HSK_SUPABASE_URL` and `HSK_SUPABASE_JWT_SECRET` on the VPS. Tokens
signed with Supabase's newer asymmetric signing keys are verified against the
project's public keys with no secret involved; projects still on the legacy
shared secret are verified with the secret. With both configured, either works
and you never have to determine which system your project is on.

### 1d. Decide who may use the app

Set `HSK_ALLOWED_EMAILS=you@example.com` in `deploy/.env`. Sign-ups are already
closed and accounts only exist because you created them, so this is a second
lock rather than the only one — but it is the one that fails safe: an account
added to the project by mistake still cannot reach the API until its address is
listed here.

---

## 2. The VPS

### 2a. How Traefik reaches containers (already checked on this box)

This deployment's Traefik runs with **`network_mode: host`** and is attached to
**no Docker network**:

```
$ docker inspect traefik-lqfm-traefik-1 \
    --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
host
```

So there is no shared network to join. `deploy/docker-compose.yml` therefore
declares **no** `networks:` block: the service takes the default compose bridge,
and Traefik reaches it by container IP through the Docker socket. That is the
same shape as the working `net-worth-api`, which also declares no network.

Its flags, which the compose labels match:

```
--providers.docker.exposedbydefault=false   -> traefik.enable=true is required
--entrypoints.websecure.address=:443        -> routers belong on `websecure`
--certificatesresolvers.letsencrypt.acme…   -> tls.certresolver=letsencrypt
--entrypoints.web.http.redirections…        -> http→https is global
```

The last one means this file needs no redirect router — plain HTTP is already
redirected to HTTPS by the entrypoint itself.

If you ever move to a Traefik that *does* share a network, re-run the inspect
command and add a `networks:` block back to the compose file naming that
network. And make sure the VPS firewall allows 80 and 443 — Let's Encrypt needs
port 80 for the HTTP-01 challenge:

```bash
sudo ufw status
```

### 2b. Let the VPS pull the image

The GitHub repo is private, so the GHCR package it publishes is private too.
Either:

**Option A — make the package public** (simplest, no secrets on the VPS):
GitHub → your profile → **Packages** → `hsk4-practice-api` → *Package settings*
→ *Change visibility* → **Public**.

**Option B — log in with a token** (keeps the image private): create a classic
PAT with the `read:packages` scope, then on the VPS:

```bash
echo 'ghp_xxxxxxxx' | docker login ghcr.io -u isym444 --password-stdin
```

That writes `~/.docker/config.json`, which Compose reuses.

### 2c. Deploy

```bash
git clone https://github.com/isym444/hsk.git /opt/hsk
cd /opt/hsk/deploy

cp .env.example .env
nano .env                 # HSK_DATABASE_URL, HSK_SUPABASE_URL, HSK_SUPABASE_JWT_SECRET,
                          # HSK_ALLOWED_EMAILS  (all from step 1)
chmod 600 .env            # it holds the database password and the JWT secret

docker compose pull
docker compose up -d
docker compose logs -f api
```

`HSK_CORS_ORIGINS` can stay as the placeholder until Render gives you a URL
(step 4) — the API works fine without it until a browser calls it from another
origin.

If you skip `HSK_SUPABASE_URL`, the container still starts and stays healthy,
but every endpoint except `/api/health` answers **503** with a message saying
authentication is not configured. That is deliberate: a public API that silently
served everyone would be worse.

---

## 3. Verify the backend

```bash
curl -s https://ftapi.isym.uk/api/health
```

Expect:

```json
{"status":"ok","database":"postgresql://aws-0-eu-west-2.pooler.supabase.com:5432/postgres","questions":400}
```

- `"questions":400` — the catalogue was seeded into Supabase.
- The `database` field never contains the password.
- Health is public on purpose (the container's own health check has no token),
  so it reports no per-user data. Your own row counts are at `/api/me`, behind a
  token.

The fence around the API is a signed-in account:

```bash
# 401 — no token
curl -s -o /dev/null -w '%{http_code}\n' https://ftapi.isym.uk/api/categories

# 401 — not a token either
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Authorization: Bearer nope' https://ftapi.isym.uk/api/categories
```

`401` for both is the correct answer, and after you sign in with a real link the
browser's own requests return `200`. A `403` means the token was valid but the
account is not on `HSK_ALLOWED_EMAILS`.

- Human-friendly landing page: <https://ftapi.isym.uk/>
- API docs: <https://ftapi.isym.uk/docs> (the Authorize button takes a token)

If Traefik is not routing yet, check it directly from the VPS:

```bash
curl -s --resolve ftapi.isym.uk:443:127.0.0.1 https://ftapi.isym.uk/api/health
docker compose logs --tail 50 api
docker inspect --format '{{.State.Health.Status}}' hsk4-practice-api-1
```

---

## 4. Render (the frontend)

Either use the committed blueprint — **New** → **Blueprint** → pick the repo,
which applies `render.yaml` — or create it by hand:

1. <https://dashboard.render.com> → **New** → **Static Site**.
2. Connect the `isym444/hsk` repository.
3. **Branch**: `main`.
4. **Root Directory**: `hsk4-practice-app`.
5. **Build Command**: `npm ci && npm run build:render`.
6. **Publish Directory**: `dist/hsk4-practice-app/browser`.
7. **Environment** → add three variables:
   - `HSK_API_BASE` = `https://ftapi.isym.uk/api`
   - `HSK_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `HSK_SUPABASE_ANON_KEY` = the publishable (or legacy anon) key

   All three are read *at build time* by `scripts/write-runtime-config.mjs`,
   which writes them into `public/config.json` inside the bundle — so after
   changing any of them you must redeploy. The anon key is public by design; it
   grants nothing on its own.
8. **Redirects/Rewrites** → add one rule:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: **Rewrite**

   Angular's routes (`/stats/reading`, `/deck/writing/summary/<id>`) are real
   URLs, so a refresh needs `index.html`. Render serves a real file whenever one
   exists and only applies the rule otherwise, so hashed assets and
   `/audio/*.mp3` are untouched
   ([Render docs](https://render.com/docs/redirects-rewrites)).
9. **Create Static Site** and wait for the first deploy.

Then two things have to agree with the new URL:

- **Allow the site to call the API.** Copy its exact origin (scheme + host, no
  trailing slash) into `deploy/.env` on the VPS and restart:

  ```bash
  cd /opt/hsk/deploy
  nano .env          # HSK_CORS_ORIGINS=https://hsk4-practice.onrender.com
  docker compose up -d
  ```

- **Allow password-reset links to come back here.** Add the same URL to Supabase
  under **Authentication → URL Configuration** (Site URL and Redirect URLs), as
  in step 1b. Without it, Supabase rewrites the redirect and the link lands
  somewhere unexpected.

The 26 MB of exam audio ships in the repo and is served from Render's CDN, so
listening questions stream from the static site while only the small JSON API
calls cross to the VPS.

---

## 5. Updating after a code change

```bash
git push origin main          # GitHub Actions: tests, then publishes :latest
ssh you@vps
cd /opt/hsk && git pull       # only needed if deploy/ or docs changed
cd deploy && docker compose pull && docker compose up -d
```

Render redeploys the frontend automatically on every push to `main`.

Watch the image build at **GitHub → Actions → Backend**.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `404 page not found` from Traefik | The container is not on Traefik's network (step 2a), or the `Host(...)` rule does not match. Check `docker compose logs traefik`. |
| Browser console: CORS error | `HSK_CORS_ORIGINS` must exactly match the page's origin — `https://…` , no trailing slash, no `www` unless the browser is actually on `www`. Restart after editing. |
| Every endpoint answers **503** | `HSK_SUPABASE_URL` is not set, so the API cannot verify anyone. `docker compose logs api` says so on startup. |
| Every endpoint answers **401** with a valid session | The token is signed by a project the API does not know. Check `HSK_SUPABASE_URL` matches the project the frontend signs in against, then set `HSK_SUPABASE_JWT_SECRET` as well (the two signing systems are described in step 1c). A custom Auth domain also needs `HSK_SUPABASE_JWT_ISSUER`. |
| **403** `… is not allowed to use this app` | The account signed in fine but is not on `HSK_ALLOWED_EMAILS`. The login page shows this message. |
| `Invalid login credentials` for an account you just created | Either the password is wrong, or the account is unconfirmed. Add users with **Auto Confirm User** ticked, or turn *Confirm email* off (step 1b). The app says *"This account has not been confirmed yet"* when that is the cause. |
| The reset link signs me in but never asks for a new password | The redirect URL is not on Supabase's allow-list, so Supabase replaced it with the Site URL. Step 1b. |
| `Email rate limit exceeded` | One reset email per address per minute, and the built-in sender is capped per hour. Wait, or attach your own SMTP (step 1b). |
| Reset email never arrives | Check spam first — Supabase's built-in sender is not great. |
| `/api/health` returns 500 | The API cannot reach Supabase. `docker compose logs api` shows the reason. |
| `password authentication failed` | The password in the DSN is wrong or not percent-encoded (`@` → `%40`, `#` → `%23`, …). |
| `Tenant or user not found` | Wrong pooler host, or the username is not `postgres.<project-ref>`. Copy the whole string from **Connect → Session pooler**. |
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | You used the direct connection from an IPv4-only host. Use the session pooler. |
| `psycopg.OperationalError: timeout` | Supabase project paused (free projects pause after ~1 week idle) or the VPS cannot reach the internet on 5432. Resume it in the dashboard. |
| Deep link on Render 404s | The `/*` → `/index.html` rewrite rule is missing. |
| App still calls `…/api` on Render | `HSK_API_BASE` was not set when the bundle was built. Add it and redeploy (it is baked into `config.json` at build time). |
| Login page says "Not configured" | `config.json` has no `supabaseUrl`/`supabaseAnonKey` — the Render environment variables were added after the last build. Redeploy. |
| Traefik serves a stale/other cert | The `certresolver` name must match your Traefik config (`letsencrypt` here). Check the ACME logs. |

---

## Security notes

- **The API is closed by default.** Every endpoint except `/api/health` requires
  a Supabase access token, verified locally against the project's public keys —
  no shared secret needs to reach the API for the modern signing-key system, and
  no round-trip to Supabase happens per request. `/api/health` is public only
  because the container's own health check has no token; it reports liveness,
  the database host and the question count, and no per-user data.
- **Every account gets its own history.** Sessions and reviews carry the
  caller's `user_id`, every query filters on it, and another account's session
  is a `404` rather than a `403` — so the existence of someone else's session is
  not even confirmed. The question catalogue is shared.
- **The allow-list is a second lock.** Sign-ups are off and accounts exist only
  because you created them in the dashboard; `HSK_ALLOWED_EMAILS` is what fails
  safe if an account is ever added by mistake. The app has no registration form
  at all.
- **Forgotten passwords are self-service**, through Supabase's recovery email.
  A reset link signs you in for long enough to choose a new password and is
  single-use with a one-hour expiry; the page that receives it says so and
  refuses to show a form when there is no session.
- **No secrets in the browser.** The bundle contains only the project URL and
  the publishable/anon key, both of which are public by design. The database
  password and JWT secret live in `deploy/.env` (mode 600, git-ignored) and in
  the container environment; `/api/health` reports the database host without
  credentials.
- **RLS is on** for all three tables, so a leaked Supabase anon key cannot read
  or write them through the Data API. The API connects as the table owner, which
  bypasses RLS.
- **Sessions live in the browser's local storage**, which is what supabase-js
  does by default. That is the standard trade-off for a static SPA: it means an
  XSS bug could read the token. The bundle has no `innerHTML`-style injection
  points and no third-party scripts, and tokens are short-lived and refreshed.
- **Backups**: the free tier has no point-in-time recovery. The dataset is tiny
  (a few hundred rows), so `pg_dump` from a machine that can reach the pooler is
  enough: `pg_dump 'postgresql://postgres.<ref>:…@….pooler.supabase.com:5432/postgres' > hsk.sql`
  (install `postgresql-client` locally or run `postgres:17-alpine` in Docker).
