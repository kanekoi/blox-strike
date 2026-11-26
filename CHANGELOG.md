# Changelog

All major updates to **BLOX STRIKE** are committed and tagged in Git.

## v1.2.0 — Movement & Combat Juice (Crouch-Slide, Frag Grenades, Explosive Barrels & Mechanical Gun FX)
- **Crouch-Slide `[C]` & Slide-Hopping** (`js/config.js`, `js/sim.js`, `js/renderer.js`, `js/client.js`, `js/audio.js`):
  - Hold **`[C]`** (or **`[Ctrl]`**) while moving (or landing from a jump/pad!) to initiate a momentum-boosting **Power Slide** with 1st-person Dutch-angle camera roll, FOV kick, inward tactical weapon tilt, sliding boot sparks, and full 3D avatar slide poses.
  - Press **`[Space]`** mid-slide to chain into a momentum-preserving **Slide-Hop**, or hold `[C]` while stationary for a low-profile **Tactical Crouch** (lowered hitbox + 35% tighter hipfire spread + ceiling headroom check before standing).
- **Tactical Frag Blox Grenades `[G]`** (`js/config.js`, `js/models.js`, `js/sim.js`, `js/renderer.js`, `js/client.js`, `index.html`, `styles.css`):
  - Press **`[G]`** anytime off cooldown (`7s`, live HUD bar) to throw a tumbling 3D Frag Blox Grenade with realistic gravity, 3-axis wall/floor bouncing, metallic bounce clinks, direct enemy impact detonation, red fuse spark trails, nearby danger `!` warning indicators, and bot AI usage.
- **Shootable & Chain-Reacting Explosive Barrels** (`js/config.js`, `js/sim.js`, `js/renderer.js`, `js/client.js`):
  - All red hazard barrels across **Crossroads Arena**, **Neon Paintball** (including twin flank chain-reaction pairs!), and **Skyblox Islands** are now dynamically shootable, flash/shake when damaged or fusing, chain-detonate nearby barrels, award full kill/XP/bounty credit (`[BARREL]`), leave scorched blast marks, and safely respawn after `14s`.
- **Animated Mechanical Gun Parts, 3D Ejected Shell Casings & Trails** (`js/models.js`, `js/renderer.js`, `js/client.js`):
  - Added reciprocating bolts & charging handles on `BLOX-AR`, `HYPER-SMG`, and `RAIL-BLOX`, a sliding shotgun pump tracked in real time by your 1st-person left hand on `STUD-12`, pulsing rail coils, disappearing RPG warheads while empty/reloading, physical bouncing 3D brass/buckshot/rail shell casings, and continuous blocky rocket exhaust smoke trails.

## v1.1.0 — CS2 Weapon Finishes, XP Levels & Bounties, Clean Sights, Security & Zero-Jitter Responsiveness
- **Match XP Leveling & Killstreak Bounties (`LVL 1`–`25`)** (`js/config.js`, `js/sim.js`, `js/client.js`, `js/renderer.js`, `index.html`, `styles.css`):
  - Both human players and AI bots earn XP from eliminations (`+60 XP`), headshots (`+25 XP`), KOTH zone control (`+8 XP/s`), and **Bounty Shutdowns** (`+90` to `+350 XP`).
  - Leveling up triggers an instant combat surge (`+25 HP` & `+20 Shield`) plus passive scaling per level (`+4 Max HP`, `+1.4%` movement speed, and `+3%` faster reloads up to Lv.10).
  - Any player or bot reaching a `3+` KO streak gets an escalating **Wanted Bounty** (`★ BOUNTY +90..350 XP`) shown on 3D overhead tags, golden shoulder aura trim, radar target rings, HUD pills, and the scoreboard; eliminating them claims the full bounty XP and bonus match score.
- **Bulletproof Weapon Switching & Wide-Open ADS Sights** (`js/client.js`, `js/sim.js`, `js/models.js`, `js/renderer.js`, `styles.css`):
  - Persistent `desiredWeaponSlot` handshake supporting `1`–`6`, `Numpad 1`–`6`, `E` (next), `Q` (last), debounced mouse wheel, clickable hotbar slots, and weapon selection while respawning.
  - Redesigned all 1st-person weapon sights into open panoramic micro-frames, lowered hip/ADS viewmodel offsets, stabilized upward ADS recoil kick, and widened the Railgun Sniper scope so sights never block the crosshair.
- **Ultra-Responsive Zero-Jitter Frame Pipeline** (`js/net.js`, `js/client.js`, `js/sim.js`, `js/renderer.js`, `styles.css`):
  - **Frame-synchronized sub-stepped simulation**: Eliminated 60Hz VSync beat-frequency micro-stutter and 16.7ms interpolation lag in local play while maintaining exact framerate-independent physics across `60Hz`, `144Hz`, `240Hz`, and `360Hz` displays.
  - **Sub-frame click & jump latching + `O(1)` mouse handling**: Quick mouse taps and `Space` presses between frames never drop; replaced `1/dt` mouse sway velocity division with a critically-damped impulse filter and true stair `stepOffsetY` decay.
  - **WebGL2 static map VAO batching & GL state caching**: Pre-baked static arena blocks, multi-part scenery props, and pad bases into 3–4 static VAO draw calls per map (cutting ~350 draw calls/frame) and cached uniform/texture binds.
  - **Zero-stall HUD compositing**: Removed live `#hud` `backdrop-filter: blur()` passes that forced GPU framebuffer readbacks every frame, cached HUD DOM references, and added dirty-value checks so unchanged HUD nodes are never mutated.
- **10 CS2-Inspired Weapon Skins + `[F]` Inspect** (`js/config.js`, `js/renderer.js`, `js/client.js`, `index.html`, `styles.css`):
  - Added Factory Stock, **Asiimov**, **Dragon Lore**, **Hyper Beast**, **Printstream**, **Fade**, **Case Hardened (Blue Gem)**, **Redline**, **Doppler Ruby**, and **Doppler Sapphire** with procedural 256×256 textures, `uMetallic` specular/Fresnel shader sheen, rarity-colored lobby chips & HUD badges, and `[F]` CS2-style Weapon Inspect animation.
- **Dynamic All-Weapon Bot AI** (`js/sim.js`):
  - Bots now spawn with and dynamically switch across all 6 weapons (`BLOX-AR`, `STUD-12`, `HYPER-SMG`, `RAIL-BLOX`, `BRICK-RPG`, `NEON BLADE`) based on engagement range, reload pressure, and close-range RPG splash safety, while rocking random CS2 weapon skins.
- **Security & Anti-DoS Hardening** (`index.html`, `js/client.js`, `js/sim.js`, `js/net.js`, `SECURITY.md`):
  - Added strict Content Security Policy (`CSP`), eliminated all `.innerHTML` sinks, hardened `localStorage` & `WebSocketTransport` packet parsing against prototype pollution and oversized payloads (`64KB` cap, `ws:/wss:` allowlist), and added authoritative input sanitization, entity caps, and per-player flood rate limiting (`360/s`).

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
