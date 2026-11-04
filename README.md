# Mission LiFE EcoTracker

A lightweight full-stack eco-action tracker. Express serves the single-page frontend and JSON API; the API stores logs and leaderboard records in a persistent local JSON file. No in-memory or third-party mock API is used.

## Run locally

Requires Node.js 18 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Do not open `index.html` directly: the page fetches its data from the Express API. The database is created on first start at `data/db.json`; set `PORT` or `ECO_DB_FILE` to change the server port or database path.

## Deploy to Render or Railway

- Use `npm install` as the build/install command and `npm start` as the start command. Node.js 18 or newer is required.
- The server listens on `process.env.PORT` when provided by the host, falling back to port 3000 for local development.
- Attach a persistent disk/volume to the service and set `ECO_DB_FILE` to a file on that mounted volume. For example, use `/var/data/db.json` when the Render disk is mounted at `/var/data`, or `/app/data/db.json` when a Railway volume is mounted at `/app/data`.
- Keep this JSON-file demo to one running service instance. The host's default application filesystem may be ephemeral; without a persistent volume, database changes can be lost when the service restarts or is redeployed. For multi-instance production deployments, move persistence to a managed database.
- `data/.gitkeep` retains the local data directory in Git; generated JSON databases and temporary write files are ignored.

## Architecture and data

- `server.js` serves `index.html`, validates and handles API requests, and persists each database update using a temporary file followed by an atomic rename.
- `index.html` loads logs and leaderboard data with `fetch()` and sends logged actions to the API.
- `data/db.json` is initialized on first run with two collections:
  - `eco_logs`: append-only action records (`id`, `actionId`, `actionName`, `co2Saved`, `waterSaved`, `points`, `createdAt`).
  - `leaderboard`: five initial Pune community entries (`id`, `name`, `neighborhood`, `co2Saved`, `points`, and optional `isCurrentUser`). The four community profiles are startup seed data; Ravi Kumar's values start at zero and are updated by actual saved actions.
- Dashboard totals and consecutive-day streaks are derived from persisted logs. The community total is calculated from leaderboard records.
- Action impacts are defined by the server, checked against the request, and never trusted from the browser. Each action can be logged once per UTC day. The server records its own timestamp after validating the submitted timestamp.
- The dashboard includes an interactive Chart.js graph of the last seven UTC days. Daily values are grouped from persisted action logs, including zero-log days.
- The action catalogue includes bicycle/transit, cloth bag, appliance/LED, composting, carpooling, plant-based meals, reusable bottles, and line-drying clothes.

## API

### `GET /api/logs`

Returns all saved action records, aggregate metrics, and the action IDs already logged today:

```json
{
  "logs": [],
  "totals": { "co2Saved": 0, "waterSaved": 0, "points": 0, "streakDays": 0 },
  "todayActionIds": []
}
```

### `POST /api/logs`

Request body:

```json
{
  "actionId": "bike",
  "impact": { "co2": 2.5, "water": 0, "points": 25 },
  "timestamp": "2026-11-04T11:30:00.000Z"
}
```

Returns HTTP `201` with the saved `log`, updated `logs`, `totals`, `todayActionIds`, and `leaderboard`. Unknown actions or mismatched impact values return `400`; attempting to repeat an action on the same UTC day returns `409`.

### `GET /api/leaderboard`

Returns the current sorted `leaderboard` and `communityCo2Saved` total.

### `GET /api/stats/weekly`

Returns seven oldest-to-newest daily CO₂ totals, including days with no logs, plus their sum:

```json
{
  "weekly": [
    { "date": "2026-10-29", "label": "Thu", "co2": 0.0 }
  ],
  "total_7day": 0.0
}
```

The `weekly` array always contains seven entries; the example shows one entry for brevity.

> This hackathon demo persists data locally and has no authentication or external community sync. Do not expose it publicly with untrusted users without adding identity, access controls, and a production database.
