# Changelog

All major updates to **BLOX STRIKE** are committed and tagged in Git.

## v1.0.0 — Initial Tracked Release
- **Custom 3D WebGL2 Block Engine** (`js/renderer.js`): Procedural Roblox stud, crate, tile, and smiley-face textures; sunlit plastic shading; drifting blocky clouds; shatter death physics; tracers; explosions; spawn-protection forcefields.
- **Custom Multi-Part 3D Model Library** (`js/models.js`):
  - 6 detailed weapons (`BLOX-AR`, `STUD-12`, `HYPER-SMG`, `RAIL-BLOX`, `BRICK-RPG`, `NEON BLADE`) rendered in both 1st-person 2-hand viewmodels and 3rd-person world hands.
  - 9 selectable avatar accessories/hats (`Classic Hair`, `Cyber Visor`, `Backwards Cap`, `Gold Crown`, `Void Horns`, `Headphones`, `Traffic Cone`, `Dark Dominus`, `Top Hat`).
  - Articulated blocky avatars with shoes, belts, sleeves, and chest emblems.
  - World scenery props (trees, pines, lamps, barrels, team flags, neon crystals, benches, island undersides) and custom pickup models on spawner pads.
- **Camera & Movement Polish** (`js/sim.js`, `js/net.js`, `js/client.js`):
  - Recovering recoil offsets, monotonic `walkPhase` + damped `walkAmp`, 60Hz snapshot interpolation, smoothed stair step-ups, smooth angular shake, hardened pointer lock & pause/resume flow, and 3rd-person crosshair convergence (`V`).
  - Exponential ground accel/friction, momentum-preserving Quake-style air steering, coyote time, jump buffering, downward ground snap, and input latching.
- **4 Game Modes & 3 Maps** (`js/config.js`): Team Blox (TDM), Free-For-All (FFA), Arsenal Ladder (Gun Game), and King of the Blox (KOTH) across Crossroads Arena, Neon Paintball, and Skyblox Islands.
- **Multiplayer-Ready Architecture**: Server-portable `GameSim` + `LocalLoopbackTransport` / `WebSocketTransport` abstraction.
