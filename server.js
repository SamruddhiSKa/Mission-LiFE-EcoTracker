'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const databaseFile = path.resolve(process.env.ECO_DB_FILE || path.join(__dirname, 'data', 'db.json'));

const ACTIONS = Object.freeze({
  bike: Object.freeze({ name: 'Rode bicycle / public transit', co2: 2.5, water: 0, points: 25 }),
  bag: Object.freeze({ name: 'Used cloth bag instead of plastic', co2: 0.5, water: 2, points: 10 }),
  lights: Object.freeze({ name: 'Switched to LED / turned off appliances', co2: 1.2, water: 0, points: 15 }),
  compost: Object.freeze({ name: 'Composted kitchen waste', co2: 1, water: 5, points: 20 }),
  carpool: Object.freeze({ name: 'Carpooled to work', co2: 1.5, water: 0, points: 18 }),
  no_meat_meal: Object.freeze({ name: 'Had a plant-based meal', co2: 2, water: 15, points: 22 }),
  reusable_bottle: Object.freeze({ name: 'Used a reusable water bottle', co2: 0.4, water: 1, points: 8 }),
  line_dry: Object.freeze({ name: 'Line-dried clothes (no dryer)', co2: 1.1, water: 0, points: 14 })
});

const SEEDED_LEADERS = [
  { id: 'priya-sharma', name: 'Priya Sharma', neighborhood: 'Koregaon Park', co2Saved: 18.5, points: 1240 },
  { id: 'amit-desai', name: 'Amit Desai', neighborhood: 'Baner', co2Saved: 16.2, points: 1105 },
  { id: 'sneha-kulkarni', name: 'Sneha Kulkarni', neighborhood: 'Viman Nagar', co2Saved: 14.8, points: 980 },
  { id: 'ravi-kumar', name: 'Ravi Kumar', neighborhood: 'Kothrud', co2Saved: 0, points: 0, isCurrentUser: true },
  { id: 'deepa-nair', name: 'Deepa Nair', neighborhood: 'Hinjewadi', co2Saved: 11.9, points: 760 }
];

function initializeDatabase() {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  if (!fs.existsSync(databaseFile)) {
    writeDatabase({ eco_logs: [], leaderboard: SEEDED_LEADERS });
  }

  const database = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  if (!database || !Array.isArray(database.eco_logs) || !Array.isArray(database.leaderboard)) {
    throw new Error(`Invalid database file: ${databaseFile}`);
  }
  if (!database.leaderboard.some((entry) => entry.isCurrentUser)) {
    throw new Error(`Database must contain a current-user leaderboard entry: ${databaseFile}`);
  }

  return database;
}

function writeDatabase(database) {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const temporaryFile = `${databaseFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, databaseFile);
}

function getTotals(logs, now = new Date()) {
  const dates = [...new Set(logs.map((log) => log.createdAt.slice(0, 10)))].sort().reverse();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let streakDays = 0;

  if (dates.length && (dates[0] === today || dates[0] === yesterday)) {
    let expectedDate = dates[0];
    for (const date of dates) {
      if (date !== expectedDate) break;
      streakDays += 1;
      expectedDate = new Date(`${expectedDate}T00:00:00.000Z`);
      expectedDate.setUTCDate(expectedDate.getUTCDate() - 1);
      expectedDate = expectedDate.toISOString().slice(0, 10);
    }
  }

  return {
    co2Saved: Number(logs.reduce((sum, log) => sum + log.co2Saved, 0).toFixed(1)),
    waterSaved: logs.reduce((sum, log) => sum + log.waterSaved, 0),
    points: logs.reduce((sum, log) => sum + log.points, 0),
    streakDays
  };
}

function getTodayActionIds(logs, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return [...new Set(logs.filter((log) => log.createdAt.slice(0, 10) === today).map((log) => log.actionId))];
}

function getLeaderboard(database) {
  return [...database.leaderboard]
    .sort((left, right) => right.co2Saved - left.co2Saved || right.points - left.points || left.name.localeCompare(right.name))
    .map(({ id, name, neighborhood, co2Saved, points, isCurrentUser = false }, index) => ({
      id,
      name,
      neighborhood,
      co2Saved,
      points,
      rank: index + 1,
      isCurrentUser
    }));
}

app.use(cors({
  origin(origin, callback) {
    const isLocalOrigin = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    callback(null, isLocalOrigin);
  }
}));
app.use(express.json({ limit: '10kb' }));
app.get(['/', '/index.html'], (_request, response) => {
  response.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/logs', (_request, response) => {
  const database = initializeDatabase();
  const logs = [...database.eco_logs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  response.json({
    logs,
    totals: getTotals(database.eco_logs),
    todayActionIds: getTodayActionIds(database.eco_logs)
  });
});

app.get('/api/stats/weekly', (_request, response) => {
  const database = initializeDatabase();
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(todayUtc);
  start.setUTCDate(start.getUTCDate() - 6);

  const co2ByDate = new Map();
  for (const log of database.eco_logs) {
    const date = log.createdAt.slice(0, 10);
    co2ByDate.set(date, (co2ByDate.get(date) || 0) + log.co2Saved);
  }

  const weekly = Array.from({ length: 7 }, (_value, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      date: isoDate,
      label: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      co2: Number((co2ByDate.get(isoDate) || 0).toFixed(1))
    };
  });

  response.json({
    weekly,
    total_7day: Number(weekly.reduce((sum, day) => sum + day.co2, 0).toFixed(1))
  });
});

app.post('/api/logs', (request, response) => {
  const { actionId, impact, timestamp } = request.body || {};
  const action = ACTIONS[actionId];

  if (!action) {
    return response.status(400).json({ error: 'Unknown eco-action ID.' });
  }

  if (
    !impact
    || impact.co2 !== action.co2
    || impact.water !== action.water
    || impact.points !== action.points
  ) {
    return response.status(400).json({ error: 'Action impact does not match the supported action.' });
  }

  const requestedTimestamp = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(requestedTimestamp) || Math.abs(Date.now() - requestedTimestamp) > 5 * 60 * 1000) {
    return response.status(400).json({ error: 'Timestamp must be a valid time within five minutes of server time.' });
  }

  const database = initializeDatabase();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const alreadyLoggedToday = database.eco_logs.some(
    (log) => log.actionId === actionId && log.createdAt.slice(0, 10) === today
  );
  if (alreadyLoggedToday) {
    return response.status(409).json({
      error: 'This action has already been logged today.',
      code: 'already_logged_today',
      message: 'You have already logged this action today.'
    });
  }

  const log = {
    id: randomUUID(),
    actionId,
    actionName: action.name,
    co2Saved: action.co2,
    waterSaved: action.water,
    points: action.points,
    createdAt: now.toISOString()
  };
  database.eco_logs.push(log);

  const currentUser = database.leaderboard.find((entry) => entry.isCurrentUser);
  currentUser.co2Saved = Number((currentUser.co2Saved + action.co2).toFixed(1));
  currentUser.points += action.points;
  writeDatabase(database);

  response.status(201).json({
    log,
    logs: [...database.eco_logs].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    totals: getTotals(database.eco_logs, now),
    todayActionIds: getTodayActionIds(database.eco_logs, now),
    leaderboard: getLeaderboard(database),
    communityCo2Saved: Number(database.leaderboard.reduce((sum, entry) => sum + entry.co2Saved, 0).toFixed(1))
  });
});

app.get('/api/leaderboard', (_request, response) => {
  const database = initializeDatabase();
  const leaderboard = getLeaderboard(database);
  response.json({
    leaderboard,
    communityCo2Saved: Number(leaderboard.reduce((sum, entry) => sum + entry.co2Saved, 0).toFixed(1))
  });
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API endpoint not found.' });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  response.status(status).json({
    error: status === 400 ? 'Invalid request body.' : 'The server could not complete the request.'
  });
});

if (require.main === module) {
  initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Mission LiFE EcoTracker running at http://localhost:${PORT}`);
    console.log(`Persistent JSON database: ${databaseFile}`);
  });
}

module.exports = { app, initializeDatabase, databaseFile };
