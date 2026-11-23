# BLOX STRIKE — 3D Roblox-Inspired Arcade Shooter

A zero-dependency 3D WebGL2 shooter built in pure HTML, CSS, and JavaScript, inspired by Roblox hits like **Arsenal**, **RIVALS**, **Crossroads**, and **Paintball**.

## Quick Play
Double-click `index.html` in your browser (works directly from `file://` or any local HTTP server — no build step required).

For quick visual testing, append URL parameters such as `index.html?autostart=1` (1st-person match) or `index.html?autostart=1&cam=3` (3rd-person shoulder cam).

## Features
- **Custom 3D WebGL2 Block Engine**: Procedural Roblox studs, crates, arena tiles, glossy plastic lighting, sunlit skybox with drifting blocky clouds, 60Hz snapshot interpolation for silky high-refresh displays, and blocky avatar shatter physics on KO.
- **Custom Multi-Part 3D Models (`js/models.js`)**:
  - **6 Detailed Weapons** (1st-person viewmodels with 2-hand grips, smooth ADS blending, mouse sway, and world-space held models): `BLOX-AR`, `STUD-12` Shotgun, `HYPER-SMG`, `RAIL-BLOX` Sniper, `BRICK-RPG` Rocket Launcher, and `NEON BLADE`.
  - **9 Avatar Accessories / Hats**: Classic Hair, Cyber Visor, Backwards Cap, Gold Crown, Void Horns, Headphones, Traffic Cone, Dark Dominus, and Top Hat — selectable in the lobby alongside hierarchical avatars with shoes, belts, sleeves, chest emblems, and spawn-protection forcefields.
  - **World Scenery Props & Pickup Pads**: Trees, snow-capped pines, street lamps, hazard barrels, team flags, neon crystals, benches, rocky island undersides, and custom medkits / shield frames / lightning bolts on spawner pads.
- **4 Game Modes**: Team Blox (TDM), Free-For-All (FFA), Arsenal Ladder (Gun Game), and King of the Blox (KOTH).
- **3 Handcrafted Maps**: Crossroads Arena, Neon Paintball, and Skyblox Islands.
- **Tuned FPS Movement & Camera**: Snappy ground acceleration/friction, momentum-preserving Quake-style air steering, coyote time, jump buffering, stair step-up smoothing and step-down ground snap, recovering recoil offsets, hardened pointer-lock handling, and 3rd-person crosshair convergence (`V`).
- **Procedural Web Audio**: Synthesized weapon fire, hitmarker ticks, headshot dings, shatter pops, explosions, and pickup chimes.

## Multiplayer-Ready Architecture
The codebase cleanly separates simulation from presentation:
- `js/config.js` + `js/sim.js`: Pure 60Hz authoritative game simulation (`GameSim`) with zero DOM or WebGL dependencies (prop colliders live in `config.js` so `sim.js` stays server-portable).
- `js/models.js`: Pure data definitions for all custom 3D weapons, accessories, props, and pickups.
- `js/net.js`: Transport abstraction (`LocalLoopbackTransport` with interpolation state today, `WebSocketTransport` template included) exchanging serializable `InputCommand` and `WorldSnapshot` payloads.
- `js/renderer.js` + `js/client.js`: Client-only input capture, snapshot interpolation, 3D WebGL2 renderer, HUD, radar minimap, and procedural audio.

To take it online later, run `js/config.js` and `js/sim.js` in a Node.js WebSocket server (`ws` / PartyKit / Colyseus) and swap `LocalLoopbackTransport` for `WebSocketTransport` in `js/client.js`.
