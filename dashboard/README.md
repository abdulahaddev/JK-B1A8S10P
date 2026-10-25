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

- **Live:** board and BMS link status, SOC, pack voltage, current, power with time to full/empty,
  cell spread, temperatures, the four cells on one scale with the highest/lowest marked.
- **History with comparison:** pick 1 h / 6 h / 24 h / 7 days and compare against the previous
  period, the same time yesterday or last week. The comparison is drawn as a muted line on the same
  axis, and the *Period comparison* table lists the change per metric (average and lowest SOC,
  voltage, energy in/out, worst cell spread, peak temperature).
- **Daily:** energy charged vs used per day (integrated from current), daily SOC range, and
  hour-of-day profiles of SOC and load for today vs yesterday vs the 7-day average.
- **Device:** firmware, update status, signals, memory, errors, restart history (`boots/`) and crash
  reports (`crashes/`).
- **Remote control:** install an update or restart the board (writes `control/ota` / `control/restart`,
  read by the board every 5 minutes).

Every chart has a *Table* view. Light and dark themes follow the OS until toggled.

## Security note

The database rules are currently open, and this app can write `control`. Before hosting it
publicly, add Firebase Authentication and rules so only you can write `control`.
