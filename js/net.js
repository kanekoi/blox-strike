// Blox Strike - Multiplayer-Ready Network Transport Abstraction
// Today: LocalLoopbackTransport runs the authoritative GameSim in-browser at 60Hz.
// Tomorrow: Swap in WebSocketTransport (or WebRTC) with zero changes to Renderer/HUD/Input!

(function (global) {
  const BS = (global.BloxStrike = global.BloxStrike || {});

  /**
   * Standard serializable InputCommand sent from Client -> Server each tick:
   * {
   *   seq: number,
   *   moveX: -1..1,
   *   moveZ: -1..1,
   *   yaw: number,
   *   pitch: number,
   *   jump: boolean,
   *   dash: boolean,
   *   fire: boolean,
   *   ads: boolean,
   *   reload: boolean,
   *   weaponSlot: number | null
   * }
   */

  class LocalLoopbackTransport {
    constructor(sim) {
      this.sim = sim;
      this.mode = 'LOCAL_HOST';
      this.localPlayerId = null;
      this.snapshotListeners = [];
      this.eventListeners = [];
      this.accumulator = 0;
      this.prevState = null;
      this.alpha = 0;
      this.simulatedPingMs = 0; // Set >0 in dev to test latency tolerance
      this.stats = {
        tickRate: BS.TICK_RATE,
        pingMs: 0,
        packetsPerSec: BS.TICK_RATE,
      };
    }

    connect(options) {
      this.accumulator = 0;
      this.prevState = null;
      this.alpha = 0;
      this.sim.startMatch(options);
      this.localPlayerId = this.sim.localPlayerId;
      this._emitSnapshot();
      return {
        playerId: this.localPlayerId,
        mode: this.mode,
      };
    }

    sendInput(cmd) {
      if (!this.localPlayerId) return;
      this.sim.setPlayerInput(this.localPlayerId, cmd);
    }

    // Advance authoritative local simulation synchronized to exact display frame dt
    // (sub-divided to <= FIXED_DT so AABB physics stays rock-solid with zero VSync beat jitter or 1-tick lag!)
    stepFrame(dt) {
      const clamped = Math.min(Math.max(dt, 0), 0.05);
      if (clamped <= 0) return;
      const steps = Math.max(1, Math.ceil(clamped / BS.FIXED_DT));
      const subDt = clamped / steps;
      for (let s = 0; s < steps; s++) {
        const events = this.sim.step(subDt);
        if (events && events.length) {
          for (let i = 0; i < events.length; i++) {
            this._emitEvent(events[i]);
          }
        }
      }
      this.prevState = null;
      this.alpha = 1;
      this._emitSnapshot();
    }

    getInterpolation() {
      return {
        prev: this.prevState || null,
        alpha: this.alpha || 0,
      };
    }

    onSnapshot(cb) {
      this.snapshotListeners.push(cb);
    }

    onEvent(cb) {
      this.eventListeners.push(cb);
    }

    _emitSnapshot() {
      const snap = this.sim.getSnapshot();
      for (let i = 0; i < this.snapshotListeners.length; i++) {
        this.snapshotListeners[i](snap);
      }
    }

    _emitEvent(ev) {
      for (let i = 0; i < this.eventListeners.length; i++) {
        this.eventListeners[i](ev);
      }
    }

    disconnect() {
      this.localPlayerId = null;
    }
  }

  function sanitizeOutgoingInput(cmd) {
    if (!cmd || typeof cmd !== 'object') return null;
    const num = (v, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
    const slot =
      Number.isInteger(cmd.weaponSlot) && cmd.weaponSlot >= 1 && cmd.weaponSlot <= BS.WEAPONS.length
        ? cmd.weaponSlot
        : null;
    return {
      seq: Number.isInteger(cmd.seq) && cmd.seq >= 0 ? cmd.seq : 0,
      moveX: Math.max(-1, Math.min(1, num(cmd.moveX, 0))),
      moveZ: Math.max(-1, Math.min(1, num(cmd.moveZ, 0))),
      yaw: num(cmd.yaw, 0),
      pitch: Math.max(-1.48, Math.min(1.48, num(cmd.pitch, 0))),
      jump: !!cmd.jump,
      dash: !!cmd.dash,
      crouch: !!cmd.crouch,
      grenade: !!cmd.grenade,
      fire: !!cmd.fire,
      ads: !!cmd.ads,
      reload: !!cmd.reload,
      weaponSlot: slot,
    };
  }

  function safeParsePacket(raw) {
    if (typeof raw !== 'string') return null;
    const maxBytes = (BS.SECURITY && BS.SECURITY.MAX_PACKET_BYTES) || 65536;
    if (raw.length > maxBytes) return null;
    try {
      const parsed = JSON.parse(raw, (key, val) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
        return val;
      });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      if (typeof parsed.type !== 'string' || parsed.type.length > 32) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function isAllowedWsUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      return u.protocol === 'ws:' || u.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  /**
   * Drop-in WebSocketTransport template for future online multiplayer.
   * Run js/config.js + js/sim.js inside Node.js (ws / uWebSockets / PartyKit)
   * and point this transport at wss://your-server:port to play online!
   */
  class WebSocketTransport {
    constructor(url) {
      if (!isAllowedWsUrl(url)) {
        throw new Error('WebSocketTransport requires a valid ws:// or wss:// URL.');
      }
      this.url = url;
      this.ws = null;
      this.mode = 'REMOTE_WS';
      this.localPlayerId = null;
      this.snapshotListeners = [];
      this.eventListeners = [];
      this.droppedPackets = 0;
      this.lastSendTime = 0;
      this.stats = { tickRate: BS.TICK_RATE, pingMs: 0, packetsPerSec: 0 };
    }

    connect(options) {
      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
          const safeOpts = options && typeof options === 'object' ? {
            mapId: typeof options.mapId === 'string' ? options.mapId : 'crossroads',
            modeId: typeof options.modeId === 'string' ? options.modeId : 'tdm',
            botCount: Number.isFinite(options.botCount) ? options.botCount : 7,
            difficulty: typeof options.difficulty === 'string' ? options.difficulty : 'medium',
            playerName: typeof options.playerName === 'string' ? options.playerName.slice(0, 16) : 'BloxPlayer',
            skinId: typeof options.skinId === 'string' ? options.skinId : 'classic',
            accessoryId: typeof options.accessoryId === 'string' ? options.accessoryId : 'auto',
            weaponSkinId: typeof options.weaponSkinId === 'string' ? options.weaponSkinId : 'default',
          } : {};
          this.ws.send(JSON.stringify({ type: 'join', options: safeOpts }));
        };
        this.ws.onmessage = (msg) => {
          const data = safeParsePacket(msg && msg.data);
          if (!data) {
            this.droppedPackets++;
            return;
          }
          if (data.type === 'welcome' && typeof data.playerId === 'string' && data.playerId.length <= 48) {
            this.localPlayerId = data.playerId;
            resolve({
              playerId: this.localPlayerId,
              mode: this.mode,
              mapId: typeof data.mapId === 'string' ? data.mapId : 'crossroads',
              modeId: typeof data.modeId === 'string' ? data.modeId : 'tdm',
            });
          } else if (
            data.type === 'snapshot' &&
            data.payload &&
            typeof data.payload === 'object' &&
            Array.isArray(data.payload.players)
          ) {
            this.snapshotListeners.forEach((cb) => cb(data.payload));
          } else if (
            data.type === 'event' &&
            data.payload &&
            typeof data.payload === 'object' &&
            typeof data.payload.type === 'string'
          ) {
            this.eventListeners.forEach((cb) => cb(data.payload));
          } else {
            this.droppedPackets++;
          }
        };
        this.ws.onerror = (err) => reject(err);
        this.ws.onclose = () => {
          reject(new Error('LAN server closed the connection.'));
          if (this.onClose) this.onClose();
        };
      });
    }

    sendInput(cmd, force = false) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      // Client-side rate limit (~65Hz max) to avoid spamming remote server
      if (!force && now - this.lastSendTime < 15 && !cmd.dash && !cmd.grenade && !cmd.reload && cmd.weaponSlot === null) return false; // not sent: caller keeps its pending taps
      const clean = sanitizeOutgoingInput(cmd);
      if (!clean) return;
      this.lastSendTime = now;
      this.ws.send(JSON.stringify({ type: 'input', payload: clean }));
    }

    stepFrame() {
      // Remote server drives ticks; client interpolation happens in Renderer/Client.
    }

    getInterpolation() {
      // Future: interpolate across buffered server snapshots.
      return { prev: null, alpha: 1 };
    }

    onSnapshot(cb) {
      this.snapshotListeners.push(cb);
    }

    onEvent(cb) {
      this.eventListeners.push(cb);
    }

    disconnect() {
      if (this.ws) {
        this.ws.onclose = null; // intentional leave: don't fire onClose
        this.ws.close();
        this.ws = null;
      }
    }
  }

  BS.LocalLoopbackTransport = LocalLoopbackTransport;
  BS.WebSocketTransport = WebSocketTransport;
  BS.safeParsePacket = safeParsePacket;
  BS.isAllowedWsUrl = isAllowedWsUrl;
})(window);
