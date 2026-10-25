# JK-BMS dashboard

React + Vite single-page app over the Firebase Realtime Database the board writes to
(`device`, `telemetry`, `info`, `energy`, `boots`, `crashes`, `control`).

## Run

```bash
npm install
cp .env.example .env.local   # fill in the same values as ../secrets.yaml
npm run dev                  # http://localhost:5173
```

`npm run build` writes a static site to `dist/` (deployable to Firebase Hosting or any static host).

## What it shows

Four pages, in a sidebar on desktop and a bottom bar on phones (`#overview`, `#analytics`, `#energy`, `#device`):

- **Overview:** SOC ring with charging state, power and time to full/empty; KPI cards (voltage,
  current, cell spread, temperature) with 6-hour sparklines; a 24-hour trend with a metric switch;
  the four cells with their offset from the average; today's energy in/out, SOC range and peak load.
- **Analytics:** pick 1H / 6H / 24H / 7D. Each chart has its own *Compare* picker (previous period,
  yesterday or last week, remembered per chart). The comparison is drawn as a dashed line, and the
  chart shows min / avg / max plus the change in average. The *Period comparison* table has its own
  picker and lists the change per metric.
- **Energy:** 7-day totals, energy charged vs used per day, each day's SOC range, and hour-of-day
  SOC and load for today and yesterday against the 7-day average.
- **Device:** board, connectivity, memory and BMS details, restart history (`boots/`) and crash
  reports (`crashes/`).
- **Remote control** (button at the top right of every page) opens a dialog after the control password (sample
  `987654321`, remembered 10 min per tab): pick a firmware from the OTA site, restart the board,
  and follow sent commands and board reports in the console. Writes `control/ota` /
  `control/restart`, read by the board every 5 minutes.

The firmware list comes from the OTA site's file index and is kept in the browser (localStorage).
The hosting has bot protection, so the site is read only on the first unlock when nothing is stored,
and after that only when you press **Sync** (at most once a minute). The site sends no CORS headers, so the dev and preview servers proxy `/ota-site` and add
the login from `../secrets.yaml`. A static build hosted elsewhere needs an equivalent proxy.

Every chart has a table view. Light and dark themes follow the OS until toggled.

## Security note

The database rules are currently open, and this app can write `control`. Before hosting it
publicly, add Firebase Authentication and rules so only you can write `control`.
