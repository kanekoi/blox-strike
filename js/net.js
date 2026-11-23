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

    // Advance authoritative local simulation using fixed 60Hz timestep
    stepFrame(dt) {
      const clamped = Math.min(dt, 0.1);
      this.accumulator += clamped;
      let stepped = false;
      while (this.accumulator >= BS.FIXED_DT) {
        this.prevState = this.sim.captureInterpState();
        const events = this.sim.step(BS.FIXED_DT);
        if (events && events.length) {
          for (let i = 0; i < events.length; i++) {
            this._emitEvent(events[i]);
          }
        }
        this.accumulator -= BS.FIXED_DT;
        stepped = true;
      }
      this.alpha = this.accumulator / BS.FIXED_DT;
      if (stepped) {
        this._emitSnapshot();
      }
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

  /**
   * Drop-in WebSocketTransport template for future online multiplayer.
   * Run js/config.js + js/sim.js inside Node.js (ws / uWebSockets / PartyKit)
   * and point this transport at ws://your-server:port to play online!
   */
  class WebSocketTransport {
    constructor(url) {
      this.url = url;
      this.ws = null;
      this.mode = 'REMOTE_WS';
      this.localPlayerId = null;
      this.snapshotListeners = [];
      this.eventListeners = [];
      this.stats = { tickRate: BS.TICK_RATE, pingMs: 0, packetsPerSec: 0 };
    }

    connect(options) {
      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
          this.ws.send(JSON.stringify({ type: 'join', options }));
        };
        this.ws.onmessage = (msg) => {
          const data = JSON.parse(msg.data);
          if (data.type === 'welcome') {
            this.localPlayerId = data.playerId;
            resolve({ playerId: this.localPlayerId, mode: this.mode });
          } else if (data.type === 'snapshot') {
            this.snapshotListeners.forEach((cb) => cb(data.payload));
          } else if (data.type === 'event') {
            this.eventListeners.forEach((cb) => cb(data.payload));
          }
        };
        this.ws.onerror = (err) => reject(err);
      });
    }

    sendInput(cmd) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'input', payload: cmd }));
      }
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
        this.ws.close();
        this.ws = null;
      }
    }
  }

  BS.LocalLoopbackTransport = LocalLoopbackTransport;
  BS.WebSocketTransport = WebSocketTransport;
})(window);
