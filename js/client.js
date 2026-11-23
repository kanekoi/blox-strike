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
      this.prevBaseYaw = 0;
      this.prevBasePitch = 0;
      this.swayX = 0;
      this.swayY = 0;
      this.skipMouseEvents = 0;
      this.defaultPauseHint = 'Press <strong>RESUME</strong> to lock mouse and jump right back in.';
      this.pointerLocked = false;
      this.keys = {};
      this.mouseDown = { left: false, right: false };
      this.pendingWeaponSlot = null;
      this.lastWeaponSlot = 1;
      this.currentWeaponSlot = 1;
      this.pendingDash = false;
      this.pendingReload = false;

      // Settings persisted to localStorage
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

      this._bindTransport();
      this._bindUI();
      this._bindInput();
      this._resize2D();

      // Start animated background arena demo right on the main menu!
      this._startMenuDemo();

      // Dev URL parameters for quick testing (?autostart=1&cam=3)
      const params = new URLSearchParams(window.location.search);
      if (params.get('cam') === '3') {
        this.renderer.thirdPerson = true;
        document.getElementById('cam-mode-pill').textContent = '3RD PERSON [V]';
      }
      if (params.get('autostart') === '1') {
        setTimeout(() => {
          if (this.state === 'menu') this.startNewMatch();
        }, 300);
      }

      this.lastTime = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    _loadSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem('blox_strike_settings') || '{}');
        return {
          playerName: saved.playerName || 'BloxPlayer',
          mapId: saved.mapId || 'crossroads',
          modeId: saved.modeId || 'tdm',
          botCount: saved.botCount !== undefined ? saved.botCount : 7,
          difficulty: saved.difficulty || 'medium',
          skinId: saved.skinId || 'classic',
          accessoryId: saved.accessoryId || 'auto',
          sensitivity: saved.sensitivity !== undefined ? saved.sensitivity : 0.0022,
          volume: saved.volume !== undefined ? saved.volume : 0.6,
        };
      } catch {
        return {
          playerName: 'BloxPlayer',
          mapId: 'crossroads',
          modeId: 'tdm',
          botCount: 7,
          difficulty: 'medium',
          skinId: 'classic',
          accessoryId: 'auto',
          sensitivity: 0.0022,
          volume: 0.6,
        };
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
        if (this.state === 'playing' && snap.matchOver) {
          this._onMatchOver(snap);
        }
      });

      this.transport.onEvent((ev) => this._handleSimEvent(ev));
    }

    _startMenuDemo() {
      this.state = 'menu';
      const conn = this.transport.connect({
        mapId: this.settings.mapId,
        modeId: 'tdm',
        botCount: 7,
        playerName: this.settings.playerName,
        skinId: this.settings.skinId,
        accessoryId: this.settings.accessoryId,
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
      this.swayX = 0;
      this.swayY = 0;
      document.getElementById('killfeed').innerHTML = '';

      const conn = this.transport.connect({
        mapId: this.settings.mapId,
        modeId: this.settings.modeId,
        botCount: this.settings.botCount,
        playerName: this.settings.playerName,
        skinId: this.settings.skinId,
        accessoryId: this.settings.accessoryId,
        difficulty: this.settings.difficulty,
      });
      this.localId = conn.playerId;

      const lp = this.sim.playerMap[this.localId];
      if (lp) {
        this.yaw = lp.yaw;
        this.pitch = 0;
        this.prevBaseYaw = this.yaw;
        this.prevBasePitch = this.pitch;
        this.camFootY = lp.y;
        this.wasAlive = true;
      }

      this.state = 'playing';
      this._updateOverlays();
      this._buildHotbar();
      this._requestPointerLock();
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
      // Populate Menu Cards (Modes, Maps, Skins)
      const nameInput = document.getElementById('input-player-name');
      nameInput.value = this.settings.playerName;
      nameInput.addEventListener('input', () => {
        this.settings.playerName = nameInput.value.trim() || 'BloxPlayer';
        this._saveSettings();
      });

      // Modes
      const modeGrid = document.getElementById('mode-grid');
      Object.values(BS.MODES).forEach((m) => {
        const btn = document.createElement('button');
        btn.className = 'select-card' + (this.settings.modeId === m.id ? ' active' : '');
        btn.dataset.mode = m.id;
        btn.innerHTML = `<div class="card-badge">${m.short}</div><div class="card-title">${m.name}</div><div class="card-sub">${m.description}</div>`;
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
        const btn = document.createElement('button');
        btn.className = 'select-card compact' + (this.settings.mapId === mp.id ? ' active' : '');
        btn.dataset.map = mp.id;
        btn.innerHTML = `<div class="card-title">${mp.name}</div><div class="card-sub">${mp.subtitle}</div>`;
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

      // Skins
      const skinRow = document.getElementById('skin-row');
      BS.SKINS.forEach((sk) => {
        const btn = document.createElement('button');
        btn.className = 'skin-chip' + (this.settings.skinId === sk.id ? ' active' : '');
        const rgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
        btn.innerHTML = `<span class="skin-swatch" style="background:linear-gradient(135deg,${rgb(sk.head)} 35%,${rgb(sk.torso)} 35%,${rgb(sk.torso)} 70%,${rgb(sk.legs)} 70%)"></span><span>${sk.name}</span>`;
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
          const btn = document.createElement('button');
          btn.className = 'skin-chip' + (this.settings.accessoryId === acc.id ? ' active' : '');
          btn.innerHTML = `<span>${acc.name}</span>`;
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
      bar.innerHTML = '';
      BS.WEAPONS.forEach((w) => {
        const el = document.createElement('div');
        el.className = 'hotbar-slot';
        el.dataset.weaponId = w.id;
        el.innerHTML = `<span class="slot-num">${w.slot}</span><span class="slot-name">${w.shortName}</span>`;
        bar.appendChild(el);
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
          if (hint) hint.innerHTML = this.defaultPauseHint;
          if (this.state === 'paused') {
            this.state = 'playing';
          }
          this._updateOverlays();
        } else if (this.state === 'playing') {
          this.state = 'paused';
          this.keys = {};
          this.mouseDown.left = false;
          this.mouseDown.right = false;
          this.pendingDash = false;
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
        this.pendingDash = false;
      });

      // Click canvas while playing to re-engage pointer lock seamlessly
      this.canvas3d.addEventListener('mousedown', (e) => {
        if (this.state !== 'playing') return;
        this.audio.init();
        if (!this.pointerLocked) {
          this._requestPointerLock();
          return;
        }
        if (e.button === 0) this.mouseDown.left = true;
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
        const localPlayer = this.snapshot && this.snapshot.players.find((p) => p.id === this.localId);
        const adsMult = localPlayer && localPlayer.ads ? (localPlayer.weaponId === 'sniper' ? 0.35 : 0.65) : 1.0;
        const sens = this.settings.sensitivity * adsMult;
        this.yaw += e.movementX * sens;
        this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch - e.movementY * sens));
      });

      window.addEventListener('wheel', (e) => {
        if (this.state !== 'playing' || !this.pointerLocked) return;
        if (this.settings.modeId === 'gungame') return;
        const dir = e.deltaY > 0 ? 1 : -1;
        let next = this.currentWeaponSlot + dir;
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

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') {
          this.pendingDash = true;
        }
        if (e.code === 'KeyR') {
          this.pendingReload = true;
        }
        if (e.code === 'KeyV') {
          this.renderer.thirdPerson = !this.renderer.thirdPerson;
          document.getElementById('cam-mode-pill').textContent = this.renderer.thirdPerson
            ? '3RD PERSON [V]'
            : '1ST PERSON [V]';
          this.audio.playUiClick();
        }
        if (e.code === 'KeyQ' && this.settings.modeId !== 'gungame') {
          this._selectWeaponSlot(this.lastWeaponSlot);
        }
        if (e.code.startsWith('Digit') && this.settings.modeId !== 'gungame') {
          const num = parseInt(e.code.replace('Digit', ''), 10);
          if (num >= 1 && num <= BS.WEAPONS.length) {
            this._selectWeaponSlot(num);
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

    _selectWeaponSlot(slot) {
      if (slot !== this.currentWeaponSlot) {
        this.lastWeaponSlot = this.currentWeaponSlot;
        this.currentWeaponSlot = slot;
        this.pendingWeaponSlot = slot;
      }
    }

    _resize2D() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas2d.width = Math.floor(window.innerWidth * dpr);
      this.canvas2d.height = Math.floor(window.innerHeight * dpr);
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
        const width = w.id === 'sniper' ? 0.075 : 0.04;
        const life = w.id === 'sniper' ? 0.24 : 0.1;
        ev.hits.forEach((h) => {
          this.renderer.addTracer(sx, sy, sz, h.x, h.y, h.z, w.tracerColor, width, life);
          this.renderer.addImpactSparks(h.x, h.y, h.z, h.hitPlayer ? [1, 0.9, 0.25] : w.tracerColor, h.hitPlayer ? 7 : 4);
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
            this.damageIndicators.push({ x: attacker.x, z: attacker.z, life: 0.9, maxLife: 0.9 });
          }
        }
      } else if (ev.type === 'kill') {
        if (ev.victimColors) {
          this.renderer.addBlockShatter(ev.x, ev.y, ev.z, ev.victimColors);
        }
        this.audio.playBlockShatter(distScale(ev.x, ev.y, ev.z));
        this._pushKillfeed(ev);

        if (ev.killerId === this.localId) {
          this.hitmarkerTimer = 0.26;
          this.hitmarkerCrit = true;
          this.audio.playKill(ev.streak);
          const streakTitle = STREAK_LABELS[ev.streak];
          if (streakTitle) {
            this._showBanner(streakTitle, ev.headshot ? 'HEADSHOT ELIMINATION!' : `${ev.streak} KO STREAK`);
          } else if (ev.headshot) {
            this._showBanner('HEADSHOT KO!', `+125 • ${ev.victimName}`);
          }
        }
      } else if (ev.type === 'explosion') {
        this.renderer.addExplosion(ev.x, ev.y, ev.z, ev.radius);
        const s = distScale(ev.x, ev.y, ev.z);
        this.audio.playExplosion(s);
        if (s > 0.4) this.renderer.addScreenShake(0.32 * s);
      } else if (ev.type === 'jumpPad' && ev.playerId === this.localId) {
        this.audio.playJumpPad();
      } else if (ev.type === 'dash' && ev.playerId === this.localId) {
        this.audio.playDash();
      } else if (ev.type === 'pickup' && ev.playerId === this.localId) {
        this.audio.playPickup(ev.pickupType);
        const msg =
          ev.pickupType === 'health'
            ? '+45 HEALTH'
            : ev.pickupType === 'shield'
            ? '+50 SHIELD'
            : 'SPEED BOOST!';
        this._showBanner(msg, 'POWERUP COLLECTED', 1.1);
      } else if (ev.type === 'reload' && ev.playerId === this.localId) {
        this.audio.playReload();
      }
    }

    _pushKillfeed(ev) {
      const feed = document.getElementById('killfeed');
      const w = BS.WEAPON_BY_ID[ev.weaponId];
      const wLabel = w ? w.shortName : 'VOID';
      const row = document.createElement('div');
      row.className = 'killfeed-item' + (ev.killerId === this.localId || ev.victimId === this.localId ? ' mine' : '');
      const teamCls = (t) => (t === 'blue' ? 't-blue' : t === 'red' ? 't-red' : 't-ffa');
      row.innerHTML = `
        <span class="${teamCls(ev.killerTeam)}">${this._esc(ev.killerName)}</span>
        <span class="kf-weapon">[${wLabel}${ev.headshot ? ' ★' : ''}]</span>
        <span class="${teamCls(ev.victimTeam)}">${this._esc(ev.victimName)}</span>
      `;
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
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
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
            this.prevBaseYaw = this.yaw;
            this.prevBasePitch = this.pitch;
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
        const renderLp = renderSnap.players.find((p) => p.id === this.localId);

        // Smooth camera foot height on step-ups while tracking jumps/falls immediately
        if (renderLp) {
          const targetY = renderLp.y;
          if (this.camFootY === null || !renderLp.grounded || Math.abs(targetY - this.camFootY) >= 0.65) {
            this.camFootY = targetY;
          } else {
            this.camFootY += (targetY - this.camFootY) * Math.min(1, dt * 14);
          }
        }

        // Viewmodel mouse sway from base look deltas
        const dYaw = this.yaw - this.prevBaseYaw;
        const dPitch = this.pitch - this.prevBasePitch;
        this.prevBaseYaw = this.yaw;
        this.prevBasePitch = this.pitch;
        const safeDt = Math.max(dt, 0.004);
        const swayTargetX = Math.max(-0.07, Math.min(0.07, (-dYaw / safeDt) * 0.012));
        const swayTargetY = Math.max(-0.07, Math.min(0.07, (-dPitch / safeDt) * 0.012));
        const swayBlend = Math.min(1, dt * 12);
        this.swayX += (swayTargetX - this.swayX) * swayBlend;
        this.swayY += (swayTargetY - this.swayY) * swayBlend;

        const viewYaw = this.yaw + this.recoilYaw;
        const viewPitch = Math.max(-1.48, Math.min(1.48, this.pitch + this.recoilPitch));

        this.renderer.render(
          renderSnap,
          this.localId,
          {
            yaw: viewYaw,
            pitch: viewPitch,
            footY: this.camFootY,
            swayX: this.swayX,
            swayY: this.swayY,
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
          this.ctx2d.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
      }

      requestAnimationFrame((t) => this._loop(t));
    }

    _sendLocalInput(dt) {
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
      const localSimP = this.sim.playerMap[this.localId];
      if (this.renderer.thirdPerson && localSimP && localSimP.alive && this.snapshot) {
        // Note: uses static map/world raycast from sim; for online MP, replace with client-side map raycast.
        const camP = this.renderer.camPos;
        const camF = this.renderer.camForward;
        const res = this.sim.raycastWorldAndPlayers(camP[0], camP[1], camP[2], camF[0], camF[1], camF[2], 200, localSimP);
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

      const cmd = {
        seq: ++this.seq,
        moveX,
        moveZ,
        yaw: aimYaw,
        pitch: aimPitch,
        jump: !!this.keys['Space'],
        dash: this.pendingDash,
        fire: this.mouseDown.left && this.pointerLocked,
        ads: this.mouseDown.right && this.pointerLocked,
        reload: this.pendingReload,
        weaponSlot: this.pendingWeaponSlot,
      };

      this.pendingDash = false;
      this.pendingReload = false;
      this.pendingWeaponSlot = null;

      this.transport.sendInput(cmd);
    }

    _updateHUD(dt, lp) {
      if (!lp) return;

      // Hitmarker & Hurt Vignette decay
      if (this.hitmarkerTimer > 0) this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
      const hm = document.getElementById('hitmarker');
      hm.classList.toggle('active', this.hitmarkerTimer > 0);
      hm.classList.toggle('crit', this.hitmarkerCrit);

      if (this.hurtVignette > 0) this.hurtVignette = Math.max(0, this.hurtVignette - dt * 2.2);
      document.getElementById('damage-vignette').style.opacity = this.hurtVignette.toFixed(2);

      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) document.getElementById('announce-banner').classList.add('hidden');
      }

      // Dynamic crosshair spread & Sniper Scope
      const w = BS.WEAPON_BY_ID[lp.weaponId] || BS.WEAPONS[0];
      const scoped = w.id === 'sniper' && lp.ads && lp.alive && !this.renderer.thirdPerson && this.renderer.fovDeg < 45;
      document.getElementById('sniper-scope').classList.toggle('hidden', !scoped);
      const ch = document.getElementById('crosshair');
      ch.classList.toggle('hidden', scoped || !lp.alive);
      const gap = Math.round(6 + Math.hypot(lp.vx, lp.vz) * 0.7 + lp.recoilKick * 18 - (lp.ads ? 4 : 0));
      ch.style.setProperty('--gap', Math.max(3, gap) + 'px');

      // Top score bar & timer
      const mins = Math.floor(this.snapshot.timeLeft / 60);
      const secs = Math.floor(this.snapshot.timeLeft % 60);
      document.getElementById('hud-timer').textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      const mode = BS.MODES[this.snapshot.modeId];
      document.getElementById('hud-mode-label').textContent = mode ? mode.short : 'MATCH';

      const blueEl = document.getElementById('score-blue');
      const redEl = document.getElementById('score-red');
      if (mode && mode.teams) {
        blueEl.textContent = `BLUE ${this.snapshot.scores.blue}`;
        redEl.textContent = `RED ${this.snapshot.scores.red}`;
      } else {
        const sorted = this.snapshot.players.slice().sort((a, b) => b.kills - a.kills);
        const top = sorted[0];
        blueEl.textContent = `YOU ${lp.kills}`;
        redEl.textContent = top ? `LEAD ${top.kills}` : 'LEAD 0';
      }

      // Health, Shield, Dash, Speed Boost
      document.getElementById('hp-fill').style.width = `${Math.max(0, lp.hp)}%`;
      document.getElementById('hp-val').textContent = Math.ceil(lp.hp);
      document.getElementById('shield-fill').style.width = `${(lp.shield / BS.PLAYER.MAX_SHIELD) * 100}%`;
      document.getElementById('shield-val').textContent = Math.ceil(lp.shield);

      const dashReady = lp.dashCooldown <= 0;
      const dashPct = dashReady ? 100 : (1 - lp.dashCooldown / BS.PLAYER.DASH_COOLDOWN) * 100;
      document.getElementById('dash-fill').style.width = `${dashPct}%`;
      document.getElementById('dash-label').textContent = dashReady ? 'DASH READY [SHIFT]' : 'RECHARGING...';

      const speedPill = document.getElementById('speed-pill');
      speedPill.classList.toggle('hidden', lp.speedBoostTimer <= 0);
      if (lp.speedBoostTimer > 0) {
        speedPill.textContent = `SPEED BOOST ${lp.speedBoostTimer.toFixed(1)}s`;
      }

      // Weapon & Ammo
      this.currentWeaponSlot = w.slot;
      document.getElementById('weapon-name').textContent = w.name;
      document.getElementById('ammo-cur').textContent = w.type === 'melee' ? '∞' : lp.ammo;
      document.getElementById('ammo-max').textContent = w.type === 'melee' ? '' : `/ ${lp.magSize}`;

      const reloadWrap = document.getElementById('reload-wrap');
      reloadWrap.classList.toggle('hidden', !lp.reloading);
      if (lp.reloading) {
        document.getElementById('reload-fill').style.width = `${Math.min(100, lp.reloadProgress * 100)}%`;
      }

      // Highlight active hotbar slot
      document.querySelectorAll('#weapon-hotbar .hotbar-slot').forEach((el) => {
        el.classList.toggle('active', el.dataset.weaponId === lp.weaponId);
      });

      // Respawn overlay
      const resp = document.getElementById('respawn-overlay');
      resp.classList.toggle('hidden', lp.alive || this.state !== 'playing');
      if (!lp.alive) {
        document.getElementById('respawn-timer').textContent = Math.max(0.1, lp.respawnTimer).toFixed(1) + 's';
      }
    }

    _renderOverlay2D(dt, lp, snap) {
      const ctx = this.ctx2d;
      const W = window.innerWidth;
      const H = window.innerHeight;
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

        const scr = this.renderer.projectToScreen(p.x, p.y + 2.28, p.z);
        if (!scr) continue;

        const barW = Math.max(38, Math.min(68, 700 / Math.max(6, dist)));
        const barH = 5;
        ctx.save();
        ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10,14,24,0.72)';
        const textW = ctx.measureText(p.name).width + 10;
        ctx.fillRect(scr.x - textW / 2, scr.y - 22, textW, 16);
        ctx.fillStyle = isFriendly ? '#4cc9ff' : '#ff6b72';
        ctx.fillText(p.name, scr.x, scr.y - 10);

        // HP bar
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(scr.x - barW / 2 - 1, scr.y - 3, barW + 2, barH + 2);
        ctx.fillStyle = isFriendly ? '#29b6f6' : '#ff3d54';
        ctx.fillRect(scr.x - barW / 2, scr.y - 2, barW * (p.hp / BS.PLAYER.MAX_HP), barH);
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
        ctx.restore();
      }
    }

    _renderMinimap(lp, snap) {
      const ctx = this.minimapCtx;
      const size = this.minimapCanvas.width;
      const half = size / 2;
      const scale = 2.1; // pixels per world unit

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, half - 2, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = 'rgba(11, 16, 28, 0.85)';
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
      ctx.restore();
    }

    _renderScoreboard(targetBodyId = 'scoreboard-body') {
      const tbody = document.getElementById(targetBodyId);
      if (!tbody || !this.snapshot) return;
      const sorted = this.snapshot.players
        .slice()
        .sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths);

      tbody.innerHTML = sorted
        .map((p, idx) => {
          const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(2);
          const teamTag =
            p.team === 'blue'
              ? '<span class="pill blue">BLUE</span>'
              : p.team === 'red'
              ? '<span class="pill red">RED</span>'
              : '<span class="pill ffa">FFA</span>';
          const mine = p.id === this.localId ? ' class="me"' : '';
          return `<tr${mine}>
            <td>#${idx + 1}</td>
            <td>${teamTag} ${this._esc(p.name)}${p.isBot ? ' <span class="bot-tag">BOT</span>' : ''}</td>
            <td>${p.kills}</td>
            <td>${p.deaths}</td>
            <td>${kd}</td>
            <td>${p.score}</td>
          </tr>`;
        })
        .join('');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      global.bloxStrikeApp = new BloxStrikeClient();
    } catch (err) {
      document.body.innerHTML = `<div style="color:#fff;padding:40px;font-family:sans-serif;background:#0f1422;height:100vh;">
        <h1>Unable to initialize 3D WebGL2</h1>
        <p>${err.message}</p>
      </div>`;
    }
  });
})(window);
