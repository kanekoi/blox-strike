# BLOX STRIKE — 3D Roblox-Inspired Arcade Shooter

A zero-dependency 3D WebGL2 shooter built in pure HTML, CSS, and JavaScript, inspired by Roblox hits like **Arsenal**, **RIVALS**, **Crossroads**, and **Paintball**.

## Quick Play
Double-click `index.html` in your browser (works directly from `file://` or any local HTTP server — no build step required).

For quick visual testing, append URL parameters such as `index.html?autostart=1` (1st-person match), `index.html?autostart=1&cam=3` (3rd-person shoulder cam), or `index.html?autostart=1&wskin=asiimov&inspect=1` (CS2 finish inspect).

## Features
- **Custom 3D WebGL2 Block Engine**: Procedural Roblox studs, crates, arena tiles, glossy/metallic plastic lighting, sunlit skybox with drifting blocky clouds, **pre-baked static map + prop VAO batching** (entire arena + scenery rendered in 3–4 draw calls), GL state caching, and blocky avatar shatter physics on KO.
- **10 CS2-Inspired Weapon Finishes + `[F]` Weapon Inspect**: Factory Stock, **Asiimov**, **Dragon Lore**, **Hyper Beast**, **Printstream**, **Fade**, **Case Hardened (Blue Gem)**, **Redline**, **Doppler Ruby**, and **Doppler Sapphire** — selectable in the lobby with procedural 256×256 patterns, metallic/Fresnel specular shader sheen, rarity badges, and `[F]` inspect animations.
- **Custom Multi-Part 3D Models (`js/models.js`)**:
  - **6 Detailed Mechanical Weapons** (1st-person viewmodels with reciprocating bolts/charging handles, left-hand-tracked shotgun pump action, 3D ejected brass/buckshot/rail shell casings, unobstructed panoramic ADS sights, and world-space held models): `BLOX-AR`, `STUD-12` Shotgun, `HYPER-SMG`, `RAIL-BLOX` Sniper, `BRICK-RPG` Rocket Launcher (with smoke trails & empty-tube warhead state), and `NEON BLADE`. Switch anytime via `1`–`6`, `Numpad`, `E`/`Q`, mouse wheel, or hotbar clicks; bots dynamically equip and swap across **all 6 weapons** with random CS2 finishes!
  - **Movement & Tactical Combat Juice**: Press **`[C]` / `[Ctrl]`** to **Power-Slide** (with camera roll, boot sparks, and momentum-boosting **Slide-Hops**) or **Tactical Crouch** (tighter hipfire + ducking hitbox); press **`[G]`** to lob bouncy **3D Frag Blox Grenades**; shoot red **Hazard Barrels** on all 3 maps for chain-reaction explosions!
  - **Match XP Leveling & Killstreak Bounties**: Players and AI bots alike earn XP from kills, headshots, KOTH objectives, and Bounty Shutdowns — leveling up in real time (`+Max HP`, `+Move Speed`, `+Reload Speed`, instant `+HP/+Shield` surge) while 3+ streak leaders carry golden **Wanted Bounties** visible in 3D, on radar, and on the scoreboard.
  - **9 Avatar Accessories / Hats**: Classic Hair, Cyber Visor, Backwards Cap, Gold Crown, Void Horns, Headphones, Traffic Cone, Dark Dominus, and Top Hat — selectable in the lobby alongside hierarchical avatars with shoes, belts, sleeves, chest emblems, and spawn-protection forcefields.
  - **World Scenery Props & Pickup Pads**: Trees, snow-capped pines, street lamps, hazard barrels, team flags, neon crystals, benches, rocky island undersides, and custom medkits / shield frames / lightning bolts on spawner pads.
- **4 Game Modes**: Team Blox (TDM), Free-For-All (FFA), Arsenal Ladder (Gun Game), and King of the Blox (KOTH).
- **3 Handcrafted Maps**: Crossroads Arena, Neon Paintball, and Skyblox Islands.
- **Ultra-Responsive Zero-Jitter Pipeline (`60Hz`–`360Hz`)**: Frame-synchronized sub-stepped local simulation (zero VSync beat-frequency stutter or 1-tick lag), sub-frame click & jump latching, zero-lag stair step-offset decay, dirty-checked HUD updates with zero `backdrop-filter` GPU stalls, and Quake-style air steering.
- **Hardened Security (`SECURITY.md`)**: Strict Content Security Policy (`CSP`), zero `.innerHTML` DOM sinks, `Object.create(null)` prototype-pollution guards, `NaN`/`Infinity` input sanitization, per-player flood rate limiting, entity caps, and `ws:/wss:` schema-validated packet parsing.
- **Procedural Web Audio**: Synthesized weapon fire, hitmarker ticks, headshot dings, shatter pops, explosions, and pickup chimes.

## Multiplayer-Ready Architecture
The codebase cleanly separates simulation from presentation:
- `js/config.js` + `js/sim.js`: Pure 60Hz authoritative game simulation (`GameSim`) with zero DOM or WebGL dependencies (prop colliders live in `config.js` so `sim.js` stays server-portable).
- `js/models.js`: Pure data definitions for all custom 3D weapons, accessories, props, and pickups.
- `js/net.js`: Transport abstraction (`LocalLoopbackTransport` with interpolation state today, `WebSocketTransport` template included) exchanging serializable `InputCommand` and `WorldSnapshot` payloads.
- `js/renderer.js` + `js/client.js`: Client-only input capture, snapshot interpolation, 3D WebGL2 renderer, HUD, radar minimap, and procedural audio.

## LAN Multiplayer
`server.js` runs one shared authoritative `GameSim` in Node.js and serves the game. Everyone on the same Wi-Fi joins the same match.

1. Install once (needs Node.js): `npm install`
2. Start the server: `npm start` (port 3000; use `$env:PORT=3001; npm start` in PowerShell if it's busy)
3. The server prints one URL per network adapter. Use the one from your Wi-Fi/Ethernet adapter (usually `192.168.x.x` or `10.x.x.x`; skip VirtualBox `192.168.56.1` and WSL `172.x` adapters).
4. You and your friends open that URL and press **PLAY**. On Windows, allow `node.exe` through the firewall on **Private** networks when asked.

How it works:
- The first player to join an empty server picks the map, mode, bot count and difficulty. Later players join that match.
- Each human takes a bot's slot; teams are balanced by human count.
- When a match ends, the server starts the next one after 10 seconds. Press **PLAY AGAIN** to rejoin.
- Opening `index.html` directly (or without `?lan=1`) still plays solo against bots.
