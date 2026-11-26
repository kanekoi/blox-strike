# Security Architecture & Hardening — BLOX STRIKE

BLOX STRIKE is designed so the client cannot tamper with authoritative match rules, inject HTML/JS, crash the simulation with malformed packets, or easily DoS a future online multiplayer server.

## Hardening Implemented in Code

### 1. Strict Client-Side XSS & Injection Defense
- **Content Security Policy (CSP)** in `index.html`: `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `connect-src 'self' ws: wss:`, plus `referrer: no-referrer`. Blocks all inline scripts, `eval()`, plugin objects, and unauthorized network targets.
- **Zero `innerHTML` sinks in `js/client.js`**: All dynamic UI (killfeed, scoreboard, weapon hotbar, lobby selectors, error screen) uses `document.createElement` + `textContent`.
- **Validated `localStorage` loading**: `_loadSettings()` enforces a 4KB size limit, strips `__proto__` / `constructor` / `prototype` keys during `JSON.parse`, validates every ID against config whitelists, clamps numeric settings, and strips HTML/control characters from player names.

### 2. Authoritative Anti-Cheat & Anti-DoS Simulation (`js/sim.js`)
- **Zero-prototype dictionaries (`Object.create(null)`)**: `playerMap`, `ammo`, `dmgAccum`, `WEAPON_BY_ID`, and `WEAPON_SKIN_BY_ID` use null-prototype objects + `Object.hasOwn` guards so crafted keys like `"__proto__"` or `"toString"` cannot poison lookups or crash ticks.
- **Strict input validation**: `setPlayerInput()` rejects non-object inputs, clamps `moveX`/`moveZ`/`pitch`, neutralizes `NaN`/`Infinity`/huge-exponent floats (`1e300`), and whitelists integer `weaponSlot` (`1..6`).
- **Per-player input flood rate limiter**: Drops excess input packets above `BS.SECURITY.MAX_INPUTS_PER_SEC` (`360/s`) per player per 1-second window — supporting ultra-high-refresh monitors (`144Hz`–`360Hz`) with zero false drops while stopping packet-spam floods.
- **Server-authoritative combat & entity caps**: Clients only send intents (movement, aim, fire, dash, reload, slot). Hit detection, cooldowns, ammo, splash damage, speed, and spawn protection are computed exclusively inside `GameSim`. Bot count is capped at `11` and active projectiles are hard-capped at `48`.
- **Authoritative name sanitization**: `sanitizeName()` runs inside `GameSim.startMatch()` as well as the client.

### 3. Hardened Network Transport (`js/net.js`)
- **Protocol allowlist**: `WebSocketTransport` only allows `ws://` and `wss://` URLs.
- **Safe packet parser**: Enforces `MAX_PACKET_BYTES` (`64 KB`), catches malformed JSON, strips prototype-pollution keys, and validates packet schema before invoking callbacks.
- **Outgoing rate limit & sanitizer**: `sendInput()` strips extra fields, sanitizes finite numbers, and caps continuous update frequency (~65Hz).

## Production Checklist (When Hosting Public Multiplayer Online)
When you later run `js/config.js` + `js/sim.js` inside a public Node.js WebSocket server:
1. **TLS & Reverse Proxy**: Put the server behind Cloudflare / Caddy / Nginx with `wss://`, HTTP/DDoS protection, and per-IP connection + handshake rate limits.
2. **WebSocket `maxPayload`**: Set `new WebSocketServer({ maxPayload: 16 * 1024 })` so oversized frames are dropped at the socket layer before reaching JS.
3. **Origin & Room Caps**: Validate the HTTP `Origin` header on upgrade, cap players per room (e.g., 12) and total rooms per process, and run each match's `GameSim` in isolated error-guarded ticks so one room cannot stall others.
4. **Drop Idle / Flooding Sockets**: Disconnect clients that repeatedly trip `sim.droppedInputs` or fail heartbeat pings.
