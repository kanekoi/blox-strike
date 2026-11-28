// Blox Strike - Client Controller (Input, Camera, HUD, 2D Overlay, Audio, Menus)

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  const STREAK_LABELS = {
    2: 'DOUBLE KILL!',
    3: 'TRIPLE KILL!',
    4: 'QUADRA KILL!',
    5: 'BLOX RAMPAGE!',
    6: 'UNSTOPPABLE!',
    8: 'GODLIKE BLOXXER!',
  };

  class BloxStrikeClient {
    constructor() {
      this.canvas3d = document.getElementById('game-canvas');
      this.canvas2d = document.getElementById('overlay-canvas');
      this.ctx2d = this.canvas2d.getContext('2d');
      this.minimapCanvas = document.getElementById('minimap-canvas');
      this.minimapCtx = this.minimapCanvas.getContext('2d');

      this.renderer = new BS.Renderer3D(this.canvas3d);
      this.audio = new BS.SoundEngine();
      this.sim = new BS.GameSim();
      this.transport = new BS.LocalLoopbackTransport(this.sim);
      this.localTransport = this.transport; // menu demo always runs locally, even in LAN mode

      // State
      this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'matchOver'
      this.localId = null;
      this.snapshot = null;
      this.seq = 0;

      // View angles (client-owned for zero-latency mouse feel)
      this.yaw = 0;
      this.pitch = 0;
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.camFootY = null;
      this.stepOffsetY = 0;
      this.lastGroundedY = null;
      this.wasGroundedCam = false;
      this.swayTargetX = 0;
      this.swayTargetY = 0;
      this.swayX = 0;
      this.swayY = 0;
      this.inspectTimer = 0;
      this.inspectDuration = 2.2;
      this.equipTimer = 0;
      this.equipDuration = 0.16;
      this.lastWheelTime = 0;
      this.skipMouseEvents = 0;
      this.defaultPauseHint = 'Press RESUME to lock mouse and jump right back in.';
      this.pointerLocked = false;
      this.keys = {};
      this.mouseDown = { left: false, right: false };
      this.pendingFire = false;
      this.pendingJump = false;
      this.desiredWeaponSlot = null;
      this.lastWeaponSlot = 2;
      this.currentWeaponSlot = 1;
      this.pendingDash = false;
      this.pendingGrenade = false;
      this.pendingReload = false;
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
      this.hotbarSlots = [];
      this._hudState = Object.create(null);

      // Cache frequently updated HUD DOM nodes once to avoid per-frame DOM lookups
      this.hudEls = {
        hitmarker: document.getElementById('hitmarker'),
        vignette: document.getElementById('damage-vignette'),
        banner: document.getElementById('announce-banner'),
        scope: document.getElementById('sniper-scope'),
        crosshair: document.getElementById('crosshair'),
        timer: document.getElementById('hud-timer'),
        modeLabel: document.getElementById('hud-mode-label'),
        scoreBlue: document.getElementById('score-blue'),
        scoreRed: document.getElementById('score-red'),
        levelBadge: document.getElementById('level-badge'),
        xpFill: document.getElementById('xp-fill'),
        xpLabel: document.getElementById('xp-label'),
        bountyPill: document.getElementById('bounty-pill'),
        hpFill: document.getElementById('hp-fill'),
        hpVal: document.getElementById('hp-val'),
        shieldFill: document.getElementById('shield-fill'),
        shieldVal: document.getElementById('shield-val'),
        dashFill: document.getElementById('dash-fill'),
        dashLabel: document.getElementById('dash-label'),
        grenadeFill: document.getElementById('grenade-fill'),
        grenadeLabel: document.getElementById('grenade-label'),
        speedPill: document.getElementById('speed-pill'),
        weaponSkinBadge: document.getElementById('weapon-skin-badge'),
        weaponName: document.getElementById('weapon-name'),
        ammoCur: document.getElementById('ammo-cur'),
        ammoMax: document.getElementById('ammo-max'),
        reloadWrap: document.getElementById('reload-wrap'),
        reloadFill: document.getElementById('reload-fill'),
        respawnOverlay: document.getElementById('respawn-overlay'),
        respawnTimer: document.getElementById('respawn-timer'),
      };

      // Settings persisted to localStorage (strictly validated against whitelists)
      this.settings = this._loadSettings();

      // Dynamic HUD FX
      this.floatingNumbers = [];
      this.damageIndicators = []; // { x, z, life }
      this.hitmarkerTimer = 0;
      this.hitmarkerCrit = false;
      this.hurtVignette = 0;
      this.bannerTimer = 0;
      this.footstepAccum = 0;
      this.wasAlive = true;

      // Dev URL parameters for quick visual testing (?autostart=1&cam=3&wskin=asiimov&inspect=1&weapon=4)
      const params = new URLSearchParams(window.location.search);
      this.forceAds = params.get('ads') === '1';
      // ?lan=1 (set automatically by server.js) joins the shared match on the LAN server instead of a solo game
      this.lanMode = params.get('lan') === '1';
      const qWskin = params.get('wskin');
      if (qWskin && BS.WEAPON_SKIN_BY_ID && BS.WEAPON_SKIN_BY_ID[qWskin]) {
        this.settings.weaponSkinId = qWskin;
      }

      this._bindTransport();
      this._bindUI();
      this._bindInput();
      this._resize2D();

      // Start animated background arena demo right on the main menu!
      this._startMenuDemo();

      if (params.get('cam') === '3') {
        this.renderer.thirdPerson = true;
        document.getElementById('cam-mode-pill').textContent = '3RD PERSON [V]';
      }
      if (params.get('autostart') === '1') {
        const qWeapon = parseInt(params.get('weapon') || '', 10);
        const qInspect = params.get('inspect') === '1';
        setTimeout(() => {
          if (this.state === 'menu') {
            this.startNewMatch();
            if (Number.isInteger(qWeapon) && qWeapon >= 1 && qWeapon <= BS.WEAPONS.length) {
              this._selectWeaponSlot(qWeapon);
            }
            if (qInspect) {
              this.inspectTimer = this.inspectDuration * 0.65;
            }
          }
        }, 300);
      }

      this.lastTime = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    _sanitizePlayerName(raw) {
      if (typeof raw !== 'string') return 'BloxPlayer';
      const cleaned = raw
        .replace(/[\u0000-\u001F\u007F<>"'`&\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 16);
      return cleaned || 'BloxPlayer';
    }

    _loadSettings() {
      const defaults = {
        playerName: 'BloxPlayer',
        mapId: 'crossroads',
        modeId: 'tdm',
        botCount: 7,
        difficulty: 'medium',
        skinId: 'classic',
        accessoryId: 'auto',
        weaponSkinId: 'default',
        sensitivity: 0.0022,
        volume: 0.6,
      };
      try {
        const raw = localStorage.getItem('blox_strike_settings');
        if (!raw || raw.length > 4096) return defaults;
        const saved = JSON.parse(raw, (k, v) =>
          k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v
        );
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;

        const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
        const mapId = typeof saved.mapId === 'string' && own(BS.MAPS, saved.mapId) ? saved.mapId : defaults.mapId;
        const modeId = typeof saved.modeId === 'string' && own(BS.MODES, saved.modeId) ? saved.modeId : defaults.modeId;
        const botCount = Number.isFinite(saved.botCount)
          ? Math.max(1, Math.min(11, Math.round(saved.botCount)))
          : defaults.botCount;
        const difficulty =
          saved.difficulty === 'easy' || saved.difficulty === 'medium' || saved.difficulty === 'hard'
            ? saved.difficulty
            : defaults.difficulty;
        const skinId = BS.SKINS.some((s) => s.id === saved.skinId) ? saved.skinId : defaults.skinId;
        const accessoryId =
          saved.accessoryId === 'auto' || (BS.ACCESSORY_IDS && BS.ACCESSORY_IDS.includes(saved.accessoryId))
            ? saved.accessoryId
            : defaults.accessoryId;
        const weaponSkinId =
          typeof saved.weaponSkinId === 'string' && BS.WEAPON_SKIN_BY_ID && BS.WEAPON_SKIN_BY_ID[saved.weaponSkinId]
            ? saved.weaponSkinId
            : defaults.weaponSkinId;
        const sensitivity = Number.isFinite(saved.sensitivity)
          ? Math.max(0.00055, Math.min(0.0055, saved.sensitivity)) // slider range: 25%–250% of 0.0022
          : defaults.sensitivity;
        const volume = Number.isFinite(saved.volume)
          ? Math.max(0, Math.min(1, saved.volume))
          : defaults.volume;

        return {
          playerName: this._sanitizePlayerName(saved.playerName),
          mapId,
          modeId,
          botCount,
          difficulty,
          skinId,
          accessoryId,
          weaponSkinId,
          sensitivity,
          volume,
        };
      } catch {
        return defaults;
      }
    }

    _saveSettings() {
      try {
        localStorage.setItem('blox_strike_settings', JSON.stringify(this.settings));
      } catch {
        // Ignore storage quota errors
      }
    }

    _bindTransport() {
      this.transport.onSnapshot((snap) => {
        this.snapshot = snap;
        if ((this.state === 'playing' || this.state === 'paused') && snap.matchOver) {
          this._onMatchOver(snap);
        }
      });

      this.transport.onEvent((ev) => this._handleSimEvent(ev));
    }

    _startMenuDemo() {
      this.state = 'menu';
      if (this.transport !== this.localTransport) {
        this.transport.disconnect();
        this.transport = this.localTransport;
      }
      const conn = this.transport.connect({
        mapId: this.settings.mapId,
        modeId: 'tdm',
        botCount: 7,
        playerName: this.settings.playerName,
        skinId: this.settings.skinId,
        accessoryId: this.settings.accessoryId,
        weaponSkinId: this.settings.weaponSkinId,
        difficulty: 'medium',
        demoMode: true,
      });
      this.localId = conn.playerId;
    }

    startNewMatch() {
      this.audio.init();
      this.audio.setVolume(this.settings.volume);
      this.audio.playUiClick();

      this.floatingNumbers = [];
      this.damageIndicators = [];
      this.hurtVignette = 0;
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.camFootY = null;
      this.stepOffsetY = 0;
      this.lastGroundedY = null;
      this.wasGroundedCam = false;
      this.swayTargetX = 0;
      this.swayTargetY = 0;
      this.swayX = 0;
      this.swayY = 0;
      this.inspectTimer = 0;
      this.equipTimer = 0.16;
      this.desiredWeaponSlot = null;
      this.currentWeaponSlot = 1;
      this.lastWeaponSlot = 2;
      this._hudState = Object.create(null);
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      document.getElementById('killfeed').replaceChildren();

      if (this.lanMode) {
        this._startLanMatch();
        return;
      }

      const conn = this.transport.connect({
        mapId: this.settings.mapId,
        modeId: this.settings.modeId,
        botCount: this.settings.botCount,
        playerName: this.settings.playerName,
        skinId: this.settings.skinId,
        accessoryId: this.settings.accessoryId,
        weaponSkinId: this.settings.weaponSkinId,
        difficulty: this.settings.difficulty,
      });
      this.localId = conn.playerId;

      const lp = this.sim.playerMap[this.localId];
      if (lp) {
        this.yaw = lp.yaw;
        this.pitch = 0;
        this.camFootY = lp.y;
        this.lastGroundedY = lp.y;
        this.wasAlive = true;
      }

      this.state = 'playing';
      this._updateOverlays();
      this._buildHotbar();
      this._requestPointerLock();
    }

    async _startLanMatch() {
      if (this.transport !== this.localTransport) this.transport.disconnect();
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new BS.WebSocketTransport(`${scheme}://${window.location.host}/ws`);
      this.transport = ws;
      this.snapshot = null;
      this.localId = null;
      this.wasAlive = false; // first alive snapshot syncs yaw/camera like a respawn
      this._bindTransport();
      const backToMenu = (title, sub) => {
        if (this.transport !== ws) return;
        if (document.pointerLockElement) document.exitPointerLock();
        this._startMenuDemo();
        this._updateOverlays();
        this._showBanner(title, sub, 3);
        // HUD banner is hidden behind the menu, so also say it on the menu itself.
        const st = document.getElementById('menu-status');
        st.textContent = `${title}: ${sub}`;
        st.hidden = false;
      };
      document.getElementById('menu-status').hidden = true;
      ws.onClose = () => backToMenu('DISCONNECTED', 'LAN SERVER CLOSED THE CONNECTION');

      this.state = 'playing';
      this._updateOverlays();
      this._requestPointerLock(); // must run inside the click gesture, before awaiting the server

      let conn;
      try {
        conn = await ws.connect({
          mapId: this.settings.mapId,
          modeId: this.settings.modeId,
          botCount: this.settings.botCount,
          playerName: this.settings.playerName,
          skinId: this.settings.skinId,
          accessoryId: this.settings.accessoryId,
          weaponSkinId: this.settings.weaponSkinId,
          difficulty: this.settings.difficulty,
        });
      } catch {
        backToMenu('NO LAN SERVER', 'START IT WITH: npm start');
        return;
      }
      if (this.transport !== ws) return;
      this.localId = conn.playerId;
      // Local sim is never stepped in LAN mode: it only holds the server's map for camera collision + raycasts.
      this.sim.startMatch({ mapId: conn.mapId, modeId: conn.modeId, botCount: 0, demoMode: true });
      this.sim.players = [];
      this.sim.playerMap = Object.create(null);
      this._buildHotbar();
    }

    // Authoritative local player: sim object when playing solo, latest snapshot entry in LAN mode.
    _localPlayer() {
      const simP = this.sim.playerMap[this.localId];
      if (simP) return simP;
      return (this.snapshot && this.snapshot.players.find((p) => p.id === this.localId)) || null;
    }

    _requestPointerLock() {
      if (!this.canvas3d.requestPointerLock) return;
      const fallbackPlain = () => {
        try {
          const p2 = this.canvas3d.requestPointerLock();
          if (p2 && p2.catch) p2.catch(() => {});
        } catch {
          // Ignore synchronous pointer lock failure
        }
      };
      try {
        const p = this.canvas3d.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(fallbackPlain);
      } catch {
        fallbackPlain();
      }
    }

    _bindUI() {
      const makeEl = (tag, cls, text) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined) el.textContent = text;
        return el;
      };

      // Populate Menu Cards (Modes, Maps, Weapon Finishes, Skins, Hats) using safe DOM APIs
      const nameInput = document.getElementById('input-player-name');
      nameInput.value = this.settings.playerName;
      nameInput.addEventListener('input', () => {
        this.settings.playerName = this._sanitizePlayerName(nameInput.value);
        this._saveSettings();
      });

      // Modes
      const modeGrid = document.getElementById('mode-grid');
      Object.values(BS.MODES).forEach((m) => {
        const btn = makeEl('button', 'select-card' + (this.settings.modeId === m.id ? ' active' : ''));
        btn.dataset.mode = m.id;
        btn.append(
          makeEl('div', 'card-badge', m.short),
          makeEl('div', 'card-title', m.name),
          makeEl('div', 'card-sub', m.description)
        );
        btn.addEventListener('click', () => {
          this.audio.init();
          this.audio.playUiClick();
          this.settings.modeId = m.id;
          this._saveSettings();
          modeGrid.querySelectorAll('.select-card').forEach((c) => c.classList.remove('active'));
          btn.classList.add('active');
        });
        modeGrid.appendChild(btn);
      });

      // Maps
      const mapGrid = document.getElementById('map-grid');
      Object.values(BS.MAPS).forEach((mp) => {
        const btn = makeEl('button', 'select-card compact' + (this.settings.mapId === mp.id ? ' active' : ''));
        btn.dataset.map = mp.id;
        btn.append(makeEl('div', 'card-title', mp.name), makeEl('div', 'card-sub', mp.subtitle));
        btn.addEventListener('click', () => {
          this.audio.init();
          this.audio.playUiClick();
          this.settings.mapId = mp.id;
          this._saveSettings();
          mapGrid.querySelectorAll('.select-card').forEach((c) => c.classList.remove('active'));
          btn.classList.add('active');
          if (this.state === 'menu') this._startMenuDemo();
        });
        mapGrid.appendChild(btn);
      });

      // CS2-Inspired Weapon Skins / Finishes
      const wSkinRow = document.getElementById('weapon-skin-row');
      if (wSkinRow && BS.WEAPON_SKINS) {
        BS.WEAPON_SKINS.forEach((ws) => {
          const btn = makeEl(
            'button',
            `skin-chip rarity-${ws.rarity}` + (this.settings.weaponSkinId === ws.id ? ' active' : '')
          );
          const sw = makeEl('span', 'skin-swatch');
          sw.style.background = ws.swatch;
          btn.append(sw, makeEl('span', '', ws.name));
          btn.addEventListener('click', () => {
            this.audio.init();
            this.audio.playUiClick();
            this.settings.weaponSkinId = ws.id;
            this._saveSettings();
            wSkinRow.querySelectorAll('.skin-chip').forEach((c) => c.classList.remove('active'));
            btn.classList.add('active');
          });
          wSkinRow.appendChild(btn);
        });
      }

      // Avatar Styles
      const skinRow = document.getElementById('skin-row');
      BS.SKINS.forEach((sk) => {
        const btn = makeEl('button', 'skin-chip' + (this.settings.skinId === sk.id ? ' active' : ''));
        const rgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
        const sw = makeEl('span', 'skin-swatch');
        sw.style.background = `linear-gradient(135deg,${rgb(sk.head)} 35%,${rgb(sk.torso)} 35%,${rgb(sk.torso)} 70%,${rgb(sk.legs)} 70%)`;
        btn.append(sw, makeEl('span', '', sk.name));
        btn.addEventListener('click', () => {
          this.audio.init();
          this.audio.playUiClick();
          this.settings.skinId = sk.id;
          this._saveSettings();
          skinRow.querySelectorAll('.skin-chip').forEach((c) => c.classList.remove('active'));
          btn.classList.add('active');
        });
        skinRow.appendChild(btn);
      });

      // Hats / Accessories
      const hatRow = document.getElementById('hat-row');
      if (hatRow) {
        const hatItems = [{ id: 'auto', name: 'Auto (match style)' }].concat(BS.ACCESSORIES || []);
        hatItems.forEach((acc) => {
          const btn = makeEl('button', 'skin-chip' + (this.settings.accessoryId === acc.id ? ' active' : ''));
          btn.appendChild(makeEl('span', '', acc.name));
          btn.addEventListener('click', () => {
            this.audio.init();
            this.audio.playUiClick();
            this.settings.accessoryId = acc.id;
            this._saveSettings();
            hatRow.querySelectorAll('.skin-chip').forEach((c) => c.classList.remove('active'));
            btn.classList.add('active');
          });
          hatRow.appendChild(btn);
        });
      }

      // Bot count & difficulty
      const botSlider = document.getElementById('slider-bots');
      const botVal = document.getElementById('val-bots');
      botSlider.value = this.settings.botCount;
      botVal.textContent = this.settings.botCount;
      botSlider.addEventListener('input', () => {
        this.settings.botCount = parseInt(botSlider.value, 10);
        botVal.textContent = this.settings.botCount;
        this._saveSettings();
      });

      const diffSelect = document.getElementById('select-difficulty');
      diffSelect.value = this.settings.difficulty;
      diffSelect.addEventListener('change', () => {
        this.settings.difficulty = diffSelect.value;
        this._saveSettings();
      });

      // Sensitivity & Volume (both Menu and Pause)
      const syncSliders = () => {
        const sensPct = Math.round((this.settings.sensitivity / 0.0022) * 100);
        const volPct = Math.round(this.settings.volume * 100);
        document.getElementById('slider-sens').value = sensPct;
        document.getElementById('val-sens').textContent = sensPct + '%';
        document.getElementById('slider-vol').value = volPct;
        document.getElementById('val-vol').textContent = volPct + '%';
        this.audio.setVolume(this.settings.volume);
      };
      syncSliders();

      document.getElementById('slider-sens').addEventListener('input', (e) => {
        const pct = parseInt(e.target.value, 10);
        this.settings.sensitivity = (pct / 100) * 0.0022;
        document.getElementById('val-sens').textContent = pct + '%';
        this._saveSettings();
      });

      document.getElementById('slider-vol').addEventListener('input', (e) => {
        const pct = parseInt(e.target.value, 10);
        this.settings.volume = pct / 100;
        document.getElementById('val-vol').textContent = pct + '%';
        this.audio.setVolume(this.settings.volume);
        this._saveSettings();
      });

      // Action buttons
      document.getElementById('btn-play').addEventListener('click', () => this.startNewMatch());
      document.getElementById('btn-resume').addEventListener('click', () => {
        this.audio.playUiClick();
        this._requestPointerLock();
      });
      document.getElementById('btn-restart').addEventListener('click', () => this.startNewMatch());
      document.getElementById('btn-main-menu').addEventListener('click', () => {
        this.audio.playUiClick();
        if (document.pointerLockElement) document.exitPointerLock();
        this._startMenuDemo();
        this._updateOverlays();
      });
      document.getElementById('btn-play-again').addEventListener('click', () => this.startNewMatch());
      document.getElementById('btn-victory-menu').addEventListener('click', () => {
        this.audio.playUiClick();
        this._startMenuDemo();
        this._updateOverlays();
      });
    }

    _buildHotbar() {
      const bar = document.getElementById('weapon-hotbar');
      bar.replaceChildren();
      this.hotbarSlots = [];
      BS.WEAPONS.forEach((w) => {
        const el = document.createElement('div');
        el.className = 'hotbar-slot';
        el.dataset.weaponId = w.id;
        const num = document.createElement('span');
        num.className = 'slot-num';
        num.textContent = String(w.slot);
        const name = document.createElement('span');
        name.className = 'slot-name';
        name.textContent = w.shortName;
        el.append(num, name);
        el.addEventListener('mousedown', (ev) => {
          ev.stopPropagation();
          if (this.state === 'playing') {
            this.audio.init();
            this._selectWeaponSlot(w.slot);
            if (!this.pointerLocked) this._requestPointerLock();
          }
        });
        bar.appendChild(el);
        this.hotbarSlots.push(el);
      });
    }

    _bindInput() {
      window.addEventListener('resize', () => {
        this.renderer.resize();
        this._resize2D();
      });

      document.addEventListener('pointerlockchange', () => {
        this.pointerLocked = document.pointerLockElement === this.canvas3d;
        if (this.pointerLocked) {
          this.skipMouseEvents = 2;
          const hint = document.getElementById('pause-hint');
          if (hint) hint.textContent = this.defaultPauseHint;
          if (this.state === 'paused') {
            this.state = 'playing';
          }
          this._updateOverlays();
        } else if (this.state === 'playing') {
          this.state = 'paused';
          this.keys = {};
          this.mouseDown.left = false;
          this.mouseDown.right = false;
          // Clear taps BEFORE the forced send, or the "all-released" packet still throws/jumps/dashes.
          this.pendingFire = false;
          this.pendingJump = false;
          this.pendingDash = false;
          this.pendingGrenade = false;
          this.pendingReload = false;
          // LAN server keeps running while paused: send one all-released input so the avatar stops
          if (this.lanMode && this.localId) this._sendLocalInput(0, true);
          this._updateOverlays();
        }
      });

      document.addEventListener('pointerlockerror', () => {
        if (this.state === 'paused') {
          const hint = document.getElementById('pause-hint');
          if (hint) hint.textContent = 'Browser blocked mouse lock — wait a second and click RESUME again.';
          this._updateOverlays();
        }
      });

      window.addEventListener('blur', () => {
        this.keys = {};
        this.mouseDown.left = false;
        this.mouseDown.right = false;
        this.pendingFire = false;
        this.pendingJump = false;
        this.pendingDash = false;
        this.pendingGrenade = false;
      });

      // Click canvas while playing to re-engage pointer lock seamlessly
      this.canvas3d.addEventListener('mousedown', (e) => {
        if (this.state !== 'playing') return;
        this.audio.init();
        if (!this.pointerLocked) {
          this._requestPointerLock();
          return;
        }
        if (e.button === 0) {
          this.mouseDown.left = true;
          this.pendingFire = true; // Latch sub-frame taps so short clicks never drop!
        }
        if (e.button === 2) this.mouseDown.right = true;
      });

      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseDown.left = false;
        if (e.button === 2) this.mouseDown.right = false;
      });

      window.addEventListener('contextmenu', (e) => {
        if (this.state === 'playing') e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (this.state !== 'playing' || !this.pointerLocked) return;
        if (this.skipMouseEvents > 0) {
          this.skipMouseEvents--;
          return;
        }
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
        const localPlayer = this._localPlayer();
        const isAds = localPlayer && (localPlayer.input ? localPlayer.input.ads : localPlayer.ads);
        const adsMult = isAds ? (localPlayer.weaponId === 'sniper' ? 0.35 : 0.65) : 1.0;
        const sens = this.settings.sensitivity * adsMult;
        const dYaw = e.movementX * sens;
        const dPitch = -e.movementY * sens;
        this.yaw += dYaw;
        this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch + dPitch));
        // Accumulate smooth 1/dt-free impulse into weapon sway target
        this.swayTargetX = Math.max(-0.065, Math.min(0.065, this.swayTargetX - dYaw * 0.55));
        this.swayTargetY = Math.max(-0.065, Math.min(0.065, this.swayTargetY - dPitch * 0.55));
      });

      window.addEventListener('wheel', (e) => {
        if (this.state !== 'playing') return;
        if (Math.abs(e.deltaY) < 0.01) return;
        const now = performance.now();
        if (now - this.lastWheelTime < 55) return;
        this.lastWheelTime = now;
        const dir = e.deltaY > 0 ? 1 : -1;
        const baseSlot = this._getEffectiveWeaponSlot();
        let next = baseSlot + dir;
        if (next < 1) next = BS.WEAPONS.length;
        if (next > BS.WEAPONS.length) next = 1;
        this._selectWeaponSlot(next);
      });

      window.addEventListener('keydown', (e) => {
        if (e.code === 'Tab' && this.state === 'playing') {
          e.preventDefault();
          document.getElementById('scoreboard-overlay').classList.remove('hidden');
          this._renderScoreboard();
        }
        this.keys[e.code] = true;

        if (this.state !== 'playing') return;

        if (e.code === 'Space' && !e.repeat) {
          this.pendingJump = true;
        }

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          this.pendingDash = true;
        }
        if (e.code === 'KeyG' && !e.repeat) {
          this.pendingGrenade = true;
        }
        if (e.code === 'KeyR') {
          this.pendingReload = true;
          this.inspectTimer = 0;
        }
        if (e.code === 'KeyF') {
          this.inspectTimer = this.inspectDuration;
          this.audio.playUiClick();
        }
        if (e.code === 'KeyV') {
          this.renderer.thirdPerson = !this.renderer.thirdPerson;
          document.getElementById('cam-mode-pill').textContent = this.renderer.thirdPerson
            ? '3RD PERSON [V]'
            : '1ST PERSON [V]';
          this.audio.playUiClick();
        }
        if (e.code === 'KeyQ' && !e.repeat) {
          this._selectWeaponSlot(this.lastWeaponSlot);
        }
        if (e.code === 'KeyE' && !e.repeat) {
          const baseSlot = this._getEffectiveWeaponSlot();
          const next = baseSlot >= BS.WEAPONS.length ? 1 : baseSlot + 1;
          this._selectWeaponSlot(next);
        }
        if (!e.repeat) {
          let slotNum = NaN;
          if (e.code && e.code.startsWith('Digit')) {
            slotNum = parseInt(e.code.slice(5), 10);
          } else if (e.code && e.code.startsWith('Numpad')) {
            slotNum = parseInt(e.code.slice(6), 10);
          } else if (typeof e.key === 'string' && /^[1-6]$/.test(e.key)) {
            slotNum = parseInt(e.key, 10);
          }
          if (Number.isInteger(slotNum) && slotNum >= 1 && slotNum <= BS.WEAPONS.length) {
            this._selectWeaponSlot(slotNum);
          }
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
        if (e.code === 'Tab') {
          document.getElementById('scoreboard-overlay').classList.add('hidden');
        }
      });
    }

    _getActualWeaponSlot() {
      const lp = this._localPlayer();
      const w = lp && BS.WEAPON_BY_ID[lp.weaponId];
      return w ? w.slot : this.currentWeaponSlot;
    }

    _getEffectiveWeaponSlot() {
      return this.desiredWeaponSlot !== null ? this.desiredWeaponSlot : this._getActualWeaponSlot();
    }

    _selectWeaponSlot(slot) {
      if (!Number.isInteger(slot) || slot < 1 || slot > BS.WEAPONS.length) return;
      const activeModeId = (this.sim && this.sim.mode && this.sim.mode.id) || this.settings.modeId;
      if (activeModeId === 'gungame') {
        this._showBanner('ARSENAL LADDER', 'GET KOs TO AUTO-UPGRADE WEAPON!', 1.2);
        return;
      }
      const activeMode = BS.MODES[activeModeId];
      if (activeMode && activeMode.lockedWeapon) {
        const lw = BS.WEAPON_BY_ID[activeMode.lockedWeapon];
        this._showBanner(activeMode.name.toUpperCase(), `${lw ? lw.name : 'ONE WEAPON'} ONLY`, 1.2);
        return;
      }
      const actualSlot = this._getActualWeaponSlot();
      if (slot !== actualSlot || this.desiredWeaponSlot !== slot) {
        if (slot !== actualSlot) {
          this.lastWeaponSlot = actualSlot;
          this.currentWeaponSlot = slot;
          this.desiredWeaponSlot = slot;
          this.inspectTimer = 0;
        } else {
          this.desiredWeaponSlot = null;
        }
      }
    }

    _resize2D() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
      this.canvas2d.width = Math.max(1, Math.floor(this.viewW * dpr));
      this.canvas2d.height = Math.max(1, Math.floor(this.viewH * dpr));
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _updateOverlays() {
      const show = (id, vis) => document.getElementById(id).classList.toggle('hidden', !vis);
      show('menu-overlay', this.state === 'menu');
      show('pause-overlay', this.state === 'paused');
      show('victory-overlay', this.state === 'matchOver');
      show('hud', this.state === 'playing' || this.state === 'paused');
      show('click-to-play', this.state === 'playing' && !this.pointerLocked);
      if (this.state !== 'playing') {
        document.getElementById('scoreboard-overlay').classList.add('hidden');
        document.getElementById('sniper-scope').classList.add('hidden');
      }
    }

    _onMatchOver(snap) {
      this.state = 'matchOver';
      if (document.pointerLockElement) document.exitPointerLock();
      this._updateOverlays();
      document.getElementById('victory-winner').textContent = (snap.winner && snap.winner.name) || 'MATCH COMPLETE';
      document.getElementById('victory-reason').textContent = (snap.winner && snap.winner.reason) || '';
      const mvp = snap.players.slice().sort((a, b) => b.score - a.score || (b.damageDealt || 0) - (a.damageDealt || 0))[0];
      document.getElementById('victory-mvp').textContent = mvp
        ? `★ MVP: ${mvp.name} — ${mvp.score} PTS • ${mvp.damageDealt || 0} DMG • BEST STREAK ${mvp.bestStreak || 0}`
        : '';
      this._renderScoreboard('victory-board-body');
    }

    // --- Event Handler (Audio + 3D VFX + Killfeed + Hitmarkers) ---
    _handleSimEvent(ev) {
      if (this.state === 'menu') {
        // Still render cool tracers & explosions in the live menu demo!
        if (ev.type === 'shoot') {
          const w = BS.WEAPON_BY_ID[ev.weaponId] || BS.WEAPONS[0];
          ev.hits.forEach((h) => {
            this.renderer.addTracer(ev.ox, ev.oy - 0.1, ev.oz, h.x, h.y, h.z, w.tracerColor, 0.04, 0.12);
          });
        } else if (ev.type === 'explosion') {
          this.renderer.addExplosion(ev.x, ev.y, ev.z, ev.radius);
        } else if (ev.type === 'kill' && ev.victimColors) {
          this.renderer.addBlockShatter(ev.x, ev.y, ev.z, ev.victimColors);
        }
        return;
      }

      const lp = this.snapshot && this.snapshot.players.find((p) => p.id === this.localId);
      const distScale = (x, y, z) => {
        if (!lp) return 0.5;
        const d = Math.hypot(x - lp.x, y - lp.y, z - lp.z);
        return Math.max(0, 1 - d / 55);
      };

      if (ev.type === 'shoot') {
        const w = BS.WEAPON_BY_ID[ev.weaponId] || BS.WEAPONS[0];
        const isLocal = ev.shooterId === this.localId;
        this.audio.playShoot(w.id, isLocal ? 1.0 : distScale(ev.ox, ev.oy, ev.oz) * 0.65);

        if (isLocal) {
          this.renderer.triggerMuzzleFlash(w.tracerColor);
          this.renderer.addScreenShake(w.recoilKick * 0.35);
          // Temporary recoil impulse that smoothly recovers back toward base aim
          const adsMult = lp && lp.ads ? 0.6 : 1.0;
          this.recoilPitch += w.recoilPitch * adsMult;
          this.recoilYaw += (Math.random() - 0.5) * w.recoilPitch * 0.5;
        }

        // Offset tracer start slightly right/down for 1st-person gun barrel feel
        let sx = ev.ox, sy = ev.oy - 0.12, sz = ev.oz;
        if (isLocal && !this.renderer.thirdPerson) {
          sx += this.renderer.camRight[0] * 0.24 + this.renderer.camForward[0] * 0.5;
          sy += -0.14 + this.renderer.camForward[1] * 0.5;
          sz += this.renderer.camRight[2] * 0.24 + this.renderer.camForward[2] * 0.5;
        } else if (isLocal && this.renderer.thirdPerson && lp) {
          const rx = Math.cos(lp.yaw);
          const rz = Math.sin(lp.yaw);
          sx += rx * 0.34 + Math.sin(lp.yaw) * 0.45;
          sy -= 0.08;
          sz += rz * 0.34 - Math.cos(lp.yaw) * 0.45;
        }

        // Eject physical 3D spinning brass / buckshot / rail-cell shell casing!
        const wModel = BS.MODELS && BS.MODELS.weapons && BS.MODELS.weapons[w.id];
        if (wModel && wModel.eject && (isLocal || distScale(ev.ox, ev.oy, ev.oz) > 0.35)) {
          const isShotgun = w.id === 'shotgun';
          const isEnergy = w.id === 'sniper';
          if (isLocal && !this.renderer.thirdPerson) {
            const cr = this.renderer.camRight;
            const cf = this.renderer.camForward;
            const cu = this.renderer.camUp;
            const ex = this.renderer.camPos[0] + cr[0] * 0.28 + cf[0] * 0.45 - cu[0] * 0.14;
            const ey = this.renderer.camPos[1] + cr[1] * 0.28 + cf[1] * 0.45 - cu[1] * 0.14;
            const ez = this.renderer.camPos[2] + cr[2] * 0.28 + cf[2] * 0.45 - cu[2] * 0.14;
            const sideSpd = 2.4 + Math.random() * 1.1;
            const upSpd = 2.2 + Math.random() * 1.0;
            this.renderer.addShellCasing(
              ex,
              ey,
              ez,
              cr[0] * sideSpd + (lp ? lp.vx * 0.35 : 0),
              upSpd,
              cr[2] * sideSpd + (lp ? lp.vz * 0.35 : 0),
              wModel.shellColor,
              isShotgun,
              isEnergy
            );
          } else {
            const yawS = ev.yaw || 0;
            const rx = Math.cos(yawS);
            const rz = Math.sin(yawS);
            this.renderer.addShellCasing(
              ev.ox + rx * 0.45,
              ev.oy - 0.1,
              ev.oz + rz * 0.45,
              rx * (2.2 + Math.random()),
              2.1 + Math.random(),
              rz * (2.2 + Math.random()),
              wModel.shellColor,
              isShotgun,
              isEnergy
            );
          }
        }

        const width = w.id === 'sniper' ? 0.075 : 0.04;
        const life = w.id === 'sniper' ? 0.24 : 0.1;
        ev.hits.forEach((h) => {
          this.renderer.addTracer(sx, sy, sz, h.x, h.y, h.z, w.tracerColor, width, life);
          const sparkCol = h.hitBarrel ? [1.0, 0.52, 0.14] : h.hitPlayer ? [1, 0.9, 0.25] : w.tracerColor;
          this.renderer.addImpactSparks(h.x, h.y, h.z, sparkCol, h.hitPlayer || h.hitBarrel ? 7 : 4);
        });
      } else if (ev.type === 'hit') {
        if (ev.attackerId === this.localId) {
          this.hitmarkerTimer = 0.16;
          this.hitmarkerCrit = ev.headshot;
          this.audio.playHitmarker(ev.headshot);
          this.floatingNumbers.push({
            x: ev.x,
            y: ev.y + 0.35,
            z: ev.z,
            text: ev.headshot ? `-${ev.damage}!` : `-${ev.damage}`,
            crit: ev.headshot,
            life: 0.78,
            maxLife: 0.78,
          });
        }
        if (ev.victimId === this.localId) {
          this.hurtVignette = Math.min(1, this.hurtVignette + 0.65);
          this.renderer.addScreenShake(0.16);
          this.audio.playHurt();
          const attacker = this.snapshot && this.snapshot.players.find((p) => p.id === ev.attackerId);
          if (attacker) {
            this.damageIndicators.push({ x: attacker.x, z: attacker.z, life: 1.2, maxLife: 1.2 });
          }
        }
      } else if (ev.type === 'kill') {
        if (ev.victimColors) {
          this.renderer.addBlockShatter(ev.x, ev.y, ev.z, ev.victimColors);
        }
        this.audio.playBlockShatter(distScale(ev.x, ev.y, ev.z));
        this._pushKillfeed(ev);

        if (ev.victimId === this.localId) {
          // Respawn screen: who got you, with what, and how much HP they had left.
          const w = BS.WEAPON_BY_ID[ev.weaponId];
          const wName = w ? w.shortName : ev.weaponId === 'grenade' ? 'FRAG' : ev.weaponId === 'barrel' ? 'BARREL' : '';
          let txt;
          if (!ev.killerId) txt = ev.weaponId === 'void' ? 'FELL INTO THE VOID' : 'SELF-DESTRUCTED';
          else {
            txt = `KILLED BY ${ev.killerName}` + (wName ? ` • ${wName}` : '');
            if (ev.weaponId === 'void') txt = `KNOCKED OFF BY ${ev.killerName}`;
            if (Number.isFinite(ev.killerHp)) txt += ` • ${ev.killerHp} HP LEFT`;
          }
          document.getElementById('respawn-killer').textContent = txt;
        }

        if (Array.isArray(ev.assistIds) && ev.assistIds.includes(this.localId)) {
          this.floatingNumbers.push({
            x: ev.x,
            y: ev.y + 0.85,
            z: ev.z,
            text: `ASSIST +${ev.assistXp || 25} XP`,
            crit: false,
            life: 1.05,
            maxLife: 1.05,
          });
        }

        if (ev.killerId === this.localId) {
          this.hitmarkerTimer = 0.26;
          this.hitmarkerCrit = true;
          this.audio.playKill(ev.streak);
          if (ev.xpEarned > 0) {
            this.floatingNumbers.push({
              x: ev.x,
              y: ev.y + 0.85,
              z: ev.z,
              text:
                (ev.bountyClaimed > 0 ? `+${ev.xpEarned} XP (BOUNTY!)` : `+${ev.xpEarned} XP`) +
                (ev.healed > 0 ? ` • +${ev.healed} HP` : ''),
              crit: true,
              life: 1.05,
              maxLife: 1.05,
            });
          }
          const streakTitle = STREAK_LABELS[ev.streak];
          const wanted = this._wanted && this._wanted.streak === ev.streak ? this._wanted : null;
          this._wanted = null;
          if (streakTitle) {
            const sub = wanted ? `WANTED! • ${wanted.bounty} XP BOUNTY` : ev.headshot ? 'HEADSHOT ELIMINATION!' : `${ev.streak} KO STREAK`;
            this._showBanner(streakTitle, sub, wanted ? 1.7 : undefined);
          } else if (wanted) {
            // keep the WANTED banner
          } else if (ev.headshot) {
            this._showBanner('HEADSHOT KO!', `+${ev.xpEarned || 85} XP • ${ev.victimName}`);
          }
        }
      } else if (ev.type === 'weaponSwitch') {
        if (ev.playerId === this.localId) {
          this.equipTimer = this.equipDuration;
          this.inspectTimer = 0;
          this.audio.playWeaponSwitch();
        }
      } else if (ev.type === 'levelUp') {
        if (ev.playerId === this.localId) {
          this.audio.playLevelUp();
          this._showBanner(`LEVEL UP! • LVL ${ev.level}`, '+25 HP • +20 SHIELD • +AGILITY & RELOAD', 2.0);
        } else if (ev.level === 5 || ev.level === 10 || ev.level === 15) {
          this._pushFeedNotice(ev.playerName, ev.playerTeam, `REACHED LVL ${ev.level}!`, '');
        }
      } else if (ev.type === 'bountyPlaced') {
        this._pushFeedNotice(ev.playerName, ev.playerTeam, `★ WANTED [+${ev.bounty} XP]`, `${ev.streak} STREAK`);
        if (ev.playerId === this.localId) {
          this._showBanner(`WANTED! • ${ev.bounty} XP BOUNTY`, `${ev.streak} STREAK — SURVIVE FOR BONUS XP!`, 1.7);
          this._wanted = { streak: ev.streak, bounty: ev.bounty }; // the kill event right after must not overwrite this
        }
      } else if (ev.type === 'bountyClaimed') {
        this._pushFeedNotice(ev.killerName, ev.killerTeam, `[★ BOUNTY +${ev.bounty} XP]`, ev.victimName, ev.victimTeam, true);
        if (ev.killerId === this.localId) {
          this.audio.playBountyClaim();
          this._showBanner('BOUNTY CLAIMED!', `SHUTDOWN ${ev.victimName} • +${ev.bounty} XP`, 2.0);
        }
      } else if (ev.type === 'explosion') {
        this.renderer.addExplosion(ev.x, ev.y, ev.z, ev.radius);
        const s = distScale(ev.x, ev.y, ev.z);
        this.audio.playExplosion(s);
        if (s > 0.4) this.renderer.addScreenShake(0.32 * s);
      } else if (ev.type === 'barrelExplode') {
        this.renderer.addBlockShatter(ev.x, ev.y, ev.z, {
          head: [0.86, 0.24, 0.16],
          torso: [0.16, 0.16, 0.2],
          legs: [1.0, 0.72, 0.16],
        });
      } else if (ev.type === 'slide' && ev.playerId === this.localId) {
        this.audio.playSlide();
      } else if (ev.type === 'grenadeThrow') {
        if (ev.playerId === this.localId) {
          this.audio.playGrenadeThrow();
          this.renderer.addScreenShake(0.06);
        }
      } else if (ev.type === 'grenadeBounce') {
        this.audio.playGrenadeBounce(distScale(ev.x, ev.y, ev.z));
      } else if (ev.type === 'jumpPad' && ev.playerId === this.localId) {
        this.audio.playJumpPad();
      } else if (ev.type === 'dash' && ev.playerId === this.localId) {
        this.audio.playDash();
      } else if (ev.type === 'doubleJump' && ev.playerId === this.localId) {
        this.audio.playJumpPad();
      } else if (ev.type === 'tag') {
        const confirmed = ev.kind === 'confirmed';
        this._pushFeedNotice(ev.playerName, ev.playerTeam, confirmed ? '[✔ KILL CONFIRMED]' : '[✖ KILL DENIED]', '', 'ffa', ev.playerId === this.localId);
        if (ev.playerId === this.localId) {
          this.audio.playPickup('shield');
          const cfg = BS.KILL_CONFIRMED || {};
          this._showBanner(
            confirmed ? 'KILL CONFIRMED' : 'KILL DENIED',
            confirmed ? `+${cfg.CONFIRM_SCORE || 50} SCORE • +1 TEAM POINT` : `+${cfg.DENY_SCORE || 25} SCORE • ENEMY POINT DENIED`,
            1.2
          );
        }
      } else if (ev.type === 'pickup' && ev.playerId === this.localId) {
        this.audio.playPickup(ev.pickupType);
        const msg =
          ev.pickupType === 'health'
            ? `+${ev.gain ?? 45} HEALTH`
            : ev.pickupType === 'shield'
            ? `+${ev.gain ?? 50} SHIELD`
            : 'SPEED BOOST!';
        this._showBanner(msg, 'POWERUP COLLECTED', 1.1);
      } else if (ev.type === 'reload' && ev.playerId === this.localId) {
        this.audio.playReload();
      }
    }

    _pushKillfeed(ev) {
      const feed = document.getElementById('killfeed');
      const w = BS.WEAPON_BY_ID[ev.weaponId];
      const wLabel = w
        ? w.shortName
        : ev.weaponId === 'grenade'
        ? 'FRAG'
        : ev.weaponId === 'barrel'
        ? 'BARREL'
        : 'VOID';
      const row = document.createElement('div');
      row.className = 'killfeed-item' + (ev.killerId === this.localId || ev.victimId === this.localId ? ' mine' : '');
      const teamCls = (t) => (t === 'blue' ? 't-blue' : t === 'red' ? 't-red' : 't-ffa');

      const kSpan = document.createElement('span');
      kSpan.className = teamCls(ev.killerTeam);
      kSpan.textContent = String(ev.killerName || 'UNKNOWN');

      const wSpan = document.createElement('span');
      wSpan.className = 'kf-weapon';
      wSpan.textContent = `[${wLabel}${ev.headshot ? ' ★' : ''}]`;

      const vSpan = document.createElement('span');
      vSpan.className = teamCls(ev.victimTeam);
      vSpan.textContent = String(ev.victimName || 'UNKNOWN');

      if (ev.assistName) {
        const aSpan = document.createElement('span');
        aSpan.className = 'kf-weapon';
        aSpan.textContent = `+ ${ev.assistName}`;
        row.append(kSpan, aSpan, wSpan, vSpan);
      } else {
        row.append(kSpan, wSpan, vSpan);
      }
      feed.prepend(row);
      while (feed.children.length > 5) {
        feed.removeChild(feed.lastChild);
      }
      setTimeout(() => {
        row.classList.add('fade');
        setTimeout(() => row.remove(), 350);
      }, 4500);
    }

    _pushFeedNotice(actorName, actorTeam, badgeText, rightText = '', rightTeam = 'ffa', highlight = false) {
      const feed = document.getElementById('killfeed');
      const row = document.createElement('div');
      row.className = 'killfeed-item' + (highlight ? ' mine' : '');
      const teamCls = (t) => (t === 'blue' ? 't-blue' : t === 'red' ? 't-red' : 't-ffa');

      const aSpan = document.createElement('span');
      aSpan.className = teamCls(actorTeam);
      aSpan.textContent = String(actorName || 'PLAYER');

      const bSpan = document.createElement('span');
      bSpan.className = 't-ffa';
      bSpan.textContent = String(badgeText);

      row.append(aSpan, bSpan);
      if (rightText) {
        const rSpan = document.createElement('span');
        rSpan.className = teamCls(rightTeam);
        rSpan.textContent = String(rightText);
        row.appendChild(rSpan);
      }

      feed.prepend(row);
      while (feed.children.length > 5) {
        feed.removeChild(feed.lastChild);
      }
      setTimeout(() => {
        row.classList.add('fade');
        setTimeout(() => row.remove(), 350);
      }, 4500);
    }

    _showBanner(title, sub = '', duration = 1.6) {
      const el = document.getElementById('announce-banner');
      document.getElementById('announce-title').textContent = title;
      document.getElementById('announce-sub').textContent = sub;
      el.classList.remove('hidden', 'pop');
      void el.offsetWidth; // trigger animation restart
      el.classList.add('pop');
      this.bannerTimer = duration;
    }

    _esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    _interpolate(snap, interp) {
      if (!snap || !interp || !interp.prev) return snap;
      const a = interp.alpha;
      const prevP = interp.prev.players || {};
      const prevPr = interp.prev.projectiles || {};

      const players = snap.players.map((p) => {
        const pp = prevP[p.id];
        if (!pp || !pp.alive || !p.alive) return p;
        const dx = p.x - pp.x;
        const dy = p.y - pp.y;
        const dz = p.z - pp.z;
        if (dx * dx + dy * dy + dz * dz >= 16) return p;
        let diff = (p.yaw - pp.yaw) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        return {
          ...p,
          x: pp.x + dx * a,
          y: pp.y + dy * a,
          z: pp.z + dz * a,
          yaw: pp.yaw + diff * a,
        };
      });

      const projectiles = snap.projectiles.map((pr) => {
        const ppr = prevPr[pr.id];
        if (!ppr) return pr;
        return {
          ...pr,
          x: ppr.x + (pr.x - ppr.x) * a,
          y: ppr.y + (pr.y - ppr.y) * a,
          z: ppr.z + (pr.z - ppr.z) * a,
        };
      });

      return { ...snap, players, projectiles };
    }

    // --- Main Frame Loop ---
    _loop(now) {
      const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
      this.lastTime = now;

      // Decay temporary recoil offset each frame
      const recoilDecay = Math.exp(-dt * (this.mouseDown.left ? 5 : 9));
      this.recoilPitch *= recoilDecay;
      this.recoilYaw *= recoilDecay;

      if (this.state === 'playing') {
        this._sendLocalInput(dt);
        this.transport.stepFrame(dt);
      } else if (this.state === 'menu') {
        this.transport.stepFrame(dt);
      }

      if (this.snapshot) {
        // Sync yaw cleanly when respawning (authoritative snapshot check)
        const lp = this.snapshot.players.find((p) => p.id === this.localId);
        if (lp) {
          if (!this.wasAlive && lp.alive) {
            this.yaw = lp.yaw;
            this.pitch = 0;
            this.recoilPitch = 0;
            this.recoilYaw = 0;
            this.camFootY = lp.y;
            this.stepOffsetY = 0;
            this.lastGroundedY = lp.y;
            this.wasGroundedCam = lp.grounded;
            this.swayTargetX = 0;
            this.swayTargetY = 0;
          }
          this.wasAlive = lp.alive;

          // Footstep audio
          const horiz = Math.hypot(lp.vx, lp.vz);
          if (this.state === 'playing' && lp.alive && lp.grounded && horiz > 2.5) {
            this.footstepAccum += dt * horiz;
            if (this.footstepAccum > 2.8) {
              this.footstepAccum = 0;
              this.audio.playStep();
            }
          }
        }

        const renderSnap = this._interpolate(this.snapshot, this.transport.getInterpolation());
        const renderLp = renderSnap === this.snapshot ? lp : renderSnap.players.find((p) => p.id === this.localId);

        // Zero-lag stair step-offset decay: flat ground, jumps, falls & pads track instantaneously
        if (renderLp) {
          if (renderLp.grounded && this.wasGroundedCam && this.lastGroundedY !== null) {
            const dy = renderLp.y - this.lastGroundedY;
            if (Math.abs(dy) > 0.002 && Math.abs(dy) <= 0.62) {
              this.stepOffsetY = Math.max(-0.6, Math.min(0.6, this.stepOffsetY - dy));
            }
          }
          this.stepOffsetY *= Math.exp(-dt * (renderLp.grounded ? 18 : 28));
          if (Math.abs(this.stepOffsetY) < 0.0005) this.stepOffsetY = 0;
          this.lastGroundedY = renderLp.grounded ? renderLp.y : null;
          this.wasGroundedCam = renderLp.grounded;
          this.camFootY = renderLp.y + this.stepOffsetY;
        }

        // Critically-damped 1/dt-free weapon sway (eliminates mouse-polling beat jitter!)
        const swayDecay = Math.exp(-dt * 14);
        this.swayTargetX *= swayDecay;
        this.swayTargetY *= swayDecay;
        const swayFollow = 1 - Math.exp(-dt * 20);
        this.swayX += (this.swayTargetX - this.swayX) * swayFollow;
        this.swayY += (this.swayTargetY - this.swayY) * swayFollow;

        const viewYaw = this.yaw + this.recoilYaw;
        const viewPitch = Math.max(-1.48, Math.min(1.48, this.pitch + this.recoilPitch));

        // Weapon inspect timer (cancels on fire, ADS, reload, or death)
        if (this.inspectTimer > 0) {
          if (
            !lp ||
            !lp.alive ||
            lp.reloading ||
            lp.ads ||
            (this.mouseDown.left && this.pointerLocked)
          ) {
            this.inspectTimer = 0;
          } else {
            this.inspectTimer = Math.max(0, this.inspectTimer - dt);
          }
        }
        const inspectProgress =
          this.inspectTimer > 0 ? 1 - this.inspectTimer / this.inspectDuration : 0;
        if (this.equipTimer > 0) {
          this.equipTimer = Math.max(0, this.equipTimer - dt);
        }
        const equipDip = this.equipTimer > 0 ? this.equipTimer / this.equipDuration : 0;

        this.renderer.render(
          renderSnap,
          this.localId,
          {
            yaw: viewYaw,
            pitch: viewPitch,
            footY: this.camFootY,
            swayX: this.swayX,
            swayY: this.swayY,
            inspectProgress,
            equipDip,
          },
          this.sim,
          dt,
          this.state === 'menu'
        );

        if (this.state === 'playing' || this.state === 'paused') {
          this._updateHUD(dt, lp);
          this._renderOverlay2D(dt, renderLp, renderSnap);
          this._renderMinimap(renderLp, renderSnap);
        } else {
          this.ctx2d.clearRect(0, 0, this.viewW, this.viewH);
        }
      }

      requestAnimationFrame((t) => this._loop(t));
    }

    _sendLocalInput(dt, force = false) {
      let moveX = 0;
      let moveZ = 0;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ += 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;

      const viewYaw = this.yaw + this.recoilYaw;
      const viewPitch = Math.max(-1.48, Math.min(1.48, this.pitch + this.recoilPitch));
      let aimYaw = viewYaw;
      let aimPitch = viewPitch;

      // 3rd-person crosshair convergence: cast from camera to find target point, aim from eye to that point
      const localSimP = this._localPlayer();
      if (this.renderer.thirdPerson && localSimP && localSimP.alive && this.snapshot) {
        // Note: uses static map/world raycast from sim; for online MP, replace with client-side map raycast.
        const camP = this.renderer.camPos;
        const camF = this.renderer.camForward;
        // LAN: local sim has no players, so ray against the latest server snapshot's hitboxes.
        const lan = this.transport !== this.localTransport;
        if (lan) this.sim.players = this.snapshot.players;
        const res = this.sim.raycastWorldAndPlayers(camP[0], camP[1], camP[2], camF[0], camF[1], camF[2], 200, localSimP);
        if (lan) this.sim.players = [];
        const tpDist = this.renderer.tpDist || 0;
        if (res.dist > tpDist + 0.5) {
          const ex = localSimP.x;
          const ey = localSimP.y + BS.PLAYER.EYE_HEIGHT;
          const ez = localSimP.z;
          const dx = res.x - ex;
          const dy = res.y - ey;
          const dz = res.z - ez;
          const h = Math.hypot(dx, dz) || 0.001;
          aimYaw = Math.atan2(dx, -dz);
          aimPitch = Math.max(-1.46, Math.min(1.46, Math.atan2(dy, h)));
        }
      }

      // Persistent weapon-slot handshake: keep sending desiredWeaponSlot until authoritative sim confirms it!
      if (this.desiredWeaponSlot !== null && localSimP) {
        const curW = BS.WEAPON_BY_ID[localSimP.weaponId];
        if ((this.sim.mode && (this.sim.mode.id === 'gungame' || this.sim.mode.lockedWeapon)) || (curW && curW.slot === this.desiredWeaponSlot)) {
          this.desiredWeaponSlot = null;
        }
      }

      const cmd = {
        seq: ++this.seq,
        moveX,
        moveZ,
        yaw: aimYaw,
        pitch: aimPitch,
        jump: !!this.keys['Space'] || this.pendingJump,
        dash: this.pendingDash,
        crouch: !!(this.keys['KeyC'] || this.keys['ControlLeft']),
        grenade: this.pendingGrenade,
        fire: (this.mouseDown.left || this.pendingFire) && this.pointerLocked,
        ads: (this.mouseDown.right && this.pointerLocked) || !!this.forceAds,
        reload: this.pendingReload,
        weaponSlot: this.desiredWeaponSlot,
      };

      // Only clear taps once a packet actually left; a rate-limited frame must not eat a quick click/jump.
      if (this.transport.sendInput(cmd, force) === false) return;
      this.pendingFire = false;
      this.pendingJump = false;
      this.pendingDash = false;
      this.pendingGrenade = false;
      this.pendingReload = false;
    }

    _setHudText(el, key, val) {
      if (this._hudState[key] !== val) {
        this._hudState[key] = val;
        el.textContent = val;
      }
    }

    _setHudClassToggle(el, cls, key, active) {
      if (this._hudState[key] !== active) {
        this._hudState[key] = active;
        el.classList.toggle(cls, active);
      }
    }

    _setHudWidth(el, key, pct) {
      const rounded = Math.round(pct * 2) * 0.5 + '%';
      if (this._hudState[key] !== rounded) {
        this._hudState[key] = rounded;
        el.style.width = rounded;
      }
    }

    _updateHUD(dt, lp) {
      if (!lp) return;
      const ui = this.hudEls;

      // Hitmarker & Hurt Vignette decay
      if (this.hitmarkerTimer > 0) this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
      this._setHudClassToggle(ui.hitmarker, 'active', 'hmActive', this.hitmarkerTimer > 0);
      this._setHudClassToggle(ui.hitmarker, 'crit', 'hmCrit', this.hitmarkerCrit);

      if (this.hurtVignette > 0) this.hurtVignette = Math.max(0, this.hurtVignette - dt * 2.2);
      const vigStr = this.hurtVignette < 0.005 ? '0' : this.hurtVignette.toFixed(2);
      if (this._hudState.vig !== vigStr) {
        this._hudState.vig = vigStr;
        ui.vignette.style.opacity = vigStr;
      }

      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) ui.banner.classList.add('hidden');
      }

      // Dynamic crosshair spread & Sniper Scope (activates smoothly with adsBlend > 0.35)
      const w = BS.WEAPON_BY_ID[lp.weaponId] || BS.WEAPONS[0];
      const scoped =
        w.id === 'sniper' && lp.ads && lp.alive && !this.renderer.thirdPerson && this.renderer.adsBlend > 0.35;
      this._setHudClassToggle(ui.scope, 'hidden', 'scopeHide', !scoped);
      this._setHudClassToggle(ui.crosshair, 'hidden', 'chHide', scoped || !lp.alive);
      const gap = Math.max(
        3,
        Math.round(6 + Math.hypot(lp.vx, lp.vz) * 0.7 + lp.recoilKick * 18 - (lp.ads ? 4 : 0) - (lp.crouching ? 2 : 0))
      );
      if (this._hudState.chGap !== gap) {
        this._hudState.chGap = gap;
        ui.crosshair.style.setProperty('--gap', gap + 'px');
      }

      // Top score bar & timer
      const mins = Math.floor(this.snapshot.timeLeft / 60);
      const secs = Math.floor(this.snapshot.timeLeft % 60);
      this._setHudText(ui.timer, 'timer', `${mins}:${secs < 10 ? '0' : ''}${secs}`);
      const mode = BS.MODES[this.snapshot.modeId];
      this._setHudText(ui.modeLabel, 'mode', mode ? mode.short : 'MATCH');

      if (mode && mode.teams) {
        this._setHudText(ui.scoreBlue, 'sBlue', `BLUE ${this.snapshot.scores.blue}`);
        this._setHudText(ui.scoreRed, 'sRed', `RED ${this.snapshot.scores.red}`);
      } else {
        let topKills = 0;
        for (let i = 0; i < this.snapshot.players.length; i++) {
          if (this.snapshot.players[i].kills > topKills) topKills = this.snapshot.players[i].kills;
        }
        this._setHudText(ui.scoreBlue, 'sBlue', `YOU ${lp.kills}`);
        this._setHudText(ui.scoreRed, 'sRed', `LEAD ${topKills}`);
      }

      // Level, XP Bar & Active Bounty Pill
      const lvl = lp.level || 1;
      const xp = lp.xp || 0;
      const xpNext = lp.xpToNext || 100;
      if (ui.levelBadge) this._setHudText(ui.levelBadge, 'lvlB', `LVL ${lvl}`);
      if (ui.xpFill) this._setHudWidth(ui.xpFill, 'xpW', Math.min(100, (xp / xpNext) * 100));
      if (ui.xpLabel) this._setHudText(ui.xpLabel, 'xpL', `${xp} / ${xpNext} XP`);

      if (ui.bountyPill) {
        const hasBounty = (lp.bounty || 0) > 0;
        this._setHudClassToggle(ui.bountyPill, 'hidden', 'btyHide', !hasBounty);
        if (hasBounty) {
          this._setHudText(ui.bountyPill, 'btyTxt', `★ WANTED ${lp.bounty} XP`);
        }
      }

      // Health, Shield, Dash, Speed Boost
      const maxHp = lp.maxHp || BS.PLAYER.MAX_HP;
      this._setHudWidth(ui.hpFill, 'hpW', Math.max(0, Math.min(100, (lp.hp / maxHp) * 100)));
      this._setHudText(ui.hpVal, 'hpV', String(Math.ceil(lp.hp)));
      this._setHudWidth(ui.shieldFill, 'shW', (lp.shield / BS.PLAYER.MAX_SHIELD) * 100);
      this._setHudText(ui.shieldVal, 'shV', String(Math.ceil(lp.shield)));

      const dashReady = lp.dashCooldown <= 0;
      const dashPct = dashReady ? 100 : (1 - lp.dashCooldown / BS.PLAYER.DASH_COOLDOWN) * 100;
      this._setHudWidth(ui.dashFill, 'dashW', dashPct);
      this._setHudText(ui.dashLabel, 'dashL', dashReady ? 'DASH READY [SHIFT]' : 'RECHARGING...');

      if (ui.grenadeFill && ui.grenadeLabel) {
        const gCd = lp.grenadeCooldown || 0;
        const gMax = (BS.GRENADE && BS.GRENADE.COOLDOWN) || 7.0;
        const gReady = gCd <= 0;
        this._setHudWidth(ui.grenadeFill, 'grenW', gReady ? 100 : (1 - gCd / gMax) * 100);
        this._setHudText(ui.grenadeLabel, 'grenL', gReady ? 'FRAG READY [G]' : `FRAG ${gCd.toFixed(1)}s`);
      }

      const hasSpeed = lp.speedBoostTimer > 0;
      this._setHudClassToggle(ui.speedPill, 'hidden', 'spHide', !hasSpeed);
      if (hasSpeed) {
        this._setHudText(ui.speedPill, 'spTxt', `SPEED BOOST ${lp.speedBoostTimer.toFixed(1)}s`);
      }

      // Weapon, CS2 Finish Badge & Ammo
      this.currentWeaponSlot = w.slot;
      if (ui.weaponSkinBadge && BS.WEAPON_SKIN_BY_ID) {
        const ws = BS.WEAPON_SKIN_BY_ID[lp.weaponSkin] || BS.WEAPON_SKIN_BY_ID.default;
        if (ws) {
          this._setHudText(ui.weaponSkinBadge, 'wsName', ws.name.toUpperCase());
          const cls = 'weapon-skin-badge rarity-' + ws.rarity;
          if (this._hudState.wsCls !== cls) {
            this._hudState.wsCls = cls;
            ui.weaponSkinBadge.className = cls;
          }
        }
      }
      this._setHudText(ui.weaponName, 'wName', w.name);
      this._setHudText(ui.ammoCur, 'aCur', w.type === 'melee' ? '∞' : String(lp.ammo));
      this._setHudText(ui.ammoMax, 'aMax', w.type === 'melee' ? '' : `/ ${lp.magSize}`);

      this._setHudClassToggle(ui.reloadWrap, 'hidden', 'relHide', !lp.reloading);
      if (lp.reloading) {
        this._setHudWidth(ui.reloadFill, 'relW', Math.min(100, lp.reloadProgress * 100));
      }

      // Highlight active hotbar slot only when weapon changes
      if (this._hudState.activeWeapon !== lp.weaponId) {
        this._hudState.activeWeapon = lp.weaponId;
        for (let i = 0; i < this.hotbarSlots.length; i++) {
          const el = this.hotbarSlots[i];
          el.classList.toggle('active', el.dataset.weaponId === lp.weaponId);
        }
      }

      // Respawn overlay
      const hideResp = lp.alive || this.state !== 'playing';
      this._setHudClassToggle(ui.respawnOverlay, 'hidden', 'respHide', hideResp);
      if (!lp.alive) {
        this._setHudText(ui.respawnTimer, 'respT', Math.max(0.1, lp.respawnTimer).toFixed(1) + 's');
      }
    }

    _renderOverlay2D(dt, lp, snap) {
      const ctx = this.ctx2d;
      const W = this.viewW;
      const H = this.viewH;
      ctx.clearRect(0, 0, W, H);
      if (!lp || !snap) return;

      // 1. Floating Player Nametags & HP Bars
      const mode = BS.MODES[snap.modeId];
      for (let i = 0; i < snap.players.length; i++) {
        const p = snap.players[i];
        if (!p.alive || p.id === this.localId) continue;
        const dist = Math.hypot(p.x - lp.x, p.y - lp.y, p.z - lp.z);
        if (dist > 46) continue;

        // Check line of sight before showing enemy nametag through walls
        const isFriendly = mode && mode.teams && p.team === lp.team;
        if (!isFriendly) {
          const dx = p.x - this.renderer.camPos[0];
          const dy = p.y + 1.5 - this.renderer.camPos[1];
          const dz = p.z - this.renderer.camPos[2];
          const d = Math.hypot(dx, dy, dz) || 1;
          const blocked = this.sim.raycastBlocks(
            this.renderer.camPos[0],
            this.renderer.camPos[1],
            this.renderer.camPos[2],
            dx / d,
            dy / d,
            dz / d,
            d - 0.5
          );
          if (blocked.hit) continue;
        }

        const scr = this.renderer.projectToScreen(p.x, p.y + 2.28 - 0.45 * (p.crouchBlend || 0), p.z);
        if (!scr) continue;

        const barW = Math.max(38, Math.min(68, 700 / Math.max(6, dist)));
        const barH = 5;
        const pLvl = p.level || 1;
        const pMaxHp = p.maxHp || BS.PLAYER.MAX_HP;
        const label = `LV.${pLvl} ${p.name}`;
        ctx.save();
        ctx.font = '700 11.5px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10,14,24,0.78)';
        const textW = ctx.measureText(label).width + 12;
        ctx.fillRect(scr.x - textW / 2, scr.y - 22, textW, 16);
        ctx.fillStyle = isFriendly ? '#4cc9ff' : '#ff6b72';
        ctx.fillText(label, scr.x, scr.y - 10);

        // Glowing Overhead Bounty Tag if player/bot is Wanted!
        if (p.bounty > 0) {
          const bTxt = `★ BOUNTY +${p.bounty} XP`;
          ctx.font = '900 10.5px "Segoe UI", system-ui, sans-serif';
          const bw = ctx.measureText(bTxt).width + 10;
          ctx.fillStyle = 'rgba(38, 22, 4, 0.9)';
          ctx.fillRect(scr.x - bw / 2, scr.y - 39, bw, 15);
          ctx.strokeStyle = '#ffd43b';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(scr.x - bw / 2, scr.y - 39, bw, 15);
          ctx.fillStyle = '#ffd43b';
          ctx.fillText(bTxt, scr.x, scr.y - 28);
        }

        // HP bar
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(scr.x - barW / 2 - 1, scr.y - 3, barW + 2, barH + 2);
        ctx.fillStyle = isFriendly ? '#29b6f6' : '#ff3d54';
        ctx.fillRect(scr.x - barW / 2, scr.y - 2, barW * Math.min(1, p.hp / pMaxHp), barH);
        if (p.shield > 0) {
          ctx.fillStyle = '#38e8ff';
          ctx.fillRect(scr.x - barW / 2, scr.y - 5, barW * (p.shield / BS.PLAYER.MAX_SHIELD), 2);
        }
        ctx.restore();
      }

      // 2. KOTH Zone 3D Waypoint Marker
      if (snap.modeId === 'koth') {
        const map = BS.MAPS[snap.mapId];
        if (map && map.kothZone) {
          const scr = this.renderer.projectToScreen(map.kothZone.x, map.kothZone.y + 3.4, map.kothZone.z);
          if (scr) {
            const owner = snap.kothOwner;
            const col =
              owner === 'blue' ? '#38a8ff' : owner === 'red' ? '#ff4655' : owner === 'contested' ? '#ffca28' : '#ffffff';
            ctx.save();
            ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(10,14,24,0.78)';
            ctx.fillRect(scr.x - 42, scr.y - 14, 84, 20);
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.strokeRect(scr.x - 42, scr.y - 14, 84, 20);
            ctx.fillStyle = col;
            ctx.fillText(owner === 'contested' ? 'CONTESTED' : 'CAPTURE', scr.x, scr.y);
            ctx.restore();
          }
        }
      }

      // 2b. Live Nearby Frag Grenade Danger Indicator
      for (let i = 0; i < snap.projectiles.length; i++) {
        const pr = snap.projectiles[i];
        if (pr.kind !== 'grenade') continue;
        const gd = Math.hypot(pr.x - lp.x, pr.y - lp.y, pr.z - lp.z);
        if (gd > 9.5) continue;
        const scr = this.renderer.projectToScreen(pr.x, pr.y + 0.42, pr.z);
        if (!scr) continue;
        ctx.save();
        ctx.font = '900 12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 42, 60, 0.9)';
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd43b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText('!', scr.x, scr.y + 4);
        ctx.restore();
      }

      // 3. Floating Damage Numbers (crisp pop-up arcade numbers!)
      for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
        const fn = this.floatingNumbers[i];
        fn.life -= dt;
        fn.y += dt * 1.45;
        if (fn.life <= 0) {
          this.floatingNumbers.splice(i, 1);
          continue;
        }
        const scr = this.renderer.projectToScreen(fn.x, fn.y, fn.z);
        if (!scr) continue;
        const alpha = Math.min(1, (fn.life / fn.maxLife) * 1.5);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = fn.crit ? '900 20px "Segoe UI", system-ui, sans-serif' : '800 15px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(fn.text, scr.x, scr.y);
        ctx.fillStyle = fn.crit ? '#ffe140' : '#ffffff';
        ctx.fillText(fn.text, scr.x, scr.y);
        ctx.restore();
      }

      // 4. Directional Damage Arcs around Crosshair
      for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
        const di = this.damageIndicators[i];
        di.life -= dt;
        if (di.life <= 0) {
          this.damageIndicators.splice(i, 1);
          continue;
        }
        const angleToAttacker = Math.atan2(di.x - lp.x, -(di.z - lp.z));
        const rel = angleToAttacker - this.yaw - Math.PI / 2;
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.strokeStyle = `rgba(255, 52, 74, ${(di.life / di.maxLife) * 0.88})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 74, rel - 0.32, rel + 0.32);
        ctx.stroke();
        // Arrowhead pointing outward toward the attacker
        ctx.rotate(rel);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(96, 0);
        ctx.lineTo(80, -10);
        ctx.lineTo(80, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    _renderMinimap(lp, snap) {
      // CSS border-radius: 50% on #minimap-canvas handles circular clipping on GPU with zero ctx.clip() stall!
      const ctx = this.minimapCtx;
      const size = this.minimapCanvas.width;
      const half = size / 2;
      const scale = 2.1; // pixels per world unit

      ctx.fillStyle = 'rgba(11, 16, 28, 0.92)';
      ctx.fillRect(0, 0, size, size);

      // Subtle radar rings
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(half, half, half * 0.45, 0, Math.PI * 2);
      ctx.arc(half, half, half * 0.82, 0, Math.PI * 2);
      ctx.stroke();

      if (lp && snap) {
        const cosY = Math.cos(-this.yaw);
        const sinY = Math.sin(-this.yaw);
        const toRadar = (wx, wz) => {
          const dx = wx - lp.x;
          const dz = wz - lp.z;
          const rx = dx * cosY - dz * sinY;
          const rz = dx * sinY + dz * cosY;
          return [half + rx * scale, half + rz * scale];
        };

        // Draw map cover blocks on radar
        const map = BS.MAPS[snap.mapId];
        if (map) {
          ctx.fillStyle = 'rgba(160, 185, 225, 0.2)';
          for (let i = 0; i < map.blocks.length; i++) {
            const b = map.blocks[i];
            if (b.h < 0.8 || b.w > 50) continue; // skip baseplate floor
            const [rx, ry] = toRadar(b.x, b.z);
            const rw = Math.max(3, b.w * scale * 0.65);
            const rh = Math.max(3, b.d * scale * 0.65);
            ctx.fillRect(rx - rw / 2, ry - rh / 2, rw, rh);
          }

          // KOTH zone on radar
          if (snap.modeId === 'koth' && map.kothZone) {
            const [kx, ky] = toRadar(map.kothZone.x, map.kothZone.z);
            ctx.strokeStyle = '#ffca28';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(kx, ky, map.kothZone.radius * scale, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Players on radar
        const mode = BS.MODES[snap.modeId];
        for (let i = 0; i < snap.players.length; i++) {
          const p = snap.players[i];
          if (!p.alive || p.id === this.localId) continue;
          const [px, py] = toRadar(p.x, p.z);
          const friendly = mode && mode.teams && p.team === lp.team;
          ctx.fillStyle = friendly ? '#38b6ff' : '#ff4655';
          ctx.beginPath();
          ctx.arc(px, py, 3.8, 0, Math.PI * 2);
          ctx.fill();
          if (p.bounty > 0) {
            ctx.strokeStyle = '#ffd43b';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(px, py, 6.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // Local player arrow at center pointing UP
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(half, half - 6);
        ctx.lineTo(half + 4.5, half + 5);
        ctx.lineTo(half, half + 2.5);
        ctx.lineTo(half - 4.5, half + 5);
        ctx.closePath();
        ctx.fill();
      }
    }

    _renderScoreboard(targetBodyId = 'scoreboard-body') {
      const tbody = document.getElementById(targetBodyId);
      if (!tbody || !this.snapshot) return;
      const sorted = this.snapshot.players
        .slice()
        .sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths);

      const frag = document.createDocumentFragment();
      sorted.forEach((p, idx) => {
        const kills = Number.isFinite(p.kills) ? p.kills : 0;
        const deaths = Number.isFinite(p.deaths) ? p.deaths : 0;
        const score = Number.isFinite(p.score) ? p.score : 0;
        const level = Number.isFinite(p.level) ? p.level : 1;
        const bounty = Number.isFinite(p.bounty) ? p.bounty : 0;

        const tr = document.createElement('tr');
        if (p.id === this.localId) tr.className = 'me';

        const tdRank = document.createElement('td');
        tdRank.textContent = '#' + (idx + 1);

        const tdPlayer = document.createElement('td');
        const teamPill = document.createElement('span');
        teamPill.className = p.team === 'blue' ? 'pill blue' : p.team === 'red' ? 'pill red' : 'pill ffa';
        teamPill.textContent = p.team === 'blue' ? 'BLUE' : p.team === 'red' ? 'RED' : 'FFA';
        tdPlayer.appendChild(teamPill);
        tdPlayer.appendChild(document.createTextNode(' ' + String(p.name || 'BloxPlayer')));
        if (p.isBot) {
          const botTag = document.createElement('span');
          botTag.className = 'bot-tag';
          botTag.textContent = 'BOT';
          tdPlayer.appendChild(document.createTextNode(' '));
          tdPlayer.appendChild(botTag);
        }

        const tdLvl = document.createElement('td');
        const lvlPill = document.createElement('span');
        lvlPill.className = 'pill ffa';
        lvlPill.textContent = 'LV.' + level;
        tdLvl.appendChild(lvlPill);

        const tdK = document.createElement('td');
        tdK.textContent = String(kills);
        const tdA = document.createElement('td');
        tdA.textContent = String(Number.isFinite(p.assists) ? p.assists : 0);
        const tdD = document.createElement('td');
        tdD.textContent = String(deaths);
        const tdBounty = document.createElement('td');
        tdBounty.className = bounty > 0 ? 't-ffa' : '';
        tdBounty.textContent = bounty > 0 ? `★ ${bounty} XP` : '—';
        const tdS = document.createElement('td');
        tdS.textContent = String(score);

        if (targetBodyId === 'victory-board-body') {
          // End-of-match stats instead of the live bounty column.
          const fired = Number.isFinite(p.shotsFired) ? p.shotsFired : 0;
          const hit = Number.isFinite(p.shotsHit) ? p.shotsHit : 0;
          const tdDmg = document.createElement('td');
          tdDmg.textContent = String(Number.isFinite(p.damageDealt) ? p.damageDealt : 0);
          const tdAcc = document.createElement('td');
          tdAcc.textContent = fired > 0 ? Math.min(100, Math.round((hit / fired) * 100)) + '%' : '—';
          const tdBest = document.createElement('td');
          tdBest.textContent = String(Number.isFinite(p.bestStreak) ? p.bestStreak : 0);
          tr.append(tdRank, tdPlayer, tdLvl, tdK, tdA, tdD, tdDmg, tdAcc, tdBest, tdS);
        } else {
          tr.append(tdRank, tdPlayer, tdLvl, tdK, tdA, tdD, tdBounty, tdS);
        }
        frag.appendChild(tr);
      });
      tbody.replaceChildren(frag);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      global.bloxStrikeApp = new BloxStrikeClient();
    } catch (err) {
      const box = document.createElement('div');
      box.style.cssText = 'color:#fff;padding:40px;font-family:sans-serif;background:#0f1422;height:100vh;';
      const h1 = document.createElement('h1');
      h1.textContent = 'Unable to initialize 3D WebGL2';
      const p = document.createElement('p');
      p.textContent = err && err.message ? String(err.message) : 'Unknown WebGL2 error';
      box.append(h1, p);
      document.body.replaceChildren(box);
    }
  });
})(window);
