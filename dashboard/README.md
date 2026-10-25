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
- **Device:** board, connectivity, memory and BMS details, restart history (`boots/`), crash
  reports (`crashes/`) and remote control (writes `control/ota` / `control/restart`, read by the
  board every 5 minutes).

Every chart has a table view. Light and dark themes follow the OS until toggled.

## Security note

The database rules are currently open, and this app can write `control`. Before hosting it
publicly, add Firebase Authentication and rules so only you can write `control`.
