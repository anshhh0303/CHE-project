# Deploy Groot Mode: Render + Turso

The repository includes a Render Blueprint (`render.yaml`). Render serves the
website and Node API; Turso stores accounts, sessions, quizzes and rankings.
The question bank ships with the app. No Vercel configuration is needed.

## 1. Create the database

1. Sign up at [Turso](https://turso.tech/) and select its free plan.
2. Create a database named `groot-mode`. This app uses the **libSQL** client;
   select a libSQL-compatible database if the dashboard offers engine choices.
   Pick the closest available location to Singapore, where the Render service runs.
3. Open that database and copy its connection URL (`libsql://...`).
4. Generate a database token with **read and write** access. Use a token whose
   lifetime covers your project demonstration; replace it in Render before it expires.
5. Keep the URL and token ready for the next step. Enter the token only into
   Render's environment settings. Do not put it in GitHub, frontend JavaScript,
   screenshots, your report or chat.

If you use Turso's CLI, the documented commands are:

```text
turso db create groot-mode
turso db show groot-mode --url
turso db tokens create groot-mode
```

See [database creation](https://docs.turso.tech/cli/db/create),
[connection URL](https://docs.turso.tech/cli/db/show), and
[token generation](https://docs.turso.tech/cli/db/tokens/create).

## 2. Deploy the repository

1. Sign up at [Render](https://dashboard.render.com/) using GitHub.
2. Choose **New → Blueprint** and connect
   [anshhh0303/CHE-project](https://github.com/anshhh0303/CHE-project).
   Allow Render access to that repository if prompted.
3. Select branch `main`. Render reads `render.yaml` from the repository root.
4. Review that the service is a **free Node web service**, named `groot-mode`.
   It uses Singapore, build command `npm ci`, and start command `npm start`.
5. Fill in the two prompted settings:

   | Setting | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | Your database's `libsql://...` URL |
   | `TURSO_AUTH_TOKEN` | Its read/write token |

6. Create/deploy the Blueprint and wait for the service to become live.
7. Open the **actual URL Render assigns**, usually an `onrender.com` address.
   Share this address with players. All accounts now use the shared Turso database.

The Blueprint sets HTTPS-only cookies, the public server binding, Node 24.16.0,
and `/api/health`. Render supplies `PORT`; do not hardcode it in the dashboard.
The application creates its tables automatically on startup.

If you already created a Render web service, configure that service instead of
creating a duplicate. Apply the build/start commands and environment values from
`render.yaml`, select the free instance, and deploy the latest `main` commit.

## 3. Check the live application

1. Visit `https://YOUR-RENDER-ADDRESS/api/health`. It should return
   `{"status":"ok","database":"turso"}`.
2. Register a new account, finish ten questions, use both lifelines, and check
   the score, mascot reaction, profile and leaderboard.
3. Log out and log in again. Check your saved score and history.
4. Create another account in a private browser window and confirm both players
   appear on the same leaderboard.
5. Redeploy the service and confirm accounts and scores still exist. Turso,
   rather than Render's temporary filesystem, preserves them.

The automated suite exercises native SQLite and the official libSQL client
against isolated local databases. These live checks still need your actual
cloud credentials and service; local tests do not prove remote connectivity.

## Free hosting behavior and troubleshooting

Render's free service sleeps after 15 minutes without traffic; the next request
can take about a minute while it wakes. Open the website before your presentation.
Accounts and scores stay in Turso while Render sleeps. Stay within both providers'
free quotas. See [Render's free limits](https://render.com/docs/free) and
[Turso pricing](https://turso.tech/pricing).

- **Missing Turso configuration:** enter both environment values and redeploy.
  The app deliberately refuses temporary SQLite storage on Render.
- **Database authentication failure:** replace an expired or incorrect token and
  check that it belongs to the URL's database and permits writes.
- **Build failure:** check the deploy logs, Node version and `npm ci` command.
- **Live but database unavailable:** inspect `/api/health` and Render logs, then
  check the Turso database status and quotas. The app will not switch databases
  silently during an outage.

Your existing local accounts remain in `data/ecoquest.sqlite`. A newly created
Turso database starts with an empty leaderboard. Moving local accounts is a
separate migration; never commit the SQLite file to GitHub.

## Optional local cloud connection

Install Node 24, run `npm ci`, copy `.env.example` to `.env`, and fill in the two
Turso fields. Then run `npm start`. Leave `COOKIE_SECURE=0` for localhost HTTP.
Changes then affect that cloud database. Leave Turso fields blank for normal
local SQLite development. `npm test` always uses isolated test databases.

Official configuration reference:
[Render Blueprints](https://render.com/docs/blueprint-spec).
