# Expenso web console

The finance and administrator console for Expenso (Xelements Health, RhythmRx). Finance staff watch every
trip live, set budgets, verify claims beside their receipts, record payments and export claim packages;
administrators manage users, roles and departments. Employees use the Flutter mobile app instead and are
refused here with a pointer to it.

Built from the approved prototype (Expenso Finance Prototype) and the SRS (RRX-TER-SRS-001 v2.1) against the Expenso
API (`../server`, documented in `../docs/api.md`).

## Requirements

- Node.js 20 or later (developed on Node 22) and npm.
- A running Expenso API. The development default is the dedicated web instance on port 4101 with the
  `expenso_web` database: `cd ../server && ./scripts/instance.sh web 4101 seed` (reseeds and restarts it).
- For end-to-end tests and screenshots: Playwright's Chromium in `/opt/pw-browsers`. The browsers are
  preinstalled; don't run `playwright install`.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

The dev server proxies `/api` (HTTP and the Socket.IO websocket) to `http://localhost:4101`. Sign in with a demo
account; the password for all of them is `Expenso@2026`.

| Account | Role | Use it to see |
|---|---|---|
| `meera@xelements.test` | Finance | the whole console |
| `vikram@xelements.test` | Finance, and a member of Supplier audit · Visakhapatnam | the FR-VER-10 locks: no budgets on his own trip, no decisions on his own claim |
| `farah@xelements.test` | Administrator only | users, departments; no trips or money |
| `arjun@xelements.test` | Employee | the refusal (403 `web_role_required`) |

A one-time code works too: in development the API echoes the code and the sign-in page shows it.

## Configuration

| Variable | When | Default | Meaning |
|---|---|---|---|
| `API_TARGET` | `npm run dev`, `npm run preview` | `http://localhost:4101` | where the dev and preview servers proxy `/api` |
| `VITE_API_BASE` | build time | unset (same origin) | the API's origin, optionally with a path prefix, for example `https://api.xelements.in` or `https://xelements.in/expenso`; the console then calls `<base>/api/v1` and opens the socket at `<base>/api/v1/socket.io` |
| `E2E_BASE_URL` | tests | `http://localhost:5173` | the console under test |
| `E2E_API` | tests | `http://localhost:4101/api/v1` | the API the tests act on directly (as the phone would) |
| `E2E_SKIP_SEED` / `SHOTS_SKIP_SEED` | tests | unset | `1` keeps the current data instead of reseeding |

`localStorage['expenso.idleMs']` shortens the 30-minute idle sign-out in development builds only, to try the
warning and the sign-out quickly. Production builds ignore it.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server on 5173 with the API proxy |
| `npm run build` | type-checks (`tsc --noEmit`) and builds to `dist/` |
| `npm run preview` | serves `dist/` on 5180 with the same proxy |
| `npm run typecheck` | TypeScript strict check of the app, tests and config |
| `npm test` | unit and component tests (Vitest, jsdom, Testing Library) |
| `npm run e2e` | Playwright journeys against the dev server; reseeds `expenso_web` first |
| `npm run shots` | screenshots of every screen in light and dark into `docs/screenshots/` |

## Build and deploy

```bash
npm ci
npm run build          # dist/: index.html plus hashed assets, fonts bundled (no CDN)
```

### Serve from the API

The API serves the built console itself, on the same origin, so one process runs both:

```bash
cd web && npm ci && npm run build            # writes web/dist
cd ../server && npm run build && npm start   # the console at /, the API at /api/v1
```

- The API looks for `web/dist` beside the server when it starts; `WEB_DIST_DIR=/srv/expenso-web/dist`
  points it elsewhere. Without a built console it serves only the API.
- `/api/*` stays the API; every other path falls back to `index.html`, so deep links open directly.
  `assets/*` are cached for a year, `index.html` never.
- Same origin: no `VITE_API_BASE` and no `WEB_ORIGIN` entry needed.
- The API sends a strict Content Security Policy. Scripts load only from the same origin, plus the inline
  theme script (it sets light or dark before the first paint), allowed by its SHA-256 hash; images, frames
  and objects also allow `blob:` for receipts and PDFs, and `connect-src` allows the websocket. Keep every
  other script, style sheet and font a file in the bundle (no CDN, no new inline scripts). The hash is
  taken from `index.html` when the API starts, so restart the API after rebuilding the console.

### Behind another web server

`dist/` is a static single-page app. Serve it with any static server and:

1. **Same origin (recommended).** Serve the console and the API from one origin and route `/api/*` (including
   websocket upgrades for `/api/v1/socket.io`) to the API. No build variable needed.
2. **Separate API origin.** Build with `VITE_API_BASE=https://api.example.com npm run build` and add the
   console's origin to the API's `WEB_ORIGIN` (CORS and Socket.IO both read it).
3. **Deep links.** Send every unknown path to `index.html` (for example nginx `try_files $uri /index.html;`),
   so `/trips/EXP-2026-00106/export` or `/claims/EXP-2026-00103/suresh-babu` open directly.
4. **Caching.** `index.html` must not be cached; `assets/*` are content-hashed and can be cached for a year.

Example nginx server block:

```nginx
server {
  listen 443 ssl;
  server_name expenso.xelements.in;
  root /srv/expenso-web/dist;
  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 25m;
  }
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location / { add_header Cache-Control "no-cache"; try_files $uri /index.html; }
}
```

## How it works

- **Stack.** Vite, React 19, TypeScript strict, react-router, TanStack Query, socket.io-client, lucide-react
  icons and bundled Fontsource fonts. No UI kit: the prototype's CSS is ported (`src/styles/tokens.css`,
  `core.css`, `web.css`) with `app.css` for what the static prototype didn't need. Charts are plain SVG and CSS.
- **Session (NFR-06).** The access token lives only in memory; the refresh token is in `sessionStorage`, so a
  reload keeps you signed in and closing the tab signs you out. Refresh is single-flight: any number of
  requests that get `401 token_expired` wait for one refresh (the API rotates refresh tokens) and retry once.
  `session_ended` and `deactivated` end the session with the reason shown on the sign-in page. After 30
  minutes without activity a warning appears two minutes before the end; the timed-out page stays dimmed
  under the sign-out dialog, unsent notes are kept for the same user only, and signing in again returns to
  the same page.
- **Live updates (FR-WEB-03, NFR-13).** One Socket.IO connection per signed-in tab. `trip.changed` events are
  batched and refetch only what depends on that trip; `notification` updates the bell and raises a toast with
  an Open action; `export.progress` and `export.updated` drive the build dialog and the export centre. The top
  bar shows Live or Reconnecting, and the dashboard says since when figures may be stale.
- **Money and time (NFR-10).** Amounts are integer paise, shown as INR with Indian grouping (₹1,20,450) and a
  true minus sign, always in Manrope because Sora has no ₹ glyph. Every instant is shown in IST, whatever the
  browser's time zone; calendar dates from the API are IST dates.
- **Addresses.** Trips open by reference (`/trips/EXP-2026-00106`), claims by trip and member
  (`/claims/EXP-2026-00103/suresh-babu`); UUIDs work too. Filters live in the URL, so every view can be linked.
- **Budgets (FR-BUD-01..08).** The W05 editor previews every change with the server, then saves the whole
  form in one `PUT /finance/trips/:id/budgets`, so earlier expenses are resolved once, exactly as previewed;
  the saved banner names anyone asked to choose between the pool and their individual budget (FR-BUD-03).
  A finance user on a trip can't set its budgets or decide their own claim (FR-VER-10) and can ask a
  colleague who isn't on the trip instead (the trip and the claim list its `financeUsers`).
- **Threads.** Claim review shows each expense's thread with the member and a box to write on it. A finance
  note never changes the decision; when a member asks about a rejection or a lower approval, the box opens
  as "Answer {name}" and the question is flagged in the list until someone answers. Not on your own claim.
- **Files.** Receipts, documents and exports are fetched with the bearer token as blobs and saved under the
  name from `Content-Disposition`.
- **Accessibility (NFR-09).** Keyboard operable throughout (claim review: J/K to move, V verify, A approve
  lower, Q query, R reject; `/` focuses search), visible focus, dialogs trap and return focus, and status is
  never colour alone: every bar has its percentage and every pill its word. Designed for 1280 px and wider.

## Screens

| Code | Screen | Route |
|---|---|---|
| W01, W01·a, W01·b | Sign in, employee refused, signed out after 30 minutes | `/sign-in` |
| W02, W02·a | Dashboard, live updates paused | `/` |
| W03, W03·a, W03·b | Trips, over-budget view, nothing found | `/trips` |
| W04 to W04·j | Trip page: overview, expenses, documents, upload, timeline, export log, extended, end a member's trip, assign an owner, closed, cancelled | `/trips/:ref/:tab?` |
| W05 to W05·d | Budgets: edit with preview, saved, raise, remove, locked for a member | `/trips/:ref/budgets` |
| W12, W06 to W06·i | Claims queue; claim review with query, reply, lower, reject, answering a member's question about a decision, several at once, member edited, own claim, flags, receipt on the phone | `/claims`, `/claims/:ref/:member` |
| W07 to W07·c | Payments: record, reimbursed, part paid, reopen | `/claims/:ref/:member/payments` |
| W08 to W08·d | Export: scope and formats, one member, building, ready; export centre | `/trips/:ref/export`, `/exports` |
| W09, W09·a, W09·b | Bell, notification centre, settings | `/notifications`, `/settings` |
| W10 to W10·c | Users (designation, Send app link), edit, deactivate with a reason, departments | `/admin/users`, `/admin/departments` |
| W11 | Audit log with CSV: everything for finance, users, roles and departments for administrators | `/audit` |

Screenshots of each, light and dark at 1440 × 900, are in `docs/screenshots/` (file names start with the
screen code, `W04a` for W04·a).

## Project structure

```
src/
  main.tsx            fonts, styles, <App/>
  app/                App (routes and role guards), Shell (sidebar, top bar, bell, search, idle dialogs),
                      core (session, API client, query cache), realtime (socket), idle, theme
  api/                types.ts (API shapes), keys.ts (query keys), hooks.ts (one query per endpoint)
  components/         ui (buttons, pills, cards, tables, fields), Overlay (modal, drawer, popover), filters,
                      trip pieces, BudgetPanel, Gantt, ZipTree, exports, Toasts, Icon, Brand
  lib/                format (INR, IST), session, api, zipTree, audit, labels, links, drafts, download, hooks
  pages/              SignIn, Dashboard, Trips, Claims, Reimbursement, ExportCentre, Notifications, Settings,
                      Audit, Misc; trip/ (trip page tabs, budget editor, dialogs); review/ (claim review,
                      receipt viewer, decision dialogs); export/ (export page, scope form, build steps);
                      admin/ (users, departments)
  styles/             tokens.css, core.css, web.css (from the prototype), app.css
e2e/                  Playwright journeys, global setup (reseed), helpers, fixtures, screenshots.mjs
docs/screenshots/     screen captures by code
```

## Tests

- **Unit and component (`npm test`, 64 tests).** INR grouping, parsing and IST formatting across midnight;
  budget thresholds as the server states them (floored percentages, amber from 80%, "Fully used" at 100%,
  red only when over); the ZIP preview tree (folders, collapsing, wrapping, PROVISIONAL marking);
  single-flight refresh and the client's 401 retry; the idle timer; audit log cells (server item labels,
  hand-offs, disputes, finance notes); BudgetBar, BudgetLine and ClaimStatusPill; the export scope form and
  the build steps from the progress `phase`; the thread box (answer sent and shown at once, draft kept,
  the server's refusal shown).
- **End to end (`npm run e2e`, 15 journeys, about a minute).** Arjun refused, a wrong password, Meera by
  one-time code, the idle warning and sign-out; Meera's dashboard with last month's department spend,
  MedTech Expo from the list, a pool change with its preview, a pool and an individual budget saved in one
  go with the member holding both asked to choose (FR-BUD-03, checked against the API), a query and a
  verification on Suresh's claim, Imran's payment with a proof PDF, a whole-trip-and-each export downloaded as
  a ZIP, Arjun's new expense (posted to the API as the phone would) appearing on the open trip within 5
  seconds, and an answer to Rohan's question about his rejected dinner (still rejected, his
  `expense.message` notification checked); Vikram's FR-VER-10 locks and asking Meera to set the budgets
  (her `finance.handoff` notification checked); Farah sending an app link, deactivating a user with a
  reason, reactivating them and finding both in the administration audit log.
- **Screenshots (`npm run shots`).** 55 screens in light and dark.

## Known gaps

`../docs/api-requests-web.md` tracks what the console asked of the API. After the third server round
everything is wired in except single sign-on (password and email code remain). The trip timeline has no
server wording for `expense.dispute` and `expense.message` yet, so the console words them itself.
