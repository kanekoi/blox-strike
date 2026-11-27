// Blox Strike - Authoritative 60Hz 3D Game Simulation
// Completely decoupled from DOM/WebGL so it can run identically in a future Node.js multiplayer server!

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function sanitizeName(raw) {
    if (typeof raw !== 'string') return 'BloxPlayer';
    const maxLen = (BS.SECURITY && BS.SECURITY.MAX_NAME_LEN) || 16;
    const cleaned = raw
      .replace(/[\u0000-\u001F\u007F<>"'`&\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
    return cleaned || 'BloxPlayer';
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
      this.playerMap = Object.create(null);
      this.projectiles = [];
      this.pickups = [];
      this.barrels = [];
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
      this.droppedInputs = 0;
    }

    startMatch(options = {}) {
      const opts = options && typeof options === 'object' ? options : {};
      const mapId = typeof opts.mapId === 'string' && hasOwn(BS.MAPS, opts.mapId) ? opts.mapId : 'crossroads';
      const modeId = typeof opts.modeId === 'string' && hasOwn(BS.MODES, opts.modeId) ? opts.modeId : 'tdm';
      const maxBots = (BS.SECURITY && BS.SECURITY.MAX_BOTS) || 11;
      const rawBots = Number.isFinite(opts.botCount) ? Math.floor(opts.botCount) : 7;
      const botCount = clamp(rawBots, 0, maxBots);
      const playerName = sanitizeName(opts.playerName);
      const playerSkinId = typeof opts.skinId === 'string' ? opts.skinId : 'classic';
      this.difficulty =
        opts.difficulty === 'easy' || opts.difficulty === 'hard' || opts.difficulty === 'medium'
          ? opts.difficulty
          : 'medium';

      this.map = BS.MAPS[mapId];
      this.mode = BS.MODES[modeId];

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

      // Add solid world-prop colliders into sim blocks (and register shootable explosive barrels!)
      this.barrels = [];
      const barrelMaxHp = (BS.BARREL && BS.BARREL.MAX_HP) || 45;
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
        const blockObj = {
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
          disabled: false,
        };
        if (pr.m === 'barrel') {
          const brlIdx = this.barrels.length;
          blockObj.barrelIndex = brlIdx;
          this.barrels.push({
            id: 'brl_' + brlIdx,
            x: pr.x,
            y: pr.y,
            z: pr.z,
            s,
            hp: barrelMaxHp,
            maxHp: barrelMaxHp,
            alive: true,
            respawnTimer: 0,
            fuseTimer: 0,
            fuseOwnerId: null,
            hurtFlash: 0,
            block: blockObj,
          });
        }
        this.blocks.push(blockObj);
      }

      this.pickups = this.map.pickups.map((p) => ({
        ...p,
        active: true,
        respawnTimer: 0,
      }));

      this.players = [];
      this.playerMap = Object.create(null);
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
      this.droppedInputs = 0;

      // Add local human player (or AI bot in menu demoMode)
      const localSkin = BS.SKINS.find((s) => s.id === playerSkinId) || BS.SKINS[0];
      const accessoryIds = BS.ACCESSORY_IDS || [];
      const localAcc =
        typeof opts.accessoryId === 'string' && opts.accessoryId !== 'auto' && accessoryIds.includes(opts.accessoryId)
          ? opts.accessoryId
          : localSkin.accessory || 'hair_classic';
      const weaponSkinMap = BS.WEAPON_SKIN_BY_ID || Object.create(null);
      const weaponSkinIds = BS.WEAPON_SKIN_IDS || ['default'];
      const localWeaponSkin =
        typeof opts.weaponSkinId === 'string' && weaponSkinMap[opts.weaponSkinId]
          ? opts.weaponSkinId
          : 'default';
      const localTeam = this.mode.teams ? 'blue' : 'ffa';
      const localPlayer = this._createPlayer(
        this.localPlayerId,
        playerName,
        localTeam,
        !!opts.demoMode,
        localSkin,
        localAcc,
        localWeaponSkin
      );
      this._addPlayer(localPlayer);

      // Add AI bots (each bot can use ANY weapon and rocks a random CS2 weapon finish!)
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
        const botWeaponSkin = weaponSkinIds[Math.floor(Math.random() * weaponSkinIds.length)];
        const bot = this._createPlayer(
          'bot_' + (i + 1),
          names[i % names.length],
          team,
          true,
          skin,
          botAcc,
          botWeaponSkin
        );
        this._addPlayer(bot);
      }

      // Spawn everyone cleanly
      this.players.forEach((p, idx) => this._spawnPlayer(p, idx));
    }

    _createPlayer(id, name, team, isBot, skin, accessory, weaponSkin) {
      const ammo = Object.create(null);
      BS.WEAPONS.forEach((w) => {
        ammo[w.id] = w.magSize;
      });
      const colors = this._resolveColors(team, skin);
      const randomWeapon = BS.WEAPONS[Math.floor(Math.random() * BS.WEAPONS.length)].id;
      return {
        id,
        name,
        team,
        isBot,
        colors,
        accessory: accessory || (skin && skin.accessory) || 'hair_classic',
        weaponSkin: weaponSkin || 'default',
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
        maxHp: BS.PLAYER.MAX_HP,
        shield: 0,
        alive: true,
        respawnTimer: 0,
        spawnProtect: BS.PLAYER.SPAWN_PROTECT,
        weaponId: BS.WEAPONS[0].id,
        ammo,
        fireCooldown: 0,
        reloading: false,
        reloadTimer: 0,
        reloadDuration: 1.45,
        dashTimer: 0,
        dashCooldown: 0,
        dashDirX: 0,
        dashDirZ: 0,
        crouching: false,
        sliding: false,
        slideTimer: 0,
        slideCooldown: 0,
        crouchBlend: 0,
        prevCrouch: false,
        grenadeCooldown: 0,
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
        level: 1,
        xp: 0,
        xpToNext: (BS.PROGRESSION && BS.PROGRESSION.BASE_LEVEL_XP) || 100,
        bounty: 0,
        xpAccum: 0,
        gunGameTier: 0,
        gunGameTierKills: 0,
        inputWindowTick: 0,
        inputWindowTime: 0,
        inputWindowCount: 0,
        input: {
          seq: 0,
          moveX: 0,
          moveZ: 0,
          yaw: 0,
          pitch: 0,
          jump: false,
          dash: false,
          crouch: false,
          grenade: false,
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
              desiredWeapon: randomWeapon,
              weaponSwitchTimer: 3.5 + Math.random() * 5.0,
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
      if (typeof playerId !== 'string' || !hasOwn(this.playerMap, playerId)) return false;
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return false;
      const p = this.playerMap[playerId];
      if (!p) return false;

      // Authoritative per-player input flood protection (supports up to 360Hz displays while blocking packet-spam DoS)
      const maxInputs = (BS.SECURITY && BS.SECURITY.MAX_INPUTS_PER_SEC) || 360;
      if (this.time - p.inputWindowTime >= 1.0 || this.tick - p.inputWindowTick >= BS.TICK_RATE) {
        p.inputWindowTime = this.time;
        p.inputWindowTick = this.tick;
        p.inputWindowCount = 0;
      }
      if (p.inputWindowCount >= maxInputs) {
        this.droppedInputs++;
        return false;
      }
      p.inputWindowCount++;

      if (Number.isInteger(cmd.seq) && cmd.seq >= 0) {
        p.input.seq = cmd.seq;
      }
      p.input.moveX = Number.isFinite(cmd.moveX) ? clamp(cmd.moveX, -1, 1) : 0;
      p.input.moveZ = Number.isFinite(cmd.moveZ) ? clamp(cmd.moveZ, -1, 1) : 0;
      if (typeof cmd.yaw === 'number' && Number.isFinite(cmd.yaw)) {
        p.input.yaw = Math.abs(cmd.yaw) > 1e6 ? cmd.yaw % (Math.PI * 2) : cmd.yaw;
      }
      if (typeof cmd.pitch === 'number' && Number.isFinite(cmd.pitch)) {
        p.input.pitch = clamp(cmd.pitch, -1.48, 1.48);
      }
      p.input.jump = !!cmd.jump;
      if (cmd.jump) p.input.jumpTap = true;
      if (cmd.fire) p.input.fireTap = true;
      if (cmd.dash) p.input.dash = true;
      p.input.crouch = !!cmd.crouch;
      if (cmd.grenade) p.input.grenade = true;
      p.input.fire = !!cmd.fire;
      p.input.ads = !!cmd.ads;
      if (cmd.reload) p.input.reload = true;
      if (Number.isInteger(cmd.weaponSlot) && cmd.weaponSlot >= 1 && cmd.weaponSlot <= BS.WEAPONS.length) {
        p.input.weaponSlot = cmd.weaponSlot;
      }
      return true;
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
      p.hp = p.maxHp || BS.PLAYER.MAX_HP;
      p.shield = 0;
      p.alive = true;
      p.respawnTimer = 0;
      p.spawnProtect = BS.PLAYER.SPAWN_PROTECT;
      p.reloading = false;
      p.reloadTimer = 0;
      p.fireCooldown = 0.15;
      p.dashTimer = 0;
      p.dashCooldown = 0;
      p.crouching = false;
      p.sliding = false;
      p.slideTimer = 0;
      p.slideCooldown = 0;
      p.crouchBlend = 0;
      p.prevCrouch = false;
      p.grenadeCooldown = 0;
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
        // Bots freely rotate through ALL 6 weapons on respawn!
        if (Math.random() < 0.6) {
          p.ai.desiredWeapon = BS.WEAPONS[Math.floor(Math.random() * BS.WEAPONS.length)].id;
        }
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

      // Update pickups respawn & explosive hazard barrels
      for (let i = 0; i < this.pickups.length; i++) {
        const pk = this.pickups[i];
        if (!pk.active) {
          pk.respawnTimer -= dt;
          if (pk.respawnTimer <= 0) {
            pk.active = true;
          }
        }
      }
      this._updateBarrels(dt);

      // Update bots & all players
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.alive) {
          // Allow human players to select their next weapon even during respawn countdown!
          if (!p.isBot) this._applyWeaponSlotSwitch(p);
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
        if (p.slideCooldown > 0) p.slideCooldown = Math.max(0, p.slideCooldown - dt);
        if (p.grenadeCooldown > 0) p.grenadeCooldown = Math.max(0, p.grenadeCooldown - dt);
        if (p.speedBoostTimer > 0) p.speedBoostTimer = Math.max(0, p.speedBoostTimer - dt);
        if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);

        if (p.isBot) {
          this._updateBotAI(p, dt);
        }

        // Taps latched between ticks (press+release in one tick) still count once.
        const heldFire = p.input.fire;
        const heldJump = p.input.jump;
        if (p.input.fireTap) p.input.fire = true;
        if (p.input.jumpTap) p.input.jump = true;
        this._updatePlayerMovement(p, dt);
        p.input.dash = false;
        this._updatePlayerCombat(p, dt);
        p.input.fire = heldFire;
        p.input.jump = heldJump;
        p.input.fireTap = false;
        p.input.jumpTap = false;
        p.input.reload = false;
        p.input.grenade = false;
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
        p.sliding = false;
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

      // Crouch & Power Slide ([C]) initiation (supports sprint-slides AND landing-slides!)
      const preHoriz = Math.hypot(p.vx, p.vz);
      const slideTrigger = inp.crouch && (!p.prevCrouch || p.justLanded);
      if (slideTrigger && p.grounded && !p.sliding && p.slideCooldown <= 0 && p.dashTimer <= 0 && preHoriz > 4.0) {
        p.sliding = true;
        p.crouching = true;
        p.slideTimer = BS.PLAYER.SLIDE_DURATION || 0.65;
        p.slideCooldown = BS.PLAYER.SLIDE_COOLDOWN || 0.85;
        const dirLen = preHoriz || 1;
        const sdx = wishLen > 0.2 ? (p.vx / dirLen * 0.65 + wishX * 0.35) : p.vx / dirLen;
        const sdz = wishLen > 0.2 ? (p.vz / dirLen * 0.65 + wishZ * 0.35) : p.vz / dirLen;
        const norm = Math.hypot(sdx, sdz) || 1;
        const baseSlide = (BS.PLAYER.SLIDE_SPEED || 14.4) * (p.speedBoostTimer > 0 ? 1.22 : 1.0);
        const boostSpd = Math.min(20.5, Math.max(preHoriz * 1.08, baseSlide));
        p.vx = (sdx / norm) * boostSpd;
        p.vz = (sdz / norm) * boostSpd;
        this.events.push({ type: 'slide', playerId: p.id, x: p.x, y: p.y + 0.1, z: p.z });
      }
      p.prevCrouch = !!inp.crouch;

      let speed = BS.PLAYER.MOVE_SPEED;
      const lvlTiers = Math.min(9, Math.max(0, (p.level || 1) - 1));
      if (lvlTiers > 0) speed *= 1 + lvlTiers * 0.014;
      if (inp.ads) speed *= BS.PLAYER.ADS_SPEED_MULT;
      if (p.crouching && !p.sliding) speed *= BS.PLAYER.CROUCH_SPEED_MULT || 0.6;
      if (p.weaponId === 'blade') speed *= 1.15;
      if (p.speedBoostTimer > 0) speed *= 1.38;

      const hasInput = wishLen > 1e-4;
      if (p.dashTimer > 0) {
        p.dashTimer -= dt;
        p.vx = p.dashDirX * BS.PLAYER.DASH_SPEED;
        p.vz = p.dashDirZ * BS.PLAYER.DASH_SPEED;
      } else if (p.sliding) {
        p.slideTimer -= dt;
        const sf = Math.exp(-(BS.PLAYER.SLIDE_FRICTION || 2.4) * dt);
        p.vx = p.vx * sf + wishX * 3.8 * dt;
        p.vz = p.vz * sf + wishZ * 3.8 * dt;
        if (!inp.crouch || p.slideTimer <= 0 || !p.grounded || Math.hypot(p.vx, p.vz) < (BS.PLAYER.SLIDE_MIN_SPEED || 4.5)) {
          p.sliding = false;
        }
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

      // Maintain crouch state (only stand up if ceiling has full standing headroom!)
      if (inp.crouch || p.sliding) {
        p.crouching = true;
      } else if (p.crouching) {
        if (this._hasHeadroom(p.x, p.y, p.z, BS.PLAYER.RADIUS, BS.PLAYER.HEIGHT)) {
          p.crouching = false;
        }
      }
      p.crouchBlend += ((p.crouching ? 1 : 0) - p.crouchBlend) * (1 - Math.exp(-18 * dt));

      // Coyote time + Jump buffer (with Slide-Hop momentum boost!)
      if (p.grounded) p.coyote = BS.PLAYER.COYOTE_TIME;
      else p.coyote = Math.max(0, p.coyote - dt);

      if (inp.jump) p.jumpBuffer = BS.PLAYER.JUMP_BUFFER;
      else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

      let jumpedThisTick = false;
      if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
        if (p.sliding) {
          p.sliding = false;
          const sp = Math.hypot(p.vx, p.vz);
          if (sp > 1.0) {
            const boosted = Math.min(16.8, sp + (BS.PLAYER.SLIDE_HOP_BOOST || 1.25));
            p.vx = (p.vx / sp) * boosted;
            p.vz = (p.vz / sp) * boosted;
          }
        }
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
      const curHeight = p.crouching ? BS.PLAYER.CROUCH_HEIGHT || 1.22 : BS.PLAYER.HEIGHT;
      this._moveAndCollide(p, dt, curHeight);

      // Ground snap when walking down steps/ledges
      if (p.wasGrounded && !p.grounded && !jumpedThisTick && p.vy <= 0 && p.dashTimer <= 0) {
        const R = BS.PLAYER.RADIUS;
        let bestTop = -Infinity;
        for (let i = 0; i < this.blocks.length; i++) {
          const b = this.blocks[i];
          if (b.disabled) continue;
          if (p.x + R <= b.minX || p.x - R >= b.maxX) continue;
          if (p.z + R <= b.minZ || p.z - R >= b.maxZ) continue;
          if (b.maxY <= p.y + 0.01 && b.maxY >= p.y - BS.PLAYER.STEP_DOWN) {
            if (b.maxY > bestTop) bestTop = b.maxY;
          }
        }
        if (bestTop > -Infinity && this._hasHeadroom(p.x, bestTop, p.z, R, curHeight)) {
          p.y = bestTop;
          p.vy = 0;
          p.grounded = true;
        }
      }
      // wasGrounded is overwritten below, so remember the landing for next tick's slide check.
      p.justLanded = !p.wasGrounded && p.grounded;
      p.wasGrounded = p.grounded;

      // Walk animation phase (paused cleanly during a power slide!)
      const horizSpeed = Math.hypot(p.vx, p.vz);
      if (p.grounded && !p.sliding && horizSpeed > 0.8) {
        p.walkAmp += (1 - p.walkAmp) * (1 - Math.exp(-10 * dt));
      } else {
        p.walkAmp += (0 - p.walkAmp) * (1 - Math.exp(-10 * dt));
      }
      if (p.walkAmp > 0.01) {
        p.walkPhase += dt * horizSpeed * 1.45;
        if (p.walkPhase > 1000) p.walkPhase -= Math.PI * 2 * 150;
      }
    }

    _moveAndCollide(p, dt, customHeight) {
      const R = BS.PLAYER.RADIUS;
      const H = customHeight || BS.PLAYER.HEIGHT;
      const STEP = BS.PLAYER.STEP_HEIGHT;

      // 1. Vertical axis
      p.y += p.vy * dt;
      p.grounded = false;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (b.disabled) continue;
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
        if (b.disabled) continue;
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
        if (b.disabled) continue;
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
        if (b.disabled) continue;
        if (x + R <= b.minX || x - R >= b.maxX) continue;
        if (z + R <= b.minZ || z - R >= b.maxZ) continue;
        if (y + 0.02 < b.maxY && y + H > b.minY) return false;
      }
      return true;
    }

    _applyWeaponSlotSwitch(p) {
      const inp = p.input;
      if (this.mode.id !== 'gungame' && inp.weaponSlot !== null) {
        const w = BS.WEAPONS.find((item) => item.slot === inp.weaponSlot);
        if (w && w.id !== p.weaponId) {
          p.weaponId = w.id;
          p.reloading = false;
          p.reloadTimer = 0;
          p.fireCooldown = Math.max(p.fireCooldown, 0.07);
          this.events.push({ type: 'weaponSwitch', playerId: p.id, weaponId: w.id, slot: w.slot });
        }
        inp.weaponSlot = null;
      }
    }

    _updatePlayerCombat(p, dt) {
      const inp = p.input;

      // Weapon switching (disabled in Gun Game since tier dictates weapon)
      this._applyWeaponSlotSwitch(p);

      const w = BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0];

      // Handle Reload (scales 3% faster per level above 1!)
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
        const lvlTiers = Math.min(9, Math.max(0, (p.level || 1) - 1));
        const reloadDur = w.reloadTime / (1 + lvlTiers * 0.03);
        p.reloading = true;
        p.reloadTimer = reloadDur;
        p.reloadDuration = reloadDur;
        this.events.push({ type: 'reload', playerId: p.id, weaponId: w.id });
      }

      // Tactical Frag Blox Grenade ([G]) — usable anytime off cooldown without interrupting weapon state!
      if (inp.grenade && p.grenadeCooldown <= 0) {
        this._throwGrenade(p);
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

    _getEyeHeight(p) {
      const crouchEye = BS.PLAYER.CROUCH_EYE_HEIGHT || 0.96;
      return BS.PLAYER.EYE_HEIGHT + (crouchEye - BS.PLAYER.EYE_HEIGHT) * (p.crouchBlend || 0);
    }

    _throwGrenade(p) {
      const gCfg = BS.GRENADE || {};
      p.grenadeCooldown = gCfg.COOLDOWN || 7.0;
      p.spawnProtect = 0;

      const ox = p.x;
      const oy = p.y + this._getEyeHeight(p) - 0.08;
      const oz = p.z;
      const cp = Math.cos(p.pitch);
      const sp = Math.sin(p.pitch);
      const sy = Math.sin(p.yaw);
      const cy = Math.cos(p.yaw);
      const dx = sy * cp;
      const dy = sp;
      const dz = -cy * cp;

      if (this.projectiles.length < 48) {
        const throwSpd = gCfg.THROW_SPEED || 21.5;
        const upVel = gCfg.UP_VEL || 4.2;
        this.projectiles.push({
          id: this.nextProjId++,
          kind: 'grenade',
          ownerId: p.id,
          weaponId: 'grenade',
          x: ox + dx * 0.65,
          y: oy + dy * 0.65,
          z: oz + dz * 0.65,
          vx: dx * throwSpd + p.vx * 0.25,
          vy: dy * throwSpd + upVel,
          vz: dz * throwSpd + p.vz * 0.25,
          gravity: gCfg.GRAVITY || 22.0,
          bounce: gCfg.BOUNCE || 0.52,
          life: gCfg.FUSE || 1.55,
          splashRadius: gCfg.SPLASH_RADIUS || 6.2,
          damage: gCfg.DAMAGE || 95,
          knockback: gCfg.KNOCKBACK || 15.5,
          selfDmgMult: gCfg.SELF_DMG_MULT || 0.3,
        });
      }
      this.events.push({ type: 'grenadeThrow', playerId: p.id, x: ox, y: oy, z: oz });
    }

    _fireWeapon(p, w) {
      p.fireCooldown = 1 / w.fireRate;
      p.recoilKick = Math.min(1, p.recoilKick + w.recoilKick * 2.2);
      p.spawnProtect = 0; // Shooting ends spawn protection

      if (w.type !== 'melee') {
        p.ammo[w.id] = Math.max(0, p.ammo[w.id] - 1);
      }

      const ox = p.x;
      const oy = p.y + this._getEyeHeight(p);
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
            // No swinging through walls.
            if (dot > 0.52 && !this.raycastBlocks(ox, oy, oz, dx / dist, dy / dist, dz / dist, dist).hit) {
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
        // Hard cap active projectiles to prevent entity-flood DoS
        if (this.projectiles.length < 48) {
          const proj = {
            id: this.nextProjId++,
            kind: 'rocket',
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
            selfDmgMult: 0.35,
          };
          this.projectiles.push(proj);
        }
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

      // Hitscan weapon (AR, SMG, Shotgun, Railgun Sniper) — crouching tightens hipfire spread by 35%!
      const crouchMult = p.crouching && !p.input.ads ? 0.65 : 1.0;
      const spread = (p.input.ads ? w.adsSpread : w.spread) * crouchMult;
      const hits = [];
      const dmgAccum = Object.create(null);
      const barrelDmgAccum = Object.create(null);

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
          hitBarrel: res.barrelIndex !== null,
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
        } else if (res.barrelIndex !== null) {
          barrelDmgAccum[res.barrelIndex] = (barrelDmgAccum[res.barrelIndex] || 0) + w.damage;
        }
      }

      Object.keys(dmgAccum).forEach((id) => {
        const d = dmgAccum[id];
        this._applyDamage(p, d.player, d.damage, w.id, d.headshot, d.x, d.y, d.z);
      });
      Object.keys(barrelDmgAccum).forEach((bIdx) => {
        const brl = this.barrels[Number(bIdx)];
        if (brl && brl.alive) this._damageBarrel(brl, barrelDmgAccum[bIdx], p.id);
      });

      this.events.push({
        type: 'shoot',
        shooterId: p.id,
        weaponId: w.id,
        ox,
        oy,
        oz,
        yaw: p.yaw,
        pitch: p.pitch,
        hits,
      });
    }

    raycastBlocks(ox, oy, oz, dx, dy, dz, maxDist) {
      let best = maxDist;
      let hit = false;
      let hitBlock = null;
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (b.disabled) continue;
        const t = rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
        if (t >= 0 && t < best) {
          best = t;
          hit = true;
          hitBlock = b;
        }
      }
      return { dist: best, hit, block: hitBlock };
    }

    raycastWorldAndPlayers(ox, oy, oz, dx, dy, dz, maxDist, shooter) {
      const worldHit = this.raycastBlocks(ox, oy, oz, dx, dy, dz, maxDist);
      let bestDist = worldHit.dist;
      let hitPlayer = null;
      let headshot = false;
      let barrelIndex =
        worldHit.hit && worldHit.block && worldHit.block.barrelIndex !== undefined
          ? worldHit.block.barrelIndex
          : null;

      for (let i = 0; i < this.players.length; i++) {
        const other = this.players[i];
        if (!other.alive || !this._isEnemy(shooter, other)) continue;
        const pHeight = other.crouching ? BS.PLAYER.CROUCH_HEIGHT || 1.22 : BS.PLAYER.HEIGHT;
        const pHeadMin = other.crouching ? BS.PLAYER.CROUCH_HEAD_MIN_Y || 0.78 : BS.PLAYER.HEAD_MIN_Y;

        // Check head hitbox first (adapts dynamically when target is crouching/sliding!)
        const ht = rayAABB(
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
          other.x - 0.34,
          other.y + pHeadMin,
          other.z - 0.34,
          other.x + 0.34,
          other.y + pHeight + 0.08,
          other.z + 0.34,
          bestDist
        );
        if (ht >= 0 && ht < bestDist) {
          bestDist = ht;
          hitPlayer = other;
          headshot = true;
          barrelIndex = null;
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
          other.y + pHeadMin + 0.06,
          other.z + 0.48,
          bestDist
        );
        if (bt >= 0 && bt < bestDist) {
          bestDist = bt;
          hitPlayer = other;
          headshot = false;
          barrelIndex = null;
        }
      }

      return {
        dist: bestDist,
        x: ox + dx * bestDist,
        y: oy + dy * bestDist,
        z: oz + dz * bestDist,
        player: hitPlayer,
        barrelIndex,
        headshot,
      };
    }

    _updateBarrels(dt) {
      for (let i = 0; i < this.barrels.length; i++) {
        const brl = this.barrels[i];
        if (brl.hurtFlash > 0) brl.hurtFlash = Math.max(0, brl.hurtFlash - dt * 4.5);
        if (brl.alive) {
          if (brl.fuseTimer > 0) {
            brl.fuseTimer -= dt;
            brl.hurtFlash = 1.0;
            if (brl.fuseTimer <= 0) {
              this._detonateBarrel(brl, brl.fuseOwnerId);
            }
          }
        } else {
          brl.respawnTimer -= dt;
          if (brl.respawnTimer <= 0) {
            // Ensure no alive player is standing inside the barrel spawn footprint
            let clear = true;
            for (let j = 0; j < this.players.length; j++) {
              const p = this.players[j];
              if (p.alive && Math.hypot(p.x - brl.x, p.z - brl.z) < 1.15 && Math.abs(p.y - brl.y) < 2.0) {
                clear = false;
                break;
              }
            }
            if (clear) {
              brl.alive = true;
              brl.hp = brl.maxHp;
              brl.hurtFlash = 0;
              brl.fuseTimer = 0;
              brl.block.disabled = false;
            } else {
              brl.respawnTimer = 0.75;
            }
          }
        }
      }
    }

    _damageBarrel(brl, dmg, attackerId) {
      if (!brl || !brl.alive) return;
      brl.hp -= dmg;
      brl.hurtFlash = 1.0;
      if (brl.hp <= 0) {
        this._detonateBarrel(brl, attackerId);
      }
    }

    _detonateBarrel(brl, attackerId) {
      if (!brl || !brl.alive) return;
      brl.alive = false;
      brl.fuseTimer = 0;
      brl.respawnTimer = (BS.BARREL && BS.BARREL.RESPAWN_TIME) || 14.0;
      brl.block.disabled = true;
      const bCfg = BS.BARREL || {};
      this.events.push({
        type: 'barrelExplode',
        id: brl.id,
        x: brl.x,
        y: brl.y + 0.65,
        z: brl.z,
        attackerId: attackerId || null,
      });
      this._explode(brl.x, brl.y + 0.65, brl.z, {
        ownerId: attackerId || null,
        weaponId: 'barrel',
        splashRadius: bCfg.SPLASH_RADIUS || 6.8,
        damage: bCfg.DAMAGE || 115,
        knockback: bCfg.KNOCKBACK || 18.0,
        selfDmgMult: 0.35,
      });
    }

    _updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.life -= dt;
        const owner = this.playerMap[pr.ownerId];

        if (pr.kind === 'grenade') {
          pr.vy -= (pr.gravity || 22.0) * dt;
          // Direct enemy impact check -> instant detonation!
          let directHit = false;
          for (let j = 0; j < this.players.length; j++) {
            const pl = this.players[j];
            if (!pl.alive || pl.id === pr.ownerId) continue;
            if (owner && !this._isEnemy(owner, pl)) continue;
            if (Math.hypot(pl.x - pr.x, pl.y + 0.95 - pr.y, pl.z - pr.z) < 0.85) {
              directHit = true;
              break;
            }
          }
          if (directHit || pr.life <= 0 || pr.y < this.map.voidY) {
            if (pr.y >= this.map.voidY) this._explode(pr.x, pr.y, pr.z, pr);
            this.projectiles.splice(i, 1);
            continue;
          }

          // Bouncy 3-axis AABB physics against world blocks & barrels
          const R = 0.16;
          const bnc = pr.bounce || 0.52;
          let bounced = false;
          let impactSpd = 0;

          const oldY = pr.y;
          pr.y += pr.vy * dt;
          for (let k = 0; k < this.blocks.length; k++) {
            const b = this.blocks[k];
            if (b.disabled) continue;
            if (pr.x + R <= b.minX || pr.x - R >= b.maxX || pr.z + R <= b.minZ || pr.z - R >= b.maxZ) continue;
            if (pr.y - R < b.maxY && pr.y + R > b.minY) {
              impactSpd = Math.max(impactSpd, Math.abs(pr.vy));
              if (oldY >= b.maxY) {
                pr.y = b.maxY + R;
                pr.vy = Math.abs(pr.vy) * bnc;
                if (pr.vy < 1.1) pr.vy = 0;
                pr.vx *= 0.84;
                pr.vz *= 0.84;
              } else {
                pr.y = b.minY - R;
                pr.vy = -Math.abs(pr.vy) * bnc;
              }
              bounced = true;
            }
          }

          const oldX = pr.x;
          pr.x += pr.vx * dt;
          for (let k = 0; k < this.blocks.length; k++) {
            const b = this.blocks[k];
            if (b.disabled) continue;
            if (pr.y - R >= b.maxY || pr.y + R <= b.minY || pr.z + R <= b.minZ || pr.z - R >= b.maxZ) continue;
            if (pr.x + R > b.minX && pr.x - R < b.maxX) {
              impactSpd = Math.max(impactSpd, Math.abs(pr.vx));
              pr.x = oldX < b.minX ? b.minX - R : b.maxX + R;
              pr.vx = -pr.vx * bnc;
              bounced = true;
            }
          }

          const oldZ = pr.z;
          pr.z += pr.vz * dt;
          for (let k = 0; k < this.blocks.length; k++) {
            const b = this.blocks[k];
            if (b.disabled) continue;
            if (pr.y - R >= b.maxY || pr.y + R <= b.minY || pr.x + R <= b.minX || pr.x - R >= b.maxX) continue;
            if (pr.z + R > b.minZ && pr.z - R < b.maxZ) {
              impactSpd = Math.max(impactSpd, Math.abs(pr.vz));
              pr.z = oldZ < b.minZ ? b.minZ - R : b.maxZ + R;
              pr.vz = -pr.vz * bnc;
              bounced = true;
            }
          }

          if (bounced && impactSpd > 2.6) {
            this.events.push({ type: 'grenadeBounce', x: pr.x, y: pr.y, z: pr.z });
          }
          continue;
        }

        const speed = Math.hypot(pr.vx, pr.vy, pr.vz);
        const stepDist = speed * dt;
        const dx = pr.vx / (speed || 1);
        const dy = pr.vy / (speed || 1);
        const dz = pr.vz / (speed || 1);

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
      const owner = pr.ownerId ? this.playerMap[pr.ownerId] || null : null;
      this.events.push({
        type: 'explosion',
        x: ex,
        y: ey,
        z: ez,
        radius: pr.splashRadius,
        ownerId: pr.ownerId,
        weaponId: pr.weaponId,
      });

      // Chain-react any nearby alive explosive hazard barrels!
      const chainDelay = (BS.BARREL && BS.BARREL.CHAIN_DELAY) || 0.14;
      for (let b = 0; b < this.barrels.length; b++) {
        const brl = this.barrels[b];
        if (!brl.alive) continue;
        const bd = Math.hypot(brl.x - ex, brl.y + 0.6 - ey, brl.z - ez);
        if (bd <= pr.splashRadius + 0.5) {
          if (bd < 1.1) {
            this._detonateBarrel(brl, pr.ownerId);
          } else if (brl.fuseTimer <= 0) {
            brl.fuseOwnerId = pr.ownerId || null;
            brl.fuseTimer = chainDelay;
          }
        }
      }

      const selfMult = pr.selfDmgMult !== undefined ? pr.selfDmgMult : 0.35;
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
          pl.vy += Math.max(4.5, dy * inv * kb + 5.0); // Rocket / Grenade jumping works!!

          const dmg = Math.round(pr.damage * (0.35 + 0.65 * falloff) * (isSelf ? selfMult : 1.0));
          if (dmg > 0) {
            this._applyDamage(isSelf ? null : owner, pl, dmg, pr.weaponId || 'rocket', false, pl.x, pl.y + 1.0, pl.z);
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

    _xpRequiredForLevel(level) {
      const cfg = BS.PROGRESSION || {};
      const base = cfg.BASE_LEVEL_XP || 100;
      const step = cfg.XP_PER_LEVEL_STEP || 35;
      return base + Math.max(0, level - 1) * step;
    }

    _grantXP(p, amount, reason = 'kill') {
      if (!p || amount <= 0) return;
      const maxLvl = (BS.PROGRESSION && BS.PROGRESSION.MAX_LEVEL) || 25;
      if (p.level >= maxLvl) return;
      p.xp += amount;

      while (p.xp >= p.xpToNext && p.level < maxLvl) {
        p.xp -= p.xpToNext;
        p.level++;
        p.xpToNext = this._xpRequiredForLevel(p.level);
        const bonusTiers = Math.min(9, p.level - 1);
        p.maxHp = BS.PLAYER.MAX_HP + bonusTiers * 4;
        if (p.alive) {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          p.shield = Math.min(BS.PLAYER.MAX_SHIELD, p.shield + 20);
        }
        this.events.push({
          type: 'levelUp',
          playerId: p.id,
          playerName: p.name,
          playerTeam: p.team,
          level: p.level,
          maxHp: p.maxHp,
          reason,
        });
      }
    }

    _killPlayer(victim, killer, weaponId, headshot) {
      if (!victim.alive) return;
      const victimBounty = victim.bounty || 0;
      victim.alive = false;
      victim.deaths++;
      victim.streak = 0;
      victim.bounty = 0;
      victim.respawnTimer = BS.PLAYER.RESPAWN_TIME;

      const prog = BS.PROGRESSION || {};
      let streak = 0;
      let xpEarned = 0;
      let bountyClaimed = 0;

      if (killer && killer.id !== victim.id) {
        killer.kills++;
        killer.streak++;
        if (killer.streak > killer.bestStreak) killer.bestStreak = killer.streak;
        killer.score += headshot ? 125 : 100;
        streak = killer.streak;

        // Small heal-on-kill momentum (RIVALS / Arsenal vibe!)
        const killerMaxHp = killer.maxHp || BS.PLAYER.MAX_HP;
        killer.hp = Math.min(killerMaxHp, killer.hp + 15);

        // Award kill XP + headshot bonus + notoriety bonus
        xpEarned = (prog.KILL_XP || 60) + (headshot ? prog.HEADSHOT_BONUS_XP || 25 : 0);
        if (killer.bounty > 0) {
          xpEarned += prog.NOTORIETY_KILL_XP || 15;
        }

        // Shutdown! Claim the victim's active killstreak bounty for massive bonus XP & score!
        if (victimBounty > 0) {
          bountyClaimed = victimBounty;
          xpEarned += victimBounty;
          const scoreBonus = Math.round(victimBounty * 0.75);
          killer.score += scoreBonus;
          this.events.push({
            type: 'bountyClaimed',
            killerId: killer.id,
            killerName: killer.name,
            killerTeam: killer.team,
            victimId: victim.id,
            victimName: victim.name,
            victimTeam: victim.team,
            bounty: victimBounty,
            scoreBonus,
          });
        }

        // Place or escalate Bounty on players/bots who reach 3+ streak!
        const minStreak = prog.BOUNTY_MIN_STREAK || 3;
        if (killer.streak >= minStreak) {
          const prevBounty = killer.bounty || 0;
          const newBounty = Math.min(
            prog.BOUNTY_MAX_XP || 350,
            (prog.BOUNTY_BASE_XP || 90) + (killer.streak - minStreak) * (prog.BOUNTY_PER_EXTRA_KILL || 40)
          );
          killer.bounty = newBounty;
          if (prevBounty === 0 || killer.streak === 5 || killer.streak === 8) {
            this.events.push({
              type: 'bountyPlaced',
              playerId: killer.id,
              playerName: killer.name,
              playerTeam: killer.team,
              streak: killer.streak,
              bounty: newBounty,
            });
          }
        }

        this._grantXP(killer, xpEarned, bountyClaimed > 0 ? 'bounty' : 'kill');

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
        // Null killer = void fall or self-damage (own rocket/grenade): credit the void only for falls.
        killerName: killer ? killer.name : weaponId === 'void' ? 'THE VOID' : victim.name,
        killerTeam: killer ? killer.team : weaponId === 'void' ? 'void' : victim.team,
        victimId: victim.id,
        victimName: victim.name,
        victimTeam: victim.team,
        weaponId,
        headshot,
        streak,
        xpEarned,
        bountyClaimed,
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
          const maxHp = p.maxHp || BS.PLAYER.MAX_HP;
          if (pk.type === 'health' && p.hp < maxHp) {
            p.hp = Math.min(maxHp, p.hp + 45);
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
      const capturers = [];
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.alive) continue;
        const d = Math.hypot(p.x - zone.x, p.z - zone.z);
        if (d <= zone.radius && Math.abs(p.y - zone.y) < 2.4) {
          if (p.team === 'blue') blueIn++;
          else if (p.team === 'red') redIn++;
          capturers.push(p);
        }
      }

      if (blueIn > 0 && redIn > 0) {
        this.kothOwner = 'contested';
      } else if (blueIn > 0) {
        this.kothOwner = 'blue';
        const xpRate = (BS.PROGRESSION && BS.PROGRESSION.KOTH_XP_PER_SEC) || 8;
        for (let i = 0; i < capturers.length; i++) {
          const cp = capturers[i];
          cp.xpAccum = (cp.xpAccum || 0) + dt * xpRate;
          if (cp.xpAccum >= 10) {
            cp.xpAccum -= 10;
            this._grantXP(cp, 10, 'koth');
          }
        }
        this.scores.blue = Math.min(this.mode.scoreLimit, this.scores.blue + dt * (2.6 + blueIn * 0.7));
        if (this.scores.blue >= this.mode.scoreLimit) {
          this._finishMatch('BLUE TEAM', 'Captured & held the Blox Zone!');
        }
      } else if (redIn > 0) {
        this.kothOwner = 'red';
        const xpRate = (BS.PROGRESSION && BS.PROGRESSION.KOTH_XP_PER_SEC) || 8;
        for (let i = 0; i < capturers.length; i++) {
          const cp = capturers[i];
          cp.xpAccum = (cp.xpAccum || 0) + dt * xpRate;
          if (cp.xpAccum >= 10) {
            cp.xpAccum -= 10;
            this._grantXP(cp, 10, 'koth');
          }
        }
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
      ai.weaponSwitchTimer -= dt;
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
      if (!bot.sliding) inp.crouch = false;
      inp.grenade = false;
      inp.fire = false;
      inp.ads = false;
      inp.reload = false;

      // Dynamic all-weapon selection (bots can use any of the 6 weapons freely outside Gun Game!)
      if (this.mode.id !== 'gungame') {
        let pickPool = null;
        if (target && bot.weaponId === 'rocket' && targetDist < 4.8) {
          // Don't blow yourself up at point-blank range
          pickPool = ['shotgun', 'smg', 'blade'];
        } else if (target && bot.reloading && targetDist < 9.5) {
          // Quick-swap to a loaded close-range weapon mid-fight
          pickPool = ['blade', 'shotgun', 'smg', 'ar'].filter(
            (id) => id !== bot.weaponId && (id === 'blade' || bot.ammo[id] > 0)
          );
        } else if (ai.weaponSwitchTimer <= 0) {
          if (target) {
            if (targetDist < 5.5) pickPool = ['blade', 'shotgun', 'smg', 'ar'];
            else if (targetDist < 16) pickPool = ['ar', 'smg', 'shotgun', 'rocket', 'blade'];
            else if (targetDist < 28) pickPool = ['ar', 'rocket', 'sniper', 'smg'];
            else pickPool = ['sniper', 'ar', 'rocket'];
            ai.weaponSwitchTimer = 4.0 + Math.random() * 5.5;
          } else {
            // Roaming: pick any of the 6 weapons freely
            pickPool = BS.WEAPONS.map((w) => w.id);
            ai.weaponSwitchTimer = 6.0 + Math.random() * 7.0;
          }
        }
        if (pickPool && pickPool.length > 0) {
          const nextId = pickPool[Math.floor(Math.random() * pickPool.length)];
          const nextW = BS.WEAPON_BY_ID[nextId];
          if (nextW && nextW.id !== bot.weaponId) {
            inp.weaponSlot = nextW.slot;
            ai.desiredWeapon = nextW.id;
          }
        }
      }

      if (target) {
        const w = BS.WEAPON_BY_ID[bot.weaponId] || BS.WEAPONS[0];
        // Aim at target (slightly lower for RPG splash hits, chest/head for hitscan)
        const aimYOff = w.id === 'rocket' ? 0.35 : 1.15;
        const dx = target.x - bot.x;
        const dy = target.y + aimYOff - eyeY;
        const dz = target.z - bot.z;
        const horiz = Math.hypot(dx, dz) || 0.001;
        const wobble = Math.sin(this.time * 4.7 + bot.id.length * 3) * diffCfg.inaccuracy;
        const desiredYaw = Math.atan2(dx, -dz) + wobble;
        const desiredPitch = clamp(Math.atan2(dy, horiz) + wobble * 0.5, -1.1, 1.1);

        const aimBlend = 1 - Math.exp(-diffCfg.aimSpeed * dt);
        inp.yaw = lerpAngle(bot.yaw, desiredYaw, aimBlend);
        inp.pitch = bot.pitch + (desiredPitch - bot.pitch) * aimBlend;

        const idealDist =
          w.type === 'melee'
            ? 1.6
            : w.id === 'shotgun'
            ? 7.5
            : w.id === 'sniper'
            ? 24
            : w.id === 'rocket'
            ? 15
            : 13;

        if (w.type === 'melee') {
          inp.moveZ = 1.0;
          inp.moveX = ai.strafeDir * 0.35;
          if (targetDist > 4.5 && targetDist < 14 && bot.dashCooldown <= 0) inp.dash = true;
        } else {
          inp.moveZ = targetDist > idealDist + 3 ? 1 : targetDist < idealDist - 4 ? -0.65 : 0.15;
          inp.moveX = ai.strafeDir * 0.78;
        }

        // Avoid stepping into the void on Skyblox
        if (!this._hasGroundAhead(bot, inp.yaw, inp.moveX, inp.moveZ)) {
          inp.moveZ = -0.6;
          inp.moveX = 0;
        }

        // Fire when aimed & within effective range (properly tap-firing semi-auto guns!)
        // atan2 wraps to [-π, π]; JS % keeps the sign and broke aim checks across the ±π seam.
        const yawErr = desiredYaw - inp.yaw;
        let angleDiff = Math.abs(Math.atan2(Math.sin(yawErr), Math.cos(yawErr)));
        const inRange = w.type === 'melee' ? targetDist <= w.range + 0.9 : targetDist <= w.range;
        const safeRpg = w.id !== 'rocket' || targetDist >= 4.0;
        const canTrigger = w.fireMode === 'auto' || (!bot.prevFire && bot.fireCooldown <= 0);
        if (inRange && safeRpg && canTrigger && angleDiff < 0.28 && Math.random() < diffCfg.fireChance) {
          inp.fire = true;
        }
        if (targetDist > 7.5 && targetDist < 22 && bot.grenadeCooldown <= 0 && angleDiff < 0.35 && Math.random() < 0.42 * dt) {
          inp.grenade = true;
        }
        if (Math.random() < 0.38 * dt && bot.grounded && Math.hypot(bot.vx, bot.vz) > 4.5 && bot.slideCooldown <= 0) {
          inp.crouch = true;
        }
        if (Math.random() < 0.48 * dt && bot.grounded) inp.jump = true;
        if (Math.random() < 0.3 * dt && bot.dashCooldown <= 0) inp.dash = true;
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
        inp.yaw = lerpAngle(bot.yaw, desiredYaw, 1 - Math.exp(-6.0 * dt));
        inp.pitch = bot.pitch * Math.exp(-6.0 * dt);
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
      const players = Object.create(null);
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        players[p.id] = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, alive: p.alive };
      }
      const projectiles = Object.create(null);
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
          weaponSkin: p.weaponSkin,
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
          maxHp: p.maxHp || BS.PLAYER.MAX_HP,
          shield: p.shield,
          alive: p.alive,
          respawnTimer: p.respawnTimer,
          spawnProtect: p.spawnProtect,
          weaponId: p.weaponId,
          ammo: p.ammo[p.weaponId],
          magSize: (BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0]).magSize,
          reloading: p.reloading,
          reloadProgress: p.reloading
            ? 1 - p.reloadTimer / (p.reloadDuration || (BS.WEAPON_BY_ID[p.weaponId] || BS.WEAPONS[0]).reloadTime)
            : 0,
          dashCooldown: p.dashCooldown,
          crouching: !!p.crouching,
          sliding: !!p.sliding,
          crouchBlend: p.crouchBlend || 0,
          slideCooldown: p.slideCooldown || 0,
          grenadeCooldown: p.grenadeCooldown || 0,
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
          level: p.level || 1,
          xp: Math.floor(p.xp || 0),
          xpToNext: p.xpToNext || 100,
          bounty: p.bounty || 0,
          gunGameTier: p.gunGameTier,
        })),
        projectiles: this.projectiles.map((pr) => ({
          id: pr.id,
          kind: pr.kind || 'rocket',
          x: pr.x,
          y: pr.y,
          z: pr.z,
          vx: pr.vx,
          vy: pr.vy,
          vz: pr.vz,
          life: pr.life,
        })),
        barrels: this.barrels.map((brl) => ({
          id: brl.id,
          x: brl.x,
          y: brl.y,
          z: brl.z,
          s: brl.s || 1,
          alive: brl.alive,
          hurtFlash: brl.hurtFlash || 0,
          fusing: brl.fuseTimer > 0,
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
