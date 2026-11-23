// Blox Strike - Authoritative 60Hz 3D Game Simulation
// Completely decoupled from DOM/WebGL so it can run identically in a future Node.js multiplayer server!

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerpAngle(a, b, t) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
    let tmin = 0.0;
    let tmax = maxDist;

    if (Math.abs(dx) < 1e-8) {
      if (ox < minX || ox > maxX) return -1;
    } else {
      const inv = 1 / dx;
      let t1 = (minX - ox) * inv;
      let t2 = (maxX - ox) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    if (Math.abs(dy) < 1e-8) {
      if (oy < minY || oy > maxY) return -1;
    } else {
      const inv = 1 / dy;
      let t1 = (minY - oy) * inv;
      let t2 = (maxY - oy) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    if (Math.abs(dz) < 1e-8) {
      if (oz < minZ || oz > maxZ) return -1;
    } else {
      const inv = 1 / dz;
      let t1 = (minZ - oz) * inv;
      let t2 = (maxZ - oz) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    return tmin >= 0 && tmin <= maxDist ? tmin : -1;
  }

  class GameSim {
    constructor() {
      this.tick = 0;
      this.time = 0;
      this.map = BS.MAPS.crossroads;
      this.mode = BS.MODES.tdm;
      this.difficulty = 'medium';
      this.players = [];
      this.playerMap = {};
      this.projectiles = [];
      this.pickups = [];
      this.blocks = [];
      this.localPlayerId = 'p_local';
      this.scores = { blue: 0, red: 0 };
      this.kothOwner = null; // 'blue' | 'red' | 'contested' | null
      this.kothProgress = 0;
      this.timeLeft = 300;
      this.matchOver = false;
      this.winner = null;
      this.nextProjId = 1;
      this.events = [];
    }

    startMatch(options = {}) {
      const mapId = options.mapId || 'crossroads';
      const modeId = options.modeId || 'tdm';
      const botCount = clamp(options.botCount !== undefined ? options.botCount : 7, 1, 11);
      const playerName = (options.playerName || 'BloxPlayer').trim().slice(0, 16) || 'BloxPlayer';
      const playerSkinId = options.skinId || 'classic';
      this.difficulty = options.difficulty || 'medium';

      this.map = BS.MAPS[mapId] || BS.MAPS.crossroads;
      this.mode = BS.MODES[modeId] || BS.MODES.tdm;

      // Precompute block AABBs
      this.blocks = this.map.blocks.map((b) => ({
        ...b,
        minX: b.x - b.w * 0.5,
        maxX: b.x + b.w * 0.5,
        minY: b.y - b.h * 0.5,
        maxY: b.y + b.h * 0.5,
        minZ: b.z - b.d * 0.5,
        maxZ: b.z + b.d * 0.5,
      }));

      // Add solid world-prop colliders into sim blocks (renderer draws full visuals separately)
      const mapProps = this.map.props || [];
      const propColliders = BS.PROP_COLLIDERS || {};
      for (let i = 0; i < mapProps.length; i++) {
        const pr = mapProps[i];
        const col = propColliders[pr.m];
        if (!col) continue;
        const s = pr.s || 1;
        const rot90 = Math.abs(Math.sin(pr.ry || 0)) > 0.7;
        const w = (rot90 ? col.d : col.w) * s;
        const h = col.h * s;
        const d = (rot90 ? col.w : col.d) * s;
        this.blocks.push({
          x: pr.x,
          y: pr.y + h * 0.5,
          z: pr.z,
          w,
          h,
          d,
          minX: pr.x - w * 0.5,
          maxX: pr.x + w * 0.5,
          minY: pr.y,
          maxY: pr.y + h,
          minZ: pr.z - d * 0.5,
          maxZ: pr.z + d * 0.5,
        });
      }

      this.pickups = this.map.pickups.map((p) => ({
        ...p,
        active: true,
        respawnTimer: 0,
      }));

      this.players = [];
      this.playerMap = {};
      this.projectiles = [];
      this.events = [];
      this.tick = 0;
      this.time = 0;
      this.scores = { blue: 0, red: 0 };
      this.kothOwner = null;
      this.kothProgress = 0;
      this.timeLeft = this.mode.timeLimit;
      this.matchOver = false;
      this.winner = null;

      // Add local human player (or AI bot in menu demoMode)
      const localSkin = BS.SKINS.find((s) => s.id === playerSkinId) || BS.SKINS[0];
      const accessoryIds = BS.ACCESSORY_IDS || [];
      const localAcc =
        options.accessoryId && options.accessoryId !== 'auto' && accessoryIds.includes(options.accessoryId)
          ? options.accessoryId
          : localSkin.accessory || 'hair_classic';
      const localTeam = this.mode.teams ? 'blue' : 'ffa';
      const localPlayer = this._createPlayer(
        this.localPlayerId,
        playerName,
        localTeam,
        !!options.demoMode,
        localSkin,
        localAcc
      );
      this._addPlayer(localPlayer);

      // Add AI bots
      const names = BS.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < botCount; i++) {
        let team = 'ffa';
        if (this.mode.teams) {
          // Keep teams balanced (local player is blue, so alternate red, blue, red...)
          const blueCount = this.players.filter((p) => p.team === 'blue').length;
          const redCount = this.players.filter((p) => p.team === 'red').length;
          team = redCount <= blueCount ? 'red' : 'blue';
        }
        const skin = BS.SKINS[(i + 1) % BS.SKINS.length];
        const botAcc = accessoryIds.length
          ? accessoryIds[Math.floor(Math.random() * accessoryIds.length)]
          : skin.accessory || 'hair_classic';
        const bot = this._createPlayer('bot_' + (i + 1), names[i % names.length], team, true, skin, botAcc);
        this._addPlayer(bot);
      }

      // Spawn everyone cleanly
      this.players.forEach((p, idx) => this._spawnPlayer(p, idx));
    }

    _createPlayer(id, name, team, isBot, skin, accessory) {
      const ammo = {};
      BS.WEAPONS.forEach((w) => {
        ammo[w.id] = w.magSize;
      });
      const colors = this._resolveColors(team, skin);
      return {
        id,
        name,
        team,
        isBot,
        colors,
        accessory: accessory || (skin && skin.accessory) || 'hair_classic',
        x: 0,
        y: 2,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        grounded: false,
        wasGrounded: false,
        coyote: 0,
        jumpBuffer: 0,
        hp: BS.PLAYER.MAX_HP,
        shield: 0,
        alive: true,
        respawnTimer: 0,
        spawnProtect: BS.PLAYER.SPAWN_PROTECT,
        weaponId: BS.WEAPONS[0].id,
        ammo,
        fireCooldown: 0,
        reloading: false,
        reloadTimer: 0,
        dashTimer: 0,
        dashCooldown: 0,
        dashDirX: 0,
        dashDirZ: 0,
        speedBoostTimer: 0,
        walkPhase: 0,
        walkAmp: 0,
        recoilKick: 0,
        hurtFlash: 0,
        kills: 0,
        deaths: 0,
        streak: 0,
        bestStreak: 0,
        score: 0,
        gunGameTier: 0,
        gunGameTierKills: 0,
        input: {
          seq: 0,
          moveX: 0,
          moveZ: 0,
          yaw: 0,
          pitch: 0,
          jump: false,
          dash: false,
          fire: false,
          ads: false,
          reload: false,
          weaponSlot: null,
        },
        prevFire: false,
        // Bot AI state
        ai: isBot
          ? {
              waypointIdx: Math.floor(Math.random() * 6),
              strafeDir: Math.random() < 0.5 ? -1 : 1,
              strafeTimer: 0.8 + Math.random() * 1.4,
              targetId: null,
              thinkTimer: Math.random() * 0.25,
              jumpTimer: 0,
              stuckTimer: 0,
              lastX: 0,
              lastZ: 0,
              desiredWeapon: BS.WEAPONS[Math.floor(Math.random() * 4)].id,
            }
          : null,
      };
    }

    _resolveColors(team, skin) {
      if (team === 'blue') {
        return {
          head: skin.head,
          torso: [0.16, 0.5, 0.96],
          legs: [0.14, 0.26, 0.48],
        };
      }
      if (team === 'red') {
        return {
          head: skin.head,
          torso: [0.94, 0.22, 0.28],
          legs: [0.46, 0.14, 0.18],
        };
      }
      return {
        head: skin.head,
        torso: skin.torso,
        legs: skin.legs,
      };
    }

    _addPlayer(p) {
      this.players.push(p);
      this.playerMap[p.id] = p;
    }

    setPlayerInput(playerId, cmd) {
      const p = this.playerMap[playerId];
      if (!p) return;
      p.input.seq = cmd.seq || 0;
      p.input.moveX = clamp(cmd.moveX || 0, -1, 1);
      p.input.moveZ = clamp(cmd.moveZ || 0, -1, 1);
      if (typeof cmd.yaw === 'number' && !Number.isNaN(cmd.yaw)) p.input.yaw = cmd.yaw;
      if (typeof cmd.pitch === 'number' && !Number.isNaN(cmd.pitch)) {
        p.input.pitch = clamp(cmd.pitch, -1.48, 1.48);
      }
      p.input.jump = !!cmd.jump;
      if (cmd.dash) p.input.dash = true;
      p.input.fire = !!cmd.fire;
      p.input.ads = !!cmd.ads;
      if (cmd.reload) p.input.reload = true;
      if (cmd.weaponSlot !== undefined && cmd.weaponSlot !== null) {
        p.input.weaponSlot = cmd.weaponSlot;
      }
    }

    _spawnPlayer(p, fallbackIndex = 0) {
      const pool =
        p.team === 'blue'
          ? this.map.spawns.blue
          : p.team === 'red'
          ? this.map.spawns.red
          : this.map.spawns.ffa;

      // Choose spawn farthest from alive enemies
      let best = pool[fallbackIndex % pool.length];
      let bestScore = -1e9;
      for (let i = 0; i < pool.length; i++) {
        const sp = pool[i];
        let minEnemyDist = 999;
        for (let j = 0; j < this.players.length; j++) {
          const other = this.players[j];
          if (other.id === p.id || !other.alive) continue;
          const dx = other.x - sp.x;
          const dz = other.z - sp.z;
          const dist = Math.hypot(dx, dz);
          if (this._isEnemy(p, other) && dist < minEnemyDist) {
            minEnemyDist = dist;
          } else if (dist < 2.0) {
            minEnemyDist -= 8; // Avoid spawning directly on top of teammates
          }
        }
        const jitter = Math.random() * 2.5;
        if (minEnemyDist + jitter > bestScore) {
          bestScore = minEnemyDist + jitter;
          best = sp;
        }
      }

      p.x = best.x;
      p.y = best.y + 0.05;
      p.z = best.z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.yaw = best.yaw;
      p.pitch = 0;
      p.input.yaw = best.yaw;
      p.input.pitch = 0;
      p.hp = BS.PLAYER.MAX_HP;
      p.shield = 0;
      p.alive = true;
      p.respawnTimer = 0;
      p.spawnProtect = BS.PLAYER.SPAWN_PROTECT;
      p.reloading = false;
      p.reloadTimer = 0;
      p.fireCooldown = 0.15;
      p.dashTimer = 0;
      p.dashCooldown = 0;
      p.speedBoostTimer = 0;
      p.hurtFlash = 0;
      p.grounded = false;
      p.wasGrounded = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      p.walkAmp = 0;

      // Refill ammo
      BS.WEAPONS.forEach((w) => {
        p.ammo[w.id] = w.magSize;
      });

      if (this.mode.id === 'gungame') {
        const w = BS.WEAPONS[clamp(p.gunGameTier, 0, BS.WEAPONS.length - 1)];
        p.weaponId = w.id;
      } else if (p.isBot && p.ai) {
        p.weaponId = p.ai.desiredWeapon;
      }
    }

    _isEnemy(a, b) {
      if (a.id === b.id) return false;
      if (!this.mode.teams) return true;
      return a.team !== b.team;
    }

    step(dt) {
      this.events = [];
      if (this.matchOver) return this.events;

      this.tick++;
      this.time += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);

      if (this.timeLeft <= 0) {
        this._endMatchByTime();
        return this.events;
      }

      // Update pickups respawn
      for (let i = 0; i < this.pickups.length; i++) {
        const pk = this.pickups[i];
        if (!pk.active) {
          pk.respawnTimer -= dt;
          if (pk.respawnTimer <= 0) {
            pk.active = true;
          }
        }
      }

      // Update bots & all players
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.alive) {
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0) {
            this._spawnPlayer(p, i);
          }
          continue;
        }

        if (p.spawnProtect > 0) p.spawnProtect = Math.max(0, p.spawnProtect - dt);
        if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt * 3.5);
        if (p.recoilKick > 0) p.recoilKick = Math.max(0, p.recoilKick - dt * 4.5);
        if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
        if (p.speedBoostTimer > 0) p.speedBoostTimer = Math.max(0, p.speedBoostTimer - dt);
        if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);

        if (p.isBot) {
          this._updateBotAI(p, dt);
        }

        this._updatePlayerMovement(p, dt);
        p.input.dash = false;
        this._updatePlayerCombat(p, dt);
        p.input.reload = false;
        this._checkJumpPads(p);
        this._checkPickups(p);

        // Void death check (e.g. falling off Skyblox Islands)
        if (p.y < this.map.voidY) {
          this._killPlayer(p, null, 'void', false);
        }
      }

      // Update projectiles (rockets!)
      this._updateProjectiles(dt);

      // Update King of the Hill objective
      if (this.mode.id === 'koth') {
        this._updateKoth(dt);
      }

      return this.events;
    }

    _updatePlayerMovement(p, dt) {
      const inp = p.input;
      p.yaw = inp.yaw;
      p.pitch = inp.pitch;

      const fwdX = Math.sin(p.yaw);
      const fwdZ = -Math.cos(p.yaw);
      const rightX = Math.cos(p.yaw);
      const rightZ = Math.sin(p.yaw);

      let wishX = fwdX * inp.moveZ + rightX * inp.moveX;
      let wishZ = fwdZ * inp.moveZ + rightZ * inp.moveX;
      const wishLen = Math.hypot(wishX, wishZ);
      if (wishLen > 1e-4) {
        wishX /= wishLen;
        wishZ /= wishLen;
      }

      // Dash initiation
      if (inp.dash && p.dashCooldown <= 0 && p.dashTimer <= 0) {
        p.dashTimer = BS.PLAYER.DASH_DURATION;
        p.dashCooldown = BS.PLAYER.DASH_COOLDOWN;
        if (wishLen > 0.1) {
          p.dashDirX = wishX;
          p.dashDirZ = wishZ;
        } else {
          p.dashDirX = fwdX;
          p.dashDirZ = fwdZ;
        }
        p.vy = Math.max(p.vy, 3.0);
        this.events.push({ type: 'dash', playerId: p.id, x: p.x, y: p.y + 0.8, z: p.z });
      }

      let speed = BS.PLAYER.MOVE_SPEED;
      if (inp.ads) speed *= BS.PLAYER.ADS_SPEED_MULT;
      if (p.weaponId === 'blade') speed *= 1.15;
      if (p.speedBoostTimer > 0) speed *= 1.38;

      const hasInput = wishLen > 1e-4;
      if (p.dashTimer > 0) {
        p.dashTimer -= dt;
        p.vx = p.dashDirX * BS.PLAYER.DASH_SPEED;
        p.vz = p.dashDirZ * BS.PLAYER.DASH_SPEED;
      } else if (p.grounded) {
        const rate = hasInput ? BS.PLAYER.GROUND_ACCEL : BS.PLAYER.GROUND_FRICTION;
        const k = 1 - Math.exp(-rate * dt);
        const targetVx = wishX * speed;
        const targetVz = wishZ * speed;
        p.vx += (targetVx - p.vx) * k;
        p.vz += (targetVz - p.vz) * k;
      } else {
        // Quake-style air acceleration: preserves momentum while letting player steer cleanly
        if (hasInput) {
          const cur = p.vx * wishX + p.vz * wishZ;
          const add = speed - cur;
          if (add > 0) {
            const a = Math.min(add, BS.PLAYER.AIR_ACCEL * speed * dt);
            p.vx += wishX * a;
            p.vz += wishZ * a;
          }
        }
        const drag = Math.exp(-BS.PLAYER.AIR_DRAG * dt);
        p.vx *= drag;
        p.vz *= drag;
      }

      // Coyote time + Jump buffer
      if (p.grounded) p.coyote = BS.PLAYER.COYOTE_TIME;
      else p.coyote = Math.max(0, p.coyote - dt);

      if (inp.jump) p.jumpBuffer = BS.PLAYER.JUMP_BUFFER;
      else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

      let jumpedThisTick = false;
      if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
        p.vy = BS.PLAYER.JUMP_VEL;
        p.grounded = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        jumpedThisTick = true;
      }

      // Gravity
      p.vy -= BS.PLAYER.GRAVITY * dt;
      if (p.vy < -42) p.vy = -42;

      // Move & collide Y -> X -> Z
      this._moveAndCollide(p, dt);

      // Ground snap when walking down steps/ledges
      if (p.wasGrounded && !p.grounded && !jumpedThisTick && p.vy <= 0 && p.dashTimer <= 0) {
        const R = BS.PLAYER.RADIUS;
        let bestTop = -Infinity;
        for (let i = 0; i < this.blocks.length; i++) {
          const b = this.blocks[i];
          if (p.x + R <= b.minX || p.x - R >= b.maxX) continue;
          if (p.z + R <= b.minZ || p.z - R >= b.maxZ) continue;
          if (b.maxY <= p.y + 0.01 && b.maxY >= p.y - BS.PLAYER.STEP_DOWN) {
            if (b.maxY > bestTop) bestTop = b.maxY;
          }
        }
        if (bestTop > -Infinity && this._hasHeadroom(p.x, bestTop, p.z, R, BS.PLAYER.HEIGHT)) {
          p.y = bestTop;
          p.vy = 0;
          p.grounded = true;
        }
      }
      p.wasGrounded = p.grounded;

      // Walk animation phase (monotonic phase, smoothed walkAmp so stopping never jitters!)
      const horizSpeed = Math.hypot(p.vx, p.vz);
      if (p.grounded && horizSpeed > 0.8) {
        p.walkAmp += (1 - p.walkAmp) * Math.min(1, dt * 10);
      } else {
        p.walkAmp += (0 - p.walkAmp) * Math.min(1, dt * 8);
      }
      if (p.walkAmp > 0.01) {
        p.walkPhase += dt * horizSpeed * 1.45;
        if (p.walkPhase > 1000) p.walkPhase -= Math.PI * 2 * 150;
      }
    }

    _moveAndCollide(p, dt) {
      const R = BS.PLAYER.RADIUS;
      const H = BS.PLAYER.HEIGHT;
      const STEP = BS.PLAYER.STEP_HEIGHT;

      // 1. Vertical axis
      p.y += p.vy * dt;
      p.grounded = false;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (p.x + R <= b.minX || p.x - R >= b.maxX) continue;
        if (p.z + R <= b.minZ || p.z - R >= b.maxZ) continue;
        if (p.y < b.maxY && p.y + H > b.minY) {
          if (p.vy <= 0 && p.y >= b.maxY - 0.85) {
            p.y = b.maxY;
            p.vy = 0;
            p.grounded = true;
          } else if (p.vy > 0 && p.y + H <= b.minY + 0.85) {
            p.y = b.minY - H;
            p.vy = 0;
          }
        }
      }

      // 2. X axis with step-up
      const oldX = p.x;
      p.x += p.vx * dt;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (p.x + R <= b.minX || p.x - R >= b.maxX) continue;
        if (p.z + R <= b.minZ || p.z - R >= b.maxZ) continue;
        if (p.y >= b.maxY - 0.01 || p.y + H <= b.minY + 0.01) continue;

        const stepDelta = b.maxY - p.y;
        if (stepDelta > 0 && stepDelta <= STEP && this._hasHeadroom(p.x, b.maxY, p.z, R, H)) {
          p.y = b.maxY;
          p.grounded = true;
        } else {
          if (p.x > oldX) p.x = b.minX - R - 0.0005;
          else if (p.x < oldX) p.x = b.maxX + R + 0.0005;
          p.vx = 0;
        }
      }

      // 3. Z axis with step-up
      const oldZ = p.z;
      p.z += p.vz * dt;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (p.x + R <= b.minX || p.x - R >= b.maxX) continue;
        if (p.z + R <= b.minZ || p.z - R >= b.maxZ) continue;
        if (p.y >= b.maxY - 0.01 || p.y + H <= b.minY + 0.01) continue;

        const stepDelta = b.maxY - p.y;
        if (stepDelta > 0 && stepDelta <= STEP && this._hasHeadroom(p.x, b.maxY, p.z, R, H)) {
          p.y = b.maxY;
          p.grounded = true;
        } else {
          if (p.z > oldZ) p.z = b.minZ - R - 0.0005;
          else if (p.z < oldZ) p.z = b.maxZ + R + 0.0005;
          p.vz = 0;
        }
      }
    }

    _hasHeadroom(x, y, z, R, H) {
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (x + R <= b.minX || x - R >= b.maxX) continue;
        if (z + R <= b.minZ || z - R >= b.maxZ) continue;
        if (y + 0.02 < b.maxY && y + H > b.minY) return false;
      }
      return true;
    }

    _updatePlayerCombat(p, dt) {
      const inp = p.input;

      // Weapon switching (disabled in Gun Game since tier dictates weapon)
      if (this.mode.id !== 'gungame' && inp.weaponSlot !== null) {
        const w = BS.WEAPONS.find((item) => item.slot === inp.weaponSlot);
        if (w && w.id !== p.weaponId) {
          p.weaponId = w.id;
          p.reloading = false;
          p.reloadTimer = 0;
          p.fireCooldown = Math.max(p.fireCooldown, 0.14);
        }
        inp.weaponSlot = null;
      }

      const w = BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0];

      // Handle Reload
      if (p.reloading) {
        p.reloadTimer -= dt;
        if (p.reloadTimer <= 0) {
          p.reloading = false;
          p.ammo[w.id] = w.magSize;
        }
      } else if (
        w.type !== 'melee' &&
        (inp.reload || p.ammo[w.id] <= 0) &&
        p.ammo[w.id] < w.magSize
      ) {
        p.reloading = true;
        p.reloadTimer = w.reloadTime;
        this.events.push({ type: 'reload', playerId: p.id, weaponId: w.id });
      }

      // Firing
      const wantsFire = w.fireMode === 'auto' ? inp.fire : inp.fire && !p.prevFire;
      p.prevFire = inp.fire;

      if (wantsFire && !p.reloading && p.fireCooldown <= 0) {
        if (w.type === 'melee' || p.ammo[w.id] > 0) {
          this._fireWeapon(p, w);
        }
      }
    }

    _fireWeapon(p, w) {
      p.fireCooldown = 1 / w.fireRate;
      p.recoilKick = Math.min(1, p.recoilKick + w.recoilKick * 2.2);
      p.spawnProtect = 0; // Shooting ends spawn protection

      if (w.type !== 'melee') {
        p.ammo[w.id] = Math.max(0, p.ammo[w.id] - 1);
      }

      const ox = p.x;
      const oy = p.y + BS.PLAYER.EYE_HEIGHT;
      const oz = p.z;

      const cp = Math.cos(p.pitch);
      const sp = Math.sin(p.pitch);
      const sy = Math.sin(p.yaw);
      const cy = Math.cos(p.yaw);

      const baseDx = sy * cp;
      const baseDy = sp;
      const baseDz = -cy * cp;

      if (w.type === 'melee') {
        // Forward dash lunge!
        p.vx += sy * w.lungeSpeed;
        p.vz += -cy * w.lungeSpeed;
        if (p.grounded) p.vy = Math.max(p.vy, 3.2);

        const hits = [];
        let bestTarget = null;
        let bestDist = w.range;
        for (let i = 0; i < this.players.length; i++) {
          const other = this.players[i];
          if (!other.alive || !this._isEnemy(p, other)) continue;
          const dx = other.x - ox;
          const dy = other.y + 1.0 - oy;
          const dz = other.z - oz;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < bestDist) {
            const dot = (dx * baseDx + dy * baseDy + dz * baseDz) / Math.max(0.001, dist);
            if (dot > 0.52) {
              bestDist = dist;
              bestTarget = other;
            }
          }
        }
        if (bestTarget) {
          const isHead = p.pitch > 0.08;
          const dmg = Math.round(w.damage * (isHead ? w.headMult : 1));
          this._applyDamage(p, bestTarget, dmg, w.id, isHead, bestTarget.x, bestTarget.y + 1.2, bestTarget.z);
          hits.push({ x: bestTarget.x, y: bestTarget.y + 1.2, z: bestTarget.z, hitPlayer: true, headshot: isHead });
        } else {
          hits.push({
            x: ox + baseDx * 2.5,
            y: oy + baseDy * 2.5,
            z: oz + baseDz * 2.5,
            hitPlayer: false,
            headshot: false,
          });
        }
        this.events.push({
          type: 'shoot',
          shooterId: p.id,
          weaponId: w.id,
          ox,
          oy,
          oz,
          hits,
        });
        return;
      }

      if (w.type === 'projectile') {
        // Spawn Brick-RPG rocket!
        const proj = {
          id: this.nextProjId++,
          ownerId: p.id,
          weaponId: w.id,
          x: ox + baseDx * 0.75,
          y: oy + baseDy * 0.75 - 0.08,
          z: oz + baseDz * 0.75,
          vx: baseDx * w.projSpeed,
          vy: baseDy * w.projSpeed,
          vz: baseDz * w.projSpeed,
          life: 4.5,
          splashRadius: w.splashRadius,
          damage: w.damage,
          knockback: w.knockback,
        };
        this.projectiles.push(proj);
        this.events.push({
          type: 'shoot',
          shooterId: p.id,
          weaponId: w.id,
          ox,
          oy,
          oz,
          hits: [],
        });
        return;
      }

      // Hitscan weapon (AR, SMG, Shotgun, Railgun Sniper)
      const spread = p.input.ads ? w.adsSpread : w.spread;
      const hits = [];
      const dmgAccum = {};

      for (let k = 0; k < w.pellets; k++) {
        const rx = (Math.random() - 0.5) * 2 * spread;
        const ry = (Math.random() - 0.5) * 2 * spread;
        const rz = (Math.random() - 0.5) * 2 * spread;
        let dx = baseDx + rx;
        let dy = baseDy + ry;
        let dz = baseDz + rz;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;

        const res = this.raycastWorldAndPlayers(ox, oy, oz, dx, dy, dz, w.range, p);
        hits.push({
          x: res.x,
          y: res.y,
          z: res.z,
          hitPlayer: !!res.player,
          headshot: res.headshot,
        });

        if (res.player) {
          const key = res.player.id;
          if (!dmgAccum[key]) {
            dmgAccum[key] = {
              player: res.player,
              damage: 0,
              headshot: false,
              x: res.x,
              y: res.y,
              z: res.z,
            };
          }
          const pelletDmg = Math.round(w.damage * (res.headshot ? w.headMult : 1));
          dmgAccum[key].damage += pelletDmg;
          if (res.headshot) dmgAccum[key].headshot = true;
        }
      }

      Object.keys(dmgAccum).forEach((id) => {
        const d = dmgAccum[id];
        this._applyDamage(p, d.player, d.damage, w.id, d.headshot, d.x, d.y, d.z);
      });

      this.events.push({
        type: 'shoot',
        shooterId: p.id,
        weaponId: w.id,
        ox,
        oy,
        oz,
        hits,
      });
    }

    raycastBlocks(ox, oy, oz, dx, dy, dz, maxDist) {
      let best = maxDist;
      let hit = false;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        const t = rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
        if (t >= 0 && t < best) {
          best = t;
          hit = true;
        }
      }
      return { dist: best, hit };
    }

    raycastWorldAndPlayers(ox, oy, oz, dx, dy, dz, maxDist, shooter) {
      const worldHit = this.raycastBlocks(ox, oy, oz, dx, dy, dz, maxDist);
      let bestDist = worldHit.dist;
      let hitPlayer = null;
      let headshot = false;

      for (let i = 0; i < this.players.length; i++) {
        const other = this.players[i];
        if (!other.alive || !this._isEnemy(shooter, other)) continue;

        // Check head hitbox first (slightly generous for crispy Roblox feel)
        const ht = rayAABB(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          other.x - 0.34,
          other.y + BS.PLAYER.HEAD_MIN_Y,
          other.z - 0.34,
          other.x + 0.34,
          other.y + BS.PLAYER.HEIGHT + 0.08,
          other.z + 0.34,
          bestDist
        );
        if (ht >= 0 && ht < bestDist) {
          bestDist = ht;
          hitPlayer = other;
          headshot = true;
          continue;
        }

        // Body hitbox
        const bt = rayAABB(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          other.x - 0.48,
          other.y,
          other.z - 0.48,
          other.x + 0.48,
          other.y + BS.PLAYER.HEAD_MIN_Y + 0.06,
          other.z + 0.48,
          bestDist
        );
        if (bt >= 0 && bt < bestDist) {
          bestDist = bt;
          hitPlayer = other;
          headshot = false;
        }
      }

      return {
        dist: bestDist,
        x: ox + dx * bestDist,
        y: oy + dy * bestDist,
        z: oz + dz * bestDist,
        player: hitPlayer,
        headshot,
      };
    }

    _updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.life -= dt;
        const speed = Math.hypot(pr.vx, pr.vy, pr.vz);
        const stepDist = speed * dt;
        const dx = pr.vx / (speed || 1);
        const dy = pr.vy / (speed || 1);
        const dz = pr.vz / (speed || 1);

        const owner = this.playerMap[pr.ownerId];
        const hitWorld = this.raycastBlocks(pr.x, pr.y, pr.z, dx, dy, dz, stepDist + 0.25);

        let hitSomething = hitWorld.hit || pr.life <= 0;
        let hitX = pr.x + dx * hitWorld.dist;
        let hitY = pr.y + dy * hitWorld.dist;
        let hitZ = pr.z + dz * hitWorld.dist;

        if (!hitSomething) {
          for (let j = 0; j < this.players.length; j++) {
            const pl = this.players[j];
            if (!pl.alive || pl.id === pr.ownerId) continue;
            if (owner && !this._isEnemy(owner, pl)) continue;
            const d = Math.hypot(pl.x - pr.x, pl.y + 1.0 - pr.y, pl.z - pr.z);
            if (d < 0.95) {
              hitSomething = true;
              hitX = pr.x;
              hitY = pr.y;
              hitZ = pr.z;
              break;
            }
          }
        }

        if (hitSomething) {
          this._explode(hitX, hitY, hitZ, pr);
          this.projectiles.splice(i, 1);
        } else {
          pr.x += pr.vx * dt;
          pr.y += pr.vy * dt;
          pr.z += pr.vz * dt;
        }
      }
    }

    _explode(ex, ey, ez, pr) {
      const owner = this.playerMap[pr.ownerId] || null;
      this.events.push({
        type: 'explosion',
        x: ex,
        y: ey,
        z: ez,
        radius: pr.splashRadius,
        ownerId: pr.ownerId,
      });

      for (let i = 0; i < this.players.length; i++) {
        const pl = this.players[i];
        if (!pl.alive) continue;
        const isSelf = owner && pl.id === owner.id;
        if (!isSelf && owner && !this._isEnemy(owner, pl)) continue;

        const dx = pl.x - ex;
        const dy = pl.y + 0.9 - ey;
        const dz = pl.z - ez;
        const dist = Math.hypot(dx, dy, dz);
        if (dist <= pr.splashRadius) {
          const falloff = 1 - dist / pr.splashRadius;
          const kb = pr.knockback * (0.45 + 0.55 * falloff);
          const inv = 1 / Math.max(0.2, dist);
          pl.vx += dx * inv * kb;
          pl.vz += dz * inv * kb;
          pl.vy += Math.max(4.5, dy * inv * kb + 5.0); // Rocket jumping works!!

          const dmg = Math.round(pr.damage * (0.35 + 0.65 * falloff) * (isSelf ? 0.35 : 1.0));
          if (dmg > 0) {
            this._applyDamage(isSelf ? null : owner, pl, dmg, pr.weaponId, false, pl.x, pl.y + 1.0, pl.z);
          }
        }
      }
    }

    _applyDamage(attacker, victim, amount, weaponId, headshot, hx, hy, hz) {
      if (!victim.alive || victim.spawnProtect > 0) return;
      let rem = amount;
      if (victim.shield > 0) {
        const absorbed = Math.min(victim.shield, rem);
        victim.shield -= absorbed;
        rem -= absorbed;
      }
      victim.hp = Math.max(0, victim.hp - rem);
      victim.hurtFlash = 1.0;

      this.events.push({
        type: 'hit',
        attackerId: attacker ? attacker.id : null,
        victimId: victim.id,
        damage: amount,
        headshot,
        x: hx,
        y: hy,
        z: hz,
        remainingHp: victim.hp,
      });

      if (victim.hp <= 0) {
        this._killPlayer(victim, attacker, weaponId, headshot);
      }
    }

    _killPlayer(victim, killer, weaponId, headshot) {
      if (!victim.alive) return;
      victim.alive = false;
      victim.deaths++;
      victim.streak = 0;
      victim.respawnTimer = BS.PLAYER.RESPAWN_TIME;

      let streak = 0;
      if (killer && killer.id !== victim.id) {
        killer.kills++;
        killer.streak++;
        if (killer.streak > killer.bestStreak) killer.bestStreak = killer.streak;
        killer.score += headshot ? 125 : 100;
        streak = killer.streak;

        // Small heal-on-kill momentum (RIVALS / Arsenal vibe!)
        killer.hp = Math.min(BS.PLAYER.MAX_HP, killer.hp + 15);

        if (this.mode.id === 'tdm') {
          if (killer.team === 'blue') this.scores.blue++;
          else if (killer.team === 'red') this.scores.red++;
          if (this.scores.blue >= this.mode.scoreLimit) {
            this._finishMatch('BLUE TEAM', 'Reached elimination limit!');
          } else if (this.scores.red >= this.mode.scoreLimit) {
            this._finishMatch('RED TEAM', 'Reached elimination limit!');
          }
        } else if (this.mode.id === 'ffa') {
          if (killer.kills >= this.mode.scoreLimit) {
            this._finishMatch(killer.name, 'Dominated Free-For-All!');
          }
        } else if (this.mode.id === 'gungame') {
          killer.gunGameTierKills++;
          if (killer.gunGameTierKills >= 2) {
            killer.gunGameTier++;
            killer.gunGameTierKills = 0;
            if (killer.gunGameTier >= BS.WEAPONS.length) {
              this._finishMatch(killer.name, 'Completed the Arsenal Ladder!');
            } else {
              const nextW = BS.WEAPONS[killer.gunGameTier];
              killer.weaponId = nextW.id;
              killer.ammo[nextW.id] = nextW.magSize;
              killer.reloading = false;
            }
          }
        }
      }

      this.events.push({
        type: 'kill',
        killerId: killer ? killer.id : null,
        killerName: killer ? killer.name : 'THE VOID',
        killerTeam: killer ? killer.team : 'void',
        victimId: victim.id,
        victimName: victim.name,
        victimTeam: victim.team,
        weaponId,
        headshot,
        streak,
        x: victim.x,
        y: victim.y + 1.0,
        z: victim.z,
        victimColors: victim.colors,
      });
    }

    _checkJumpPads(p) {
      const pads = this.map.jumpPads;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const dist = Math.hypot(p.x - pad.x, p.z - pad.z);
        if (dist <= pad.r && Math.abs(p.y - pad.y) < 1.1 && p.vy < 10) {
          p.vy = pad.boostY;
          p.vx += pad.boostX;
          p.vz += pad.boostZ;
          p.grounded = false;
          p.wasGrounded = false;
          this.events.push({ type: 'jumpPad', playerId: p.id, x: pad.x, y: pad.y, z: pad.z });
        }
      }
    }

    _checkPickups(p) {
      for (let i = 0; i < this.pickups.length; i++) {
        const pk = this.pickups[i];
        if (!pk.active) continue;
        const dist = Math.hypot(p.x - pk.x, p.y + 0.9 - pk.y, p.z - pk.z);
        if (dist < 1.35) {
          let used = false;
          if (pk.type === 'health' && p.hp < BS.PLAYER.MAX_HP) {
            p.hp = Math.min(BS.PLAYER.MAX_HP, p.hp + 45);
            used = true;
          } else if (pk.type === 'shield' && p.shield < BS.PLAYER.MAX_SHIELD) {
            p.shield = BS.PLAYER.MAX_SHIELD;
            used = true;
          } else if (pk.type === 'speed') {
            p.speedBoostTimer = 6.5;
            used = true;
          }
          if (used) {
            pk.active = false;
            pk.respawnTimer = 11.0;
            this.events.push({ type: 'pickup', playerId: p.id, pickupType: pk.type, x: pk.x, y: pk.y, z: pk.z });
          }
        }
      }
    }

    _updateKoth(dt) {
      const zone = this.map.kothZone;
      let blueIn = 0;
      let redIn = 0;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.alive) continue;
        const d = Math.hypot(p.x - zone.x, p.z - zone.z);
        if (d <= zone.radius && Math.abs(p.y - zone.y) < 2.4) {
          if (p.team === 'blue') blueIn++;
          else if (p.team === 'red') redIn++;
        }
      }

      if (blueIn > 0 && redIn > 0) {
        this.kothOwner = 'contested';
      } else if (blueIn > 0) {
        this.kothOwner = 'blue';
        this.scores.blue = Math.min(this.mode.scoreLimit, this.scores.blue + dt * (2.6 + blueIn * 0.7));
        if (this.scores.blue >= this.mode.scoreLimit) {
          this._finishMatch('BLUE TEAM', 'Captured & held the Blox Zone!');
        }
      } else if (redIn > 0) {
        this.kothOwner = 'red';
        this.scores.red = Math.min(this.mode.scoreLimit, this.scores.red + dt * (2.6 + redIn * 0.7));
        if (this.scores.red >= this.mode.scoreLimit) {
          this._finishMatch('RED TEAM', 'Captured & held the Blox Zone!');
        }
      } else {
        this.kothOwner = null;
      }
    }

    _endMatchByTime() {
      if (this.mode.teams) {
        if (this.scores.blue > this.scores.red) this._finishMatch('BLUE TEAM', 'Time expired — Blue leads!');
        else if (this.scores.red > this.scores.blue) this._finishMatch('RED TEAM', 'Time expired — Red leads!');
        else this._finishMatch('DRAW', 'Time expired — Tied match!');
      } else {
        const sorted = this.players.slice().sort((a, b) => b.kills - a.kills || b.score - a.score);
        this._finishMatch(sorted[0] ? sorted[0].name : 'NOBODY', 'Time expired — Top scorer wins!');
      }
    }

    _finishMatch(winner, reason) {
      if (this.matchOver) return;
      this.matchOver = true;
      this.winner = { name: winner, reason };
      this.events.push({ type: 'matchEnd', winner, reason });
    }

    // --- Smart Local Bot AI ---
    _updateBotAI(bot, dt) {
      const ai = bot.ai;
      const diffCfg =
        this.difficulty === 'easy'
          ? { aimSpeed: 4.5, inaccuracy: 0.14, fireChance: 0.45, sightRange: 34 }
          : this.difficulty === 'hard'
          ? { aimSpeed: 10.5, inaccuracy: 0.04, fireChance: 0.9, sightRange: 54 }
          : { aimSpeed: 7.2, inaccuracy: 0.085, fireChance: 0.7, sightRange: 44 };

      ai.thinkTimer -= dt;
      ai.strafeTimer -= dt;
      if (ai.jumpTimer > 0) ai.jumpTimer -= dt;

      if (ai.strafeTimer <= 0) {
        ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
        ai.strafeTimer = 0.7 + Math.random() * 1.3;
      }

      // Find nearest visible enemy
      let target = null;
      let targetDist = diffCfg.sightRange;
      const eyeY = bot.y + BS.PLAYER.EYE_HEIGHT;

      if (ai.thinkTimer <= 0 || !ai.targetId) {
        ai.thinkTimer = 0.18 + Math.random() * 0.15;
        for (let i = 0; i < this.players.length; i++) {
          const other = this.players[i];
          if (!other.alive || !this._isEnemy(bot, other)) continue;
          const dx = other.x - bot.x;
          const dy = other.y + 1.1 - eyeY;
          const dz = other.z - bot.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < targetDist) {
            const los = this.raycastBlocks(bot.x, eyeY, bot.z, dx / d, dy / d, dz / d, d - 0.5);
            if (!los.hit) {
              targetDist = d;
              target = other;
            }
          }
        }
        ai.targetId = target ? target.id : null;
      } else if (ai.targetId) {
        const cand = this.playerMap[ai.targetId];
        if (cand && cand.alive) {
          const dx = cand.x - bot.x;
          const dy = cand.y + 1.1 - eyeY;
          const dz = cand.z - bot.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < diffCfg.sightRange) {
            const los = this.raycastBlocks(bot.x, eyeY, bot.z, dx / d, dy / d, dz / d, d - 0.5);
            if (!los.hit) {
              target = cand;
              targetDist = d;
            }
          }
        }
        if (!target) ai.targetId = null;
      }

      const inp = bot.input;
      inp.jump = false;
      inp.dash = false;
      inp.fire = false;
      inp.ads = false;
      inp.reload = false;

      if (target) {
        // Aim at target with difficulty-scaled wobble
        const dx = target.x - bot.x;
        const dy = target.y + 1.15 - eyeY;
        const dz = target.z - bot.z;
        const horiz = Math.hypot(dx, dz) || 0.001;
        const wobble = Math.sin(this.time * 4.7 + bot.id.length * 3) * diffCfg.inaccuracy;
        const desiredYaw = Math.atan2(dx, -dz) + wobble;
        const desiredPitch = clamp(Math.atan2(dy, horiz) + wobble * 0.5, -1.1, 1.1);

        inp.yaw = lerpAngle(bot.yaw, desiredYaw, clamp(diffCfg.aimSpeed * dt, 0, 1));
        inp.pitch = bot.pitch + (desiredPitch - bot.pitch) * clamp(diffCfg.aimSpeed * dt, 0, 1);

        const w = BS.WEAPON_BY_ID[bot.weaponId] || BS.WEAPONS[0];
        const idealDist = w.type === 'melee' ? 1.5 : w.id === 'shotgun' ? 8 : w.id === 'sniper' ? 24 : 14;

        inp.moveZ = targetDist > idealDist + 3 ? 1 : targetDist < idealDist - 4 ? -0.65 : 0.15;
        inp.moveX = ai.strafeDir * 0.78;

        // Avoid stepping into the void on Skyblox
        if (!this._hasGroundAhead(bot, inp.yaw, inp.moveX, inp.moveZ)) {
          inp.moveZ = -0.6;
          inp.moveX = 0;
        }

        // Fire when roughly aimed
        let angleDiff = Math.abs(((desiredYaw - inp.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
        if (angleDiff < 0.28 && Math.random() < diffCfg.fireChance) {
          inp.fire = true;
        }
        if (Math.random() < 0.008 && bot.grounded) inp.jump = true;
        if (Math.random() < 0.005 && bot.dashCooldown <= 0) inp.dash = true;
      } else {
        // Navigate toward objective / health pickup / waypoint
        let goal = this.map.waypoints[ai.waypointIdx % this.map.waypoints.length];

        if (bot.hp < 55) {
          const hpPick = this.pickups.find((pk) => pk.active && pk.type === 'health');
          if (hpPick) goal = hpPick;
        } else if (this.mode.id === 'koth' && Math.random() < 0.7) {
          goal = this.map.kothZone;
        }

        const dx = goal.x - bot.x;
        const dz = goal.z - bot.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.6) {
          ai.waypointIdx = Math.floor(Math.random() * this.map.waypoints.length);
        }

        const desiredYaw = Math.atan2(dx, -dz);
        inp.yaw = lerpAngle(bot.yaw, desiredYaw, clamp(6.0 * dt, 0, 1));
        inp.pitch = bot.pitch * 0.9;
        inp.moveZ = 1.0;
        inp.moveX = 0;

        // Check stuck -> jump or switch waypoint
        ai.stuckTimer += dt;
        if (ai.stuckTimer > 0.6) {
          const moved = Math.hypot(bot.x - ai.lastX, bot.z - ai.lastZ);
          if (moved < 0.65) {
            if (bot.grounded) inp.jump = true;
            ai.waypointIdx = Math.floor(Math.random() * this.map.waypoints.length);
          }
          ai.lastX = bot.x;
          ai.lastZ = bot.z;
          ai.stuckTimer = 0;
        }

        if (!this._hasGroundAhead(bot, inp.yaw, 0, 1)) {
          ai.waypointIdx = Math.floor(Math.random() * this.map.waypoints.length);
          inp.moveZ = -0.5;
        }
      }
    }

    _hasGroundAhead(p, yaw, moveX, moveZ) {
      if (this.map.id !== 'skyblox') return true;
      const fwdX = Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      const probeX = p.x + (fwdX * moveZ + rightX * moveX) * 2.2;
      const probeZ = p.z + (fwdZ * moveZ + rightZ * moveX) * 2.2;
      const res = this.raycastBlocks(probeX, p.y + 1.0, probeZ, 0, -1, 0, 5.5);
      return res.hit;
    }

    captureInterpState() {
      const players = {};
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        players[p.id] = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, alive: p.alive };
      }
      const projectiles = {};
      for (let i = 0; i < this.projectiles.length; i++) {
        const pr = this.projectiles[i];
        projectiles[pr.id] = { x: pr.x, y: pr.y, z: pr.z };
      }
      return { players, projectiles };
    }

    getSnapshot() {
      return {
        tick: this.tick,
        time: this.time,
        mapId: this.map.id,
        modeId: this.mode.id,
        timeLeft: this.timeLeft,
        scores: { blue: Math.floor(this.scores.blue), red: Math.floor(this.scores.red) },
        kothOwner: this.kothOwner,
        matchOver: this.matchOver,
        winner: this.winner,
        players: this.players.map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          isBot: p.isBot,
          colors: p.colors,
          accessory: p.accessory,
          x: p.x,
          y: p.y,
          z: p.z,
          vx: p.vx,
          vy: p.vy,
          vz: p.vz,
          yaw: p.yaw,
          pitch: p.pitch,
          grounded: p.grounded,
          hp: p.hp,
          shield: p.shield,
          alive: p.alive,
          respawnTimer: p.respawnTimer,
          spawnProtect: p.spawnProtect,
          weaponId: p.weaponId,
          ammo: p.ammo[p.weaponId],
          magSize: (BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0]).magSize,
          reloading: p.reloading,
          reloadProgress: p.reloading
            ? 1 - p.reloadTimer / (BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0]).reloadTime
            : 0,
          dashCooldown: p.dashCooldown,
          speedBoostTimer: p.speedBoostTimer,
          walkPhase: p.walkPhase,
          walkAmp: p.walkAmp,
          recoilKick: p.recoilKick,
          hurtFlash: p.hurtFlash,
          ads: p.input.ads,
          kills: p.kills,
          deaths: p.deaths,
          streak: p.streak,
          score: p.score,
          gunGameTier: p.gunGameTier,
        })),
        projectiles: this.projectiles.map((pr) => ({
          id: pr.id,
          x: pr.x,
          y: pr.y,
          z: pr.z,
          vx: pr.vx,
          vy: pr.vy,
          vz: pr.vz,
        })),
        pickups: this.pickups.map((pk) => ({
          id: pk.id,
          type: pk.type,
          x: pk.x,
          y: pk.y,
          z: pk.z,
          active: pk.active,
        })),
      };
    }
  }

  BS.GameSim = GameSim;
})(window);
