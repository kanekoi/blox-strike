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

  'every kill heals the killer by KILL_HEAL, capped at max HP'() {
    const sim = newSim();
    const k = addPlayer(sim, 'k'), v = addPlayer(sim, 'v');
    k.hp = 50;
    sim.events.length = 0;
    sim._killPlayer(v, k, 'ar', false);
    assert.strictEqual(k.hp, 50 + BS.PROGRESSION.KILL_HEAL);
    assert.strictEqual(sim.events.find((e) => e.type === 'kill').healed, BS.PROGRESSION.KILL_HEAL);
    v.alive = true;
    k.hp = k.maxHp - 3;
    sim._killPlayer(v, k, 'ar', false);
    assert.strictEqual(k.hp, k.maxHp, 'heal overflowed max HP');
  },

  'knocking someone into the void credits the attacker'() {
    const sim = newSim({ mapId: 'skyblox' });
    const a = addPlayer(sim, 'a'), v = addPlayer(sim, 'v');
    for (let i = 0; i < 5; i++) sim.step(DT);
    a.spawnProtect = v.spawnProtect = 0;
    sim._applyDamage(a, v, 10, 'ar', false, v.x, v.y, v.z);
    v.y = sim.map.voidY - 1; v.vy = -5;
    let kill = null;
    for (let i = 0; i < 5 && !kill; i++) kill = (sim.step(DT) || []).find((e) => e.type === 'kill' && e.victimId === 'v');
    assert(kill, 'no void kill');
    assert.strictEqual(kill.killerId, 'a');
    assert.strictEqual(a.kills, 1);
  },

  'old hits do not credit a void fall'() {
    const sim = newSim({ mapId: 'skyblox' });
    const a = addPlayer(sim, 'a'), v = addPlayer(sim, 'v');
    for (let i = 0; i < 5; i++) sim.step(DT);
    a.spawnProtect = v.spawnProtect = 0;
    sim._applyDamage(a, v, 10, 'ar', false, v.x, v.y, v.z);
    v.lastHitTime -= 10;
    v.y = sim.map.voidY - 1;
    let kill = null;
    for (let i = 0; i < 5 && !kill; i++) kill = (sim.step(DT) || []).find((e) => e.type === 'kill' && e.victimId === 'v');
    assert.strictEqual(kill.killerName, 'THE VOID');
  },

  'assists go to other damagers with enough damage'() {
    const sim = newSim();
    const k = addPlayer(sim, 'k'), helper = addPlayer(sim, 'helper'), tiny = addPlayer(sim, 'tiny'), v = addPlayer(sim, 'v');
    v.alive = true; v.spawnProtect = 0; v.hp = 100;
    sim._applyDamage(helper, v, 40, 'ar', false, 0, 0, 0);
    sim._applyDamage(tiny, v, 10, 'ar', false, 0, 0, 0);
    sim.events.length = 0;
    sim._applyDamage(k, v, 200, 'ar', false, 0, 0, 0);
    const kill = sim.events.find((e) => e.type === 'kill');
    assert.deepStrictEqual(kill.assistIds, ['helper']);
    assert.strictEqual(kill.assistName, 'helper');
    assert.strictEqual(helper.assists, 1);
    assert(!tiny.assists, 'tiny damage should not assist');
    assert(!k.assists, 'killer should not also assist');
  },

  'posthumous kill scores but does not build streak or heal'() {
    const sim = newSim();
    const k = addPlayer(sim, 'k'), v = addPlayer(sim, 'v');
    k.alive = false; k.hp = 0;
    sim._killPlayer(v, k, 'barrel', false);
    assert.strictEqual(k.kills, 1);
    assert.strictEqual(k.streak, 0);
    assert.strictEqual(k.hp, 0);
  },

  'TDM score freezes once a winner is decided'() {
    const sim = newSim({ modeId: 'tdm' });
    const b = addPlayer(sim, 'b', 'blue'), r = addPlayer(sim, 'r', 'red'), v1 = addPlayer(sim, 'v1', 'red'), v2 = addPlayer(sim, 'v2', 'blue');
    sim.scores.blue = sim.mode.scoreLimit - 1; sim.scores.red = sim.mode.scoreLimit - 1;
    sim._killPlayer(v1, b, 'grenade', false);
    sim._killPlayer(v2, r, 'grenade', false);
    assert(sim.matchOver);
    assert(sim.scores.blue > sim.scores.red, `winner behind: ${sim.scores.blue}-${sim.scores.red}`);
  },

  'KOTH timeout with equal whole points is a draw'() {
    const sim = newSim({ modeId: 'koth' });
    sim.scores.blue = 9.9; sim.scores.red = 9.9 + 1.6e-14;
    sim._endMatchByTime();
    assert.strictEqual(sim.winner.name, 'DRAW');
  },

  'grenade tapped while dead is not thrown on respawn'() {
    const sim = newSim();
    const p = addPlayer(sim, 'h');
    for (let i = 0; i < 300; i++) sim.step(DT);
    sim._killPlayer(p, null, 'void', false);
    sim.setPlayerInput('h', input({ seq: 1, grenade: true }));
    let thrown = false;
    for (let i = 0; i < 600; i++) {
      sim.step(DT);
      if (p.alive && p.grenadeCooldown > 0) thrown = true;
    }
    assert(!thrown, 'queued grenade fired on respawn');
  },

  'kill event carries killer HP; stats track damage and accuracy'() {
    const sim = newSim();
    const k = addPlayer(sim, 'k'), v = addPlayer(sim, 'v');
    v.alive = true; v.spawnProtect = 0; v.hp = 100; v.shield = 0; k.hp = 70;
    k.shotsFired = 2;
    sim._applyDamage(k, v, 30, 'ar', false, 0, 0, 0);
    sim._applyDamage(k, v, 30, 'ar', false, 0, 0, 0); // same shot: still 1 hit
    sim.events.length = 0;
    k.shotsFired = 3;
    sim._applyDamage(k, v, 500, 'ar', false, 0, 0, 0);
    const kill = sim.events.find((e) => e.type === 'kill');
    assert.strictEqual(kill.killerHp, 80, 'killer HP after +10 heal');
    assert.strictEqual(k.damageDealt, 100, 'overkill must not count');
    assert.strictEqual(k.shotsHit, 2);
    const snap = sim.getSnapshot().players.find((p) => p.id === 'k');
    assert.strictEqual(snap.damageDealt, 100);
    assert.strictEqual(snap.shotsHit, 2);
  },

  'double jump: one fresh press in mid-air, none while holding'() {
    const sim = newSim();
    const p = addPlayer(sim, 'h');
    for (let i = 0; i < 300; i++) sim.step(DT);
    const press = (jump, seq) => { sim.setPlayerInput('h', input({ seq, jump })); return sim.step(DT) || []; };
    press(true, 1); // ground jump
    let dj = 0;
    for (let i = 0; i < 10; i++) dj += press(true, 2 + i).filter((e) => e.type === 'doubleJump').length; // held
    assert.strictEqual(dj, 0, 'holding jump must not double jump');
    press(false, 20);
    dj = press(true, 21).filter((e) => e.type === 'doubleJump').length;
    assert.strictEqual(dj, 1, 'fresh press in air should double jump');
    press(false, 22);
    dj = press(true, 23).filter((e) => e.type === 'doubleJump').length;
    assert.strictEqual(dj, 0, 'only one air jump');
  },

  'kill confirmed: kills drop tags; enemy confirms, teammate denies'() {
    const sim = newSim({ modeId: 'kc', mapId: 'crossroads' });
    const b = addPlayer(sim, 'b', 'blue'), r = addPlayer(sim, 'r', 'red'), r2 = addPlayer(sim, 'r2', 'red');
    for (let i = 0; i < 3; i++) sim.step(DT);
    for (const p of [b, r, r2]) { p.x = 30; p.z = 30; p.y = 50; p.vy = 0; } // park everyone away, mid-air
    const placeAt = (p, t) => { p.x = t.x; p.z = t.z; p.y = t.y; };
    // blue kills red on the ground: no team point yet, a red tag appears
    r.x = 0; r.z = -5; r.y = 0.2;
    sim._killPlayer(r, b, 'ar', false);
    assert.strictEqual(sim.scores.blue, 0, 'kill alone must not score');
    assert.strictEqual(sim.tags.length, 1);
    assert.strictEqual(sim.tags[0].team, 'red');
    b.alive = true; placeAt(b, sim.tags[0]);
    sim._updateTags(DT);
    assert.strictEqual(sim.scores.blue, 1, 'enemy tag should confirm');
    assert.strictEqual(sim.tags.length, 0);
    // another red dies; red teammate grabs it: denied, no score
    r.alive = true; r.x = 0; r.z = -5; r.y = 0.2;
    sim._killPlayer(r, b, 'ar', false);
    b.x = 30; b.y = 50;
    r2.alive = true; placeAt(r2, sim.tags[0]);
    sim._updateTags(DT);
    assert.strictEqual(sim.scores.blue, 1);
    assert.strictEqual(sim.scores.red, 0);
    assert.strictEqual(sim.tags.length, 0);
  },

  'kill confirmed full bot match scores and ends cleanly'() {
    const sim = newSim({ modeId: 'kc', botCount: 7, mapId: 'neon' });
    let confirms = 0;
    for (let i = 0; i < 60 * 300 && !sim.matchOver; i++) {
      for (const e of sim.step(DT) || []) if (e.type === 'tag' && e.kind === 'confirmed') confirms++;
    }
    assert(confirms > 5, `bots confirmed only ${confirms} kills in a full match`);
    assert(sim.matchOver);
    assert(sim.tags.every((t) => Number.isFinite(t.x + t.y + t.z)));
  },

  'self rocket kill is not credited to THE VOID'() {
    const sim = newSim();
    const p = addPlayer(sim, 'Me');
    sim.events.length = 0;
    sim._killPlayer(p, null, 'rocket', false);
    assert.strictEqual(sim.events.find((e) => e.type === 'kill').killerName, 'Me');
  },

  'skyblox bots mostly die in combat, not by walking into the void'() {
    let all = 0, fell = 0;
    for (let run = 0; run < 3; run++) {
      const sim = newSim({ mapId: 'skyblox', botCount: 7 });
      for (let i = 0; i < 60 * 60 && !sim.matchOver; i++) {
        for (const e of sim.step(DT) || []) if (e.type === 'kill') { all++; if (e.weaponId === 'void') fell++; }
      }
    }
    // Was ~66% before the edge-avoid fix; ~9% after. Bots use Math.random, so keep the bar loose.
    assert(fell / all < 0.25, `${fell}/${all} deaths were void falls`);
  },

  'every jump pad lands a passive player safely'() {
    for (const m of Object.values(BS.MAPS)) {
      m.jumpPads.forEach((pad, i) => {
        const sim = newSim({ mapId: m.id });
        const p = addPlayer(sim, 'h');
        for (let k = 0; k < 5; k++) sim.step(DT);
        p.alive = true; p.x = pad.x; p.z = pad.z; p.y = pad.y + 0.1; p.vx = p.vz = p.vy = 0;
        let landed = false;
        for (let k = 0; k < 300 && p.alive && !landed; k++) {
          sim.setPlayerInput('h', input({ seq: k + 1 }));
          sim.step(DT);
          landed = k > 20 && p.grounded;
        }
        assert(landed && p.alive, `${m.id} pad ${i} drops a still player into the void`);
      });
    }
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
