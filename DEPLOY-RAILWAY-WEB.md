EXPENSO FINANCE CONSOLE - RAILWAY DEPLOYMENT
===========================================

A React + Vite single-page app. The backend is a SEPARATE Railway service;
this one only serves static files.

Node >= 20. Railway's Nixpacks runs: npm ci -> npm run build -> npm start.
`npm start` runs server.mjs, a dependency-free static server that falls back
to index.html so client-side routes such as /sign-in survive a refresh.


1. VARIABLES
------------
  VITE_API_BASE=https://YOUR-BACKEND.up.railway.app

That is the ONLY variable this service needs. Do not set PORT - Railway
injects it and server.mjs reads it.

  *** VITE_API_BASE IS READ AT BUILD TIME, NOT AT RUN TIME. ***

Vite bakes it into the bundle during `npm run build`. Setting it afterwards
does nothing until you redeploy. If you change the backend URL later, you
must trigger a rebuild.

Leave it unset only if the API serves this console from its own origin.


2. THE BACKEND MUST ALLOW THIS ORIGIN
-------------------------------------
On the BACKEND service, set:

  WEB_ORIGIN=https://YOUR-CONSOLE.up.railway.app

Comma-separated if there is more than one. Exact origin: scheme included,
no trailing slash, no path. This drives both CORS and the Socket.IO
handshake - get it wrong and every API call is blocked by the browser and
live updates never connect. This is the single most common failure here.


3. WHO CAN SIGN IN
------------------
The console is for FINANCE and ADMIN accounts only. Employees are refused
with "This is the finance console. Employees use the Expenso mobile app."
That is deliberate, not a bug.

Sign-in page: https://YOUR-CONSOLE.up.railway.app/sign-in

Email + password works with no further setup. The one-time-code option
needs SMTP_URL configured on the backend; without it the code is only
written to the backend's log.


4. VERIFY
---------
  - Open /sign-in - the page should render, not 404.
  - Sign in with a finance account.
  - Open the browser console. CORS errors mean WEB_ORIGIN on the backend
    does not exactly match this service's URL.
  - If pages load but nothing updates live, that is Socket.IO being refused
    by the same WEB_ORIGIN mismatch.


WHAT IS IN THIS ZIP
-------------------
  server.mjs       added for Railway; serves dist/ with SPA fallback
  package.json     a "start" script was added for the same reason
Everything else is the project unchanged.

EXCLUDED
  node_modules/    reinstalled by `npm ci` from package-lock.json
  dist/            produced by `npm run build`

Verified before packaging: `npm run build` completes clean, and the static
server returns index.html for /sign-in and refuses path traversal.
