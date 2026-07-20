// UCG.Minimap: small canvas minimap (bottom-left). Terrain is baked once into an offscreen canvas
// (dirty tiles re-baked on node depletion). The visible canvas is recomposited a few times a second
// (not per frame) with entity dots (civ colors), the camera view rect, and attack-ping flashes from
// own-side attack events. Clicking jumps the camera.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, P = C.TILE_PX;
  const S_PX = 2;                         // minimap pixels per tile (96x56 -> 192x112)
  const REDRAW_MS = 200;                  // composite cadence (dots at ~5 Hz, not per-frame)
  const PING_MS = 700;
  // Matches the new world palette (grass warm, rock cool, gold ore amber).
  const TERRAIN_COL = {
    0: '#5c7f3f', 1: '#33501f', 2: '#6f6b60', 3: '#2f6fb0', 4: '#b88a2a', 5: '#b39a6a'
  };

  function cssColor(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6); }

  UCG.Minimap = {
    create(scene) {
      const map = UCG.State.map;
      this.w = map.w * S_PX; this.h = map.h * S_PX;

      const wrap = document.createElement('div');
      wrap.id = 'minimap';
      const cv = document.createElement('canvas');
      cv.width = this.w; cv.height = this.h;
      cv.style.width = this.w + 'px'; cv.style.height = this.h + 'px';
      wrap.appendChild(cv);
      document.body.appendChild(wrap);
      this.cv = cv; this.ctx = cv.getContext('2d');

      // Offscreen baked terrain.
      const bake = document.createElement('canvas');
      bake.width = this.w; bake.height = this.h;
      this.bakeCtx = bake.getContext('2d');
      this.bake = bake;
      this.bakeAll();

      this.cam = scene.cameras.main;
      this.pings = [];
      this.lastTick = -1;
      this._last = 0;

      cv.addEventListener('mousedown', (e) => {
        const r = cv.getBoundingClientRect();
        const tx = (e.clientX - r.left) / (r.width) * map.w;
        const ty = (e.clientY - r.top) / (r.height) * map.h;
        this.cam.centerOn(tx * P, ty * P);
        if (UCG.Audio) UCG.Audio.play('click');
      });

      return { update: () => this.update() };
    },

    bakeAll() {
      const map = UCG.State.map, g = this.bakeCtx;
      for (let ty = 0; ty < map.h; ty++) {
        for (let tx = 0; tx < map.w; tx++) {
          g.fillStyle = TERRAIN_COL[map.tiles[ty * map.w + tx]] || TERRAIN_COL[0];
          g.fillRect(tx * S_PX, ty * S_PX, S_PX, S_PX);
        }
      }
    },

    consumeDirty() {
      const S = UCG.State;
      if (!S.minimapDirty.length) return;
      const g = this.bakeCtx, w = S.map.w;
      for (const i of S.minimapDirty) {
        const tx = i % w, ty = (i - tx) / w;
        g.fillStyle = TERRAIN_COL[S.map.tiles[i]] || TERRAIN_COL[0];
        g.fillRect(tx * S_PX, ty * S_PX, S_PX, S_PX);
      }
      S.minimapDirty.length = 0;
    },

    // Collect own-side attack pings once per server tick.
    collectPings() {
      const S = UCG.State;
      if (S.tick === this.lastTick) return;
      this.lastTick = S.tick;
      const now = performance.now();
      for (const ev of S.events) {
        if (ev.e !== 'attack') continue;
        const f = S.entities.get(ev.from), t = S.entities.get(ev.to);
        const own = (f && f.side === C.SIDE.PLAYERS) || (t && t.side === C.SIDE.PLAYERS);
        if (!own) continue;
        const tgt = t || f;
        if (tgt) this.pings.push({ x: tgt.x, y: tgt.y, born: now });
      }
    },

    update() {
      this.consumeDirty();
      this.collectPings();
      const now = performance.now();
      if (now - this._last < REDRAW_MS) return;
      this._last = now;

      const g = this.ctx;
      g.clearRect(0, 0, this.w, this.h);
      g.drawImage(this.bake, 0, 0);

      // Entity dots: buildings as footprint blocks, units as small dots, colored by side civ.
      for (const e of UCG.State.entities.values()) {
        g.fillStyle = cssColor(UCG.State.civColor(e.side));
        if (e.k === C.KIND.BUILDING) {
          const def = UCG_BUILDINGS[e.type];
          const fw = (e.foot ? e.foot[0] : (def ? def.foot[0] : 1)) * S_PX;
          const fh = (e.foot ? e.foot[1] : (def ? def.foot[1] : 1)) * S_PX;
          g.fillRect(e.tx * S_PX, e.ty * S_PX, Math.max(2, fw), Math.max(2, fh));
        } else {
          g.fillRect(e.x * S_PX - 1, e.y * S_PX - 1, 2, 2);
        }
      }

      // Attack pings (expanding fading rings).
      for (let i = this.pings.length - 1; i >= 0; i--) {
        const pg = this.pings[i];
        const age = (now - pg.born) / PING_MS;
        if (age >= 1) { this.pings.splice(i, 1); continue; }
        g.strokeStyle = 'rgba(255,80,80,' + (1 - age).toFixed(2) + ')';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(pg.x * S_PX, pg.y * S_PX, 1 + age * 5, 0, Math.PI * 2);
        g.stroke();
      }

      // Camera view rectangle (gold accent, per design spec).
      const v = this.cam.worldView;
      g.strokeStyle = 'rgba(232,182,76,0.95)';
      g.lineWidth = 1;
      g.strokeRect(v.x / P * S_PX + 0.5, v.y / P * S_PX + 0.5,
        v.width / P * S_PX, v.height / P * S_PX);
    }
  };
})(window.UCG);
