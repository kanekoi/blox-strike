// Headless regression checks for GameSim. Run: npm test
const assert = require('assert');
const path = require('path');
globalThis.window = globalThis;
for (const f of ['config', 'models', 'sim']) require(path.join(__dirname, '..', 'js', f + '.js'));
const BS = globalThis.BloxStrike;
const DT = BS.FIXED_DT;

const newSim = (opts = {}) => {
  const sim = new BS.GameSim();
  sim.startMatch({ botCount: 0, modeId: 'ffa', ...opts });
  return sim;
};
const addPlayer = (sim, id, team = 'ffa') => {
  const p = sim._createPlayer(id, id, team, false, BS.SKINS[0], 'hair_classic', 'default');
  sim._addPlayer(p);
  return p;
};
const shots = (ev, id) => (ev || []).filter((e) => e.type === 'shoot' && e.shooterId === id).length;
const input = (extra) => ({ moveX: 0, moveZ: 0, yaw: 0, pitch: 0, weaponSlot: null, ...extra });

const tests = {
  'no spawn point overlaps solid blocks'() {
    const R = BS.PLAYER.RADIUS, H = BS.PLAYER.HEIGHT;
    for (const m of Object.values(BS.MAPS)) {
      const sim = newSim({ mapId: m.id });
      for (const team of ['blue', 'red', 'ffa']) {
        (m.spawns[team] || []).forEach((s, i) => {
          const bad = sim.blocks.some((b) => !b.disabled && s.x + R > b.minX && s.x - R < b.maxX &&
            s.z + R > b.minZ && s.z - R < b.maxZ && s.y + H > b.minY && s.y + 0.05 < b.maxY);
          assert(!bad, `${m.id} ${team} spawn ${i} is inside a block`);
        });
      }
    }
  },

  'fire tap pressed and released between ticks still shoots'() {
    const sim = newSim();
    const p = addPlayer(sim, 'h');
    for (let i = 0; i < 400; i++) sim.step(DT);
    p.spawnProtect = 0;
    sim.setPlayerInput('h', input({ seq: 1, fire: true }));
    sim.setPlayerInput('h', input({ seq: 2, fire: false }));
    assert(shots(sim.step(DT), 'h') >= 1, 'tap was lost');
    sim.step(DT);
    assert.strictEqual(p.input.fire, false, 'fire stuck held');
  },

  'holding crouch in the air slides on landing'() {
    const sim = newSim();
    const p = addPlayer(sim, 'h');
    for (let i = 0; i < 400; i++) sim.step(DT);
    p.y += 3; p.vy = 0; p.grounded = false; p.wasGrounded = false; p.slideCooldown = 0;
    for (let i = 0; i < 120 && !p.sliding; i++) {
      sim.setPlayerInput('h', input({ seq: 10 + i, moveZ: 1, yaw: Math.PI / 2, crouch: true }));
      p.prevCrouch = true;
      if (!p.grounded) p.vx = 9;
      sim.step(DT);
    }
    assert(p.sliding, 'no landing slide');
  },

  'fire rate matches config at 60Hz and 240Hz'() {
    for (const hz of [60, 240]) {
      for (const wid of ['ar', 'smg']) {
        const sim = newSim({ mapId: 'neon' });
        const p = addPlayer(sim, 'h');
        for (let i = 0; i < 200; i++) sim.step(DT);
        p.weaponId = wid; p.fireCooldown = 0; p.reloading = false;
        let n = 0;
        for (let i = 0; i < 2 * hz; i++) {
          sim.setPlayerInput('h', input({ seq: i + 1, pitch: -1.2, fire: true }));
          p.ammo[wid] = 999;
          n += shots(sim.step(1 / hz), 'h');
        }
        const rate = BS.WEAPON_BY_ID[wid].fireRate;
        assert(Math.abs(n / 2 - rate) <= 0.5, `${wid} at ${hz}Hz fired ${n / 2}/s, config ${rate}/s`);
      }
    }
  },

  'blade cannot hit through a wall but hits in the open'() {
    const sim = newSim();
    const a = addPlayer(sim, 'a'), b = addPlayer(sim, 'b');
    const blade = BS.WEAPONS.find((w) => w.type === 'melee');
    const swing = () => {
      a.weaponId = blade.id; a.spawnProtect = b.spawnProtect = 0;
      a.input.yaw = a.yaw = Math.atan2(b.x - a.x, -(b.z - a.z)); a.input.pitch = a.pitch = 0;
      a.fireCooldown = 0; a.input.fire = true; a.prevFire = false;
      const hp = b.hp; sim._updatePlayerCombat(a, DT); return hp - b.hp;
    };
    const wall = sim.blocks.find((k) => !k.disabled && k.maxY - k.minY > 2.5 && k.maxX - k.minX <= 2.2 && k.maxZ - k.minZ > 2);
    a.x = wall.minX - 0.6; b.x = wall.maxX + 0.6; a.z = b.z = (wall.minZ + wall.maxZ) / 2; a.y = b.y = wall.minY;
    assert.strictEqual(swing(), 0, 'blade hit through wall');
    b.hp = 100; a.x = 0; a.z = 0; a.y = b.y = 0.2; b.x = 1.5; b.z = 0;
    if (!sim.raycastBlocks(0, 1.6, 0, 1, 0, 0, 1.5).hit) assert(swing() > 0, 'blade missed in the open');
  },

  'grenade thrown flush against a wall still explodes'() {
    const sim = newSim({ mapId: 'crossroads' });
    const p = addPlayer(sim, 'g');
    for (let i = 0; i < 120; i++) sim.step(DT);
    p.x = 0; p.z = 0; p.y = 0.2;
    const hit = sim.raycastBlocks(0, 1.7, 0, 0, 0, -1, 200);
    p.z = -hit.dist + 0.43; p.yaw = 0; p.pitch = 0; p.vx = p.vz = 0;
    sim._throwGrenade(p);
    let booms = 0;
    for (let i = 0; i < 200; i++) booms += (sim.step(DT) || []).filter((e) => e.type === 'explosion').length;
    assert(booms >= 1, 'grenade vanished');
  },

  'arsenal ladder final tier needs the tier weapon'() {
    const sim = newSim({ modeId: 'gungame' });
    const k = addPlayer(sim, 'k'), v = addPlayer(sim, 'v');
    k.gunGameTier = BS.WEAPONS.length - 1; k.gunGameTierKills = 1;
    sim._killPlayer(v, k, 'grenade', false);
    assert(!sim.matchOver, 'grenade won the ladder');
    v.alive = true;
    sim._killPlayer(v, k,BS.WEAPONS[k.gunGameTier].id, false);
    assert(sim.matchOver, 'final-tier weapon kill did not win');
  },

  'FFA timeout tie goes to fewer deaths'() {
    const sim = newSim();
    const a = addPlayer(sim, 'A'), b = addPlayer(sim, 'B');
    a.kills = b.kills = 2; a.score = b.score = 200; a.deaths = 3; b.deaths = 1;
    sim._endMatchByTime();
    assert.strictEqual(sim.winner.name, 'B');
  },

  'self rocket kill is not credited to THE VOID'() {
    const sim = newSim();
    const p = addPlayer(sim, 'Me');
    sim.events.length = 0;
    sim._killPlayer(p, null, 'rocket', false);
    assert.strictEqual(sim.events.find((e) => e.type === 'kill').killerName, 'Me');
  },

  'LAN 3rd-person aim ray hits snapshot players'() {
    const server = newSim({ mapId: 'neon' });
    const me = addPlayer(server, 'me'), foe = addPlayer(server, 'foe');
    // Find an open lane (no blocks between camera and foe).
    let x = -40;
    while (server.raycastBlocks(x, 1.6, 2, 0, 0, -1, 6).hit && x < 40) x += 1;
    me.x = x; me.z = 0; me.y = 0.2; foe.x = x; foe.z = -4; foe.y = 0.2; foe.spawnProtect = 0;
    const snap = server.getSnapshot();
    const client = newSim({ mapId: 'neon' });
    client.players = snap.players;
    const meSnap = snap.players.find((p) => p.id === 'me');
    const res = client.raycastWorldAndPlayers(x, 1.6, 2, 0, 0, -1, 50, meSnap);
    assert(res.player && res.player.id === 'foe', 'aim ray missed the enemy in the snapshot');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log('ok  ', name);
  } catch (e) {
    failed++;
    console.log('FAIL', name, '-', e.message);
  }
}
if (failed) process.exit(1);
