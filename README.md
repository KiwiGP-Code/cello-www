# Cello Board Demo

Astro prototype for the board-facing Cello acquisition story: Cello remains network-first while adding subtle digital resilience capability.

## Routes

- `/` - Cello-first home page
- `/solutions/smartwan` - representative network solution
- `/digital-resilience` - subtle resilience capability page
- `/contact` - local contact path
- `/gkc` - hidden transition page for the future `gkc.co` redirect

## Commands

Run from this directory:

```sh
npm run dev
npm run build
npm run preview
npm start
```

## Publishing Note

`npm run dev` does not use a password. `npm start` serves the built `dist/` site with the preview password from `SITE_PASSWORD`, defaulting to `GKCello`.

The Google Cloud Run deployment uses the same password-protected server.

## Authenticated visitor visibility

Only traffic **after** a successful password login is logged. Login-page attempts and unauthenticated asset requests are not counted as visits.

Each authenticated page view and successful login writes a structured line to stdout:

```text
AUTH_VISIT {"event":"page_view","path":"/","time":"...","ip":"...","userAgent":"..."}
```

### View visits in Google Cloud

1. Open [Logs Explorer](https://console.cloud.google.com/logs/query?project=cello-www) for project `cello-www`.
2. Use this filter:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="cello-www"
textPayload=~"AUTH_VISIT"
```

3. **Email when someone logs in** — Google Cloud Monitoring sends an email to `glen@thepatricks.co.nz` on each successful preview login (rate-limited to at most one email per hour). The alert watches for `AUTH_VISIT` logs containing `login_success`.

   First-time setup (or another address):

   ```sh
   VISIT_ALERT_EMAIL=you@example.com ./scripts/setup-visit-email-alert.sh
   ```

   Google sends a **verification link** to that address; alerts do not fire until you click it.

   Alert emails include **Location** (e.g. `Auckland, New Zealand`, `Wellington, New Zealand`, or `Outside New Zealand — Sydney, Australia`). Geo is resolved from the visitor IP at login time and is approximate (ISP/network location, not GPS).

   [Alert policies](https://console.cloud.google.com/monitoring/alerting?project=cello-www) · [Notification channels](https://console.cloud.google.com/monitoring/alerting/notifications?project=cello-www)

   All authenticated page views (not just login) remain visible in Logs Explorer via the filter above.

### Login logo

The logo on the password screen is inlined in the login HTML (no extra request). `/cello-logo.svg` is also served without authentication for other uses.
