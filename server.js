// Blox Strike LAN server: serves the game files and runs ONE shared authoritative GameSim
// that every browser on the network joins over WebSocket.
// Usage: npm install, then npm start, then friends open http://<your-LAN-IP>:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

// The game scripts are browser IIFEs that attach to `window`; alias it so they load unchanged in Node.
globalThis.window = globalThis;
require('./js/config.js');
require('./js/models.js');
require('./js/sim.js');
const BS = globalThis.BloxStrike;

const PORT = Number(process.env.PORT) || 3000;
const MAX_HUMANS = 12;
const RESTART_DELAY_MS = 10000;
const ROOT = __dirname;

// --- Static file server (whitelist only: no path traversal possible) ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function resolveStatic(urlPath) {
  if (urlPath === '/index.html' || urlPath === '/styles.css') return path.join(ROOT, urlPath);
  const m = /^\/js\/([a-z0-9_-]+\.js)$/.exec(urlPath);
  return m ? path.join(ROOT, 'js', m[1]) : null;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = new URL(req.url, 'http://x').pathname;
  } catch {
    res.writeHead(400).end();
    return;
  }
  // Root opens the game already in LAN mode, so friends only need the IP.
  if (urlPath === '/') {
    res.writeHead(302, { Location: '/index.html?lan=1' }).end();
    return;
  }
  const file = resolveStatic(urlPath);
  if (!file || req.method !== 'GET') {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// --- Shared match ---
const sim = new BS.GameSim();
const clients = new Map(); // ws -> { id, opts }
let matchOpts = null; // set by whoever joins an empty server
let nextId = 1;
let restartTimer = null;
let lobbySize = 0;

function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function cleanName(raw) {
  return str(raw, 32).replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'BloxPlayer';
}

function removePlayer(id) {
  const i = sim.players.findIndex((p) => p.id === id);
  if (i >= 0) sim.players.splice(i, 1);
  delete sim.playerMap[id];
  // Their rockets/grenades in flight would land ownerless (no team check = friendly fire): remove them too.
  sim.projectiles = sim.projectiles.filter((pr) => pr.ownerId !== id);
}

function addHuman(c) {
  let team = 'ffa';
  if (sim.mode.teams) {
    const humans = (t) => sim.players.filter((p) => !p.isBot && p.team === t).length;
    team = humans('blue') <= humans('red') ? 'blue' : 'red';
  }
  const o = c.opts;
  const skin = BS.SKINS.find((s) => s.id === o.skinId) || BS.SKINS[0];
  const accIds = BS.ACCESSORY_IDS || [];
  const acc = accIds.includes(o.accessoryId) ? o.accessoryId : skin.accessory || 'hair_classic';
  const wskin = BS.WEAPON_SKIN_BY_ID && BS.WEAPON_SKIN_BY_ID[o.weaponSkinId] ? o.weaponSkinId : 'default';
  const p = sim._createPlayer(c.id, cleanName(o.playerName), team, false, skin, acc, wskin);
  sim._addPlayer(p);
  sim._spawnPlayer(p, sim.players.length);

  // Humans take bot slots: keep the lobby at its solo size, trimming a bot from the bigger team.
  if (sim.players.length > lobbySize) {
    const count = (t) => sim.players.filter((q) => q.team === t).length;
    const trimTeam = !sim.mode.teams ? null : count('blue') > count('red') ? 'blue' : count('red') > count('blue') ? 'red' : team;
    const bot = sim.players.find((q) => q.isBot && (!trimTeam || q.team === trimTeam));
    if (bot) removePlayer(bot.id);
  }
}

// A human left: put a bot back on the smaller team so the lobby stays at its size.
function refillBot() {
  if (sim.players.length >= lobbySize) return;
  const count = (t) => sim.players.filter((q) => q.team === t).length;
  const team = !sim.mode.teams ? 'ffa' : count('blue') <= count('red') ? 'blue' : 'red';
  const used = new Set(sim.players.map((q) => q.name));
  const name = BS.BOT_NAMES.find((n) => !used.has(n)) || 'BloxBot';
  const skin = BS.SKINS[Math.floor(Math.random() * BS.SKINS.length)];
  const bot = sim._createPlayer('bot_r' + nextId++, name, team, true, skin, skin.accessory || 'hair_classic', 'default');
  sim._addPlayer(bot);
  sim._spawnPlayer(bot, sim.players.length);
}

function startMatch() {
  // demoMode makes the sim's built-in local slot a bot; we drop it and add the real humans instead.
  sim.startMatch({ ...matchOpts, demoMode: true });
  lobbySize = sim.players.length; // 1 local slot + bots, same as solo
  removePlayer(sim.localPlayerId);
  for (const c of clients.values()) addHuman(c);
  console.log(`Match started: map=${sim.map.id} mode=${sim.mode.id} humans=${clients.size}`);
}

function broadcast(text) {
  for (const ws of clients.keys()) {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
}

// --- WebSocket ---
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  let client = null;
  // Without this, one bad socket (reset, oversized frame) emits an unhandled 'error' and kills the match for everyone.
  ws.on('error', (err) => console.warn('Socket error:', err.message));

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try {
      msg = JSON.parse(data.toString(), (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'join' && !client) {
      if (clients.size >= MAX_HUMANS) {
        ws.close(1013, 'Server full');
        return;
      }
      const o = msg.options && typeof msg.options === 'object' ? msg.options : {};
      client = {
        id: 'h_' + nextId++,
        opts: {
          playerName: str(o.playerName, 32),
          skinId: str(o.skinId, 32),
          accessoryId: str(o.accessoryId, 32),
          weaponSkinId: str(o.weaponSkinId, 32),
        },
      };
      clients.set(ws, client);
      if (!matchOpts) {
        // First player in picks map/mode/bots/difficulty.
        matchOpts = {
          mapId: str(o.mapId, 32),
          modeId: str(o.modeId, 32),
          botCount: Number.isFinite(o.botCount) ? o.botCount : 7,
          difficulty: str(o.difficulty, 8),
        };
        startMatch();
      } else if (sim.matchOver) {
        // Joining a finished match (e.g. PLAY AGAIN): start the next one now instead of bouncing to results.
        clearTimeout(restartTimer);
        restartTimer = null;
        startMatch();
      } else {
        addHuman(client);
      }
      ws.send(JSON.stringify({ type: 'welcome', playerId: client.id, mapId: sim.map.id, modeId: sim.mode.id }));
      console.log(`${client.opts.playerName || 'BloxPlayer'} joined from ${req.socket.remoteAddress} (${clients.size} online)`);
    } else if (msg.type === 'input' && client) {
      sim.setPlayerInput(client.id, msg.payload); // sim validates + rate-limits every field
    }
  });

  ws.on('close', () => {
    if (!client) return;
    clients.delete(ws);
    removePlayer(client.id);
    if (clients.size > 0) refillBot(); // keep teams even when humans leave mid-match
    console.log(`${client.opts.playerName || 'BloxPlayer'} left (${clients.size} online)`);
    if (clients.size === 0) {
      // Empty server: next player to join starts a fresh match with their own settings.
      matchOpts = null;
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  });
});

// --- Fixed-rate simulation loop ---
let last = process.hrtime.bigint();
let acc = 0;
setInterval(() => {
  const now = process.hrtime.bigint();
  acc = Math.min(acc + Number(now - last) / 1e9, 0.25);
  last = now;
  if (!matchOpts) {
    acc = 0;
    return;
  }
  const events = [];
  while (acc >= BS.FIXED_DT) {
    const ev = sim.step(BS.FIXED_DT);
    if (ev && ev.length) events.push(...ev);
    acc -= BS.FIXED_DT;
  }
  for (const ev of events) broadcast(JSON.stringify({ type: 'event', payload: ev }));
  broadcast(JSON.stringify({ type: 'snapshot', payload: sim.getSnapshot() }));

  if (sim.matchOver && !restartTimer) {
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (matchOpts) startMatch();
    }, RESTART_DELAY_MS);
  }
}, 1000 / BS.TICK_RATE);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    console.error(`Port ${PORT} is busy. Close the other program or pick another port:  $env:PORT=3001; npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Blox Strike LAN server running on port ${PORT}. Friends open:`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}`);
    }
  }
});
