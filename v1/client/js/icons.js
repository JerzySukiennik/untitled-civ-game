// UCG.Icons: pixel-icon pipeline for the HUD chrome. Resource icons (food/wood/stone/gold/pop) are
// generated as crisp mini-illustrations on an offscreen canvas so they read unambiguously (gold is a
// mineral nugget, NOT a coin — matching the new ore art). Building/unit icons reuse the loaded Phaser
// sprite frames via textures.getBase64 (the proven portrait path), displayed pixelated in CSS.
// All results are data-URLs, cached. costHTML() renders a cost as icon+number microformats.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;
  const PI2 = Math.PI * 2;
  const RES_NAME = { f: 'food', w: 'wood', s: 'stone', g: 'gold' };

  // Draw with logical 0..16 coordinates at `scale` device px per unit; return a data-URL.
  function mk(draw, scale) {
    scale = scale || 3;
    const cv = document.createElement('canvas');
    cv.width = 16 * scale; cv.height = 16 * scale;
    const x = cv.getContext('2d');
    x.scale(scale, scale);
    draw(x);
    return cv.toDataURL();
  }
  function disc(x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, PI2); x.fill(); }

  // ---- generated resource icons ----
  function drawFood(x) {                       // wheat sheaf
    x.strokeStyle = '#cf9a3a'; x.lineWidth = 1; x.lineCap = 'round';
    [[8, 7], [5.3, 7.6], [10.7, 7.6]].forEach(([ex, ey]) => {
      x.beginPath(); x.moveTo(8, 12.5); x.lineTo(ex, ey); x.stroke();
    });
    const ear = (cx, cy, rot) => {
      x.save(); x.translate(cx, cy); x.rotate(rot);
      x.fillStyle = '#e8b93f'; x.beginPath(); x.ellipse(0, 0, 1.7, 3.4, 0, 0, PI2); x.fill();
      x.fillStyle = '#ffe08a'; x.beginPath(); x.ellipse(-0.5, -0.7, 0.7, 1.9, 0, 0, PI2); x.fill();
      x.strokeStyle = '#a9791f'; x.lineWidth = 0.5;
      x.beginPath(); x.moveTo(0, -3); x.lineTo(0, 3); x.stroke();
      x.restore();
    };
    ear(8, 5, 0); ear(5.3, 6, -0.38); ear(10.7, 6, 0.38);
    x.fillStyle = '#7a4a24'; x.fillRect(6, 11, 4, 2.2);
    x.fillStyle = '#5e3718'; x.fillRect(6, 12.4, 4, 0.7);
  }
  function drawWood(x) {                        // two stacked logs with end grain
    const log = (lx, ly, lw) => {
      x.fillStyle = '#7a4a24'; x.fillRect(lx, ly, lw, 4);
      x.fillStyle = '#8f5a2e'; x.fillRect(lx, ly, lw, 1);
      x.fillStyle = '#5e3718'; x.fillRect(lx, ly + 3.3, lw, 0.7);
      x.fillStyle = '#b5793f'; x.beginPath(); x.ellipse(lx + 1.4, ly + 2, 1.4, 1.9, 0, 0, PI2); x.fill();
      x.strokeStyle = '#8a5a2b'; x.lineWidth = 0.6;
      x.beginPath(); x.ellipse(lx + 1.4, ly + 2, 0.75, 1.05, 0, 0, PI2); x.stroke();
    };
    log(2, 9, 12); log(4, 4.5, 10);
  }
  function drawStone(x) {                       // faceted gray boulder
    disc(x, 8, 9, 5.6, '#3f3d38'); disc(x, 8, 9, 5.0, '#6f6b60');
    disc(x, 9.4, 10.4, 3.1, '#55524a'); disc(x, 6.2, 7.2, 3.3, '#8a8578');
    disc(x, 5.4, 6.4, 1.5, '#a8a396');
  }
  function drawGold(x) {                        // gold NUGGET cluster (mineral, not a coin)
    const nugs = [[8, 9, 4.3], [11, 6.6, 2.4], [5, 7, 2.2], [9, 12, 2.0]];
    nugs.forEach(([nx, ny, nr]) => disc(x, nx, ny, nr + 0.6, '#9a6f1e'));
    nugs.forEach(([nx, ny, nr]) => disc(x, nx, ny, nr, '#e8b64c'));
    nugs.forEach(([nx, ny, nr]) => disc(x, nx - nr * 0.32, ny - nr * 0.34, nr * 0.42, '#ffe08a'));
  }
  function drawPop(x) {                         // simple person silhouette (pop fallback)
    disc(x, 8, 5, 3, '#f2efe6');
    x.fillStyle = '#f2efe6';
    x.beginPath(); x.arc(8, 13.5, 5, Math.PI, 0); x.fill();
    x.fillRect(3, 12.5, 10, 1.5);
  }

  UCG.Icons = {
    res: {},          // { food, wood, stone, gold, pop } data-URLs
    _b: {}, _u: {},   // building/unit icon caches
    _ready: false,

    // Idempotent: build resource icons. Pop prefers the worker sprite, falls back to a glyph.
    ensure() {
      if (this._ready) return;
      this._loadSheets();
      this.res.food = mk(drawFood);
      this.res.wood = mk(drawWood);
      this.res.stone = mk(drawStone);
      this.res.gold = mk(drawGold);
      this.res.pop = this.unit('worker') || mk(drawPop);
      this.res.f = this.res.food; this.res.w = this.res.wood;
      this.res.s = this.res.stone; this.res.g = this.res.gold;
      this._ready = true;
    },

    // Raw sheet images for canvas composition. getBase64 cannot read WebGL-backed composed
    // textures, so icons are recomposed here from the same PNGs Phaser loaded (browser-cached).
    _sheets: null,
    _sheetDefs: {
      town: { src: 'assets/tiles/tiny-town_packed.png', cols: 12 },
      farm: { src: 'assets/tiles/tiny-farm_packed.png', cols: 12 },
      battle: { src: 'assets/tiles/tiny-battle_packed.png', cols: 18 }
    },
    _loadSheets() {
      if (this._sheets) return;
      this._sheets = {};
      for (const k in this._sheetDefs) {
        const img = new Image();
        img.src = this._sheetDefs[k].src;
        this._sheets[k] = img;
      }
    },
    // Draw sheet frame `frame` at logical tile (dx,dy) scaled by s onto ctx (16px units).
    _blit(x, sheet, frame, dx, dy, s) {
      const img = this._sheets[sheet];
      if (!img || !img.complete || !img.naturalWidth) return false;
      const cols = this._sheetDefs[sheet].cols;
      const sx = (frame % cols) * 16, sy = Math.floor(frame / cols) * 16;
      x.drawImage(img, sx, sy, 16, 16, dx, dy, 16 * (s || 1), 16 * (s || 1));
      return true;
    },

    building(type) {
      if (this._b[type] !== undefined) return this._b[type];
      this._loadSheets();
      const def = UCG_BUILDINGS[type];
      const r = UCG.Frames.buildingRecipe && UCG.Frames.buildingRecipe[type];
      let url = null;
      if (type === 'road') {
        url = mk((x) => {                       // simple road tile icon
          x.fillStyle = '#c9b18a'; x.fillRect(1, 4, 14, 8);
          x.fillStyle = '#b89b6e'; x.fillRect(3, 6, 2, 2); x.fillRect(9, 8, 2, 2);
        });
      } else if (r && def) {
        const w = def.foot[0] * 16, h = def.foot[1] * 16;
        const cv = document.createElement('canvas');
        const scale = Math.max(1, Math.round(48 / Math.max(w, h)));
        cv.width = w * scale; cv.height = h * scale;
        const x = cv.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.scale(scale, scale);
        let ok = true;
        if (r.scaled !== undefined) {
          ok = this._blit(x, r.sheet, r.scaled, 0, 0, Math.min(w, h) / 16);
        } else if (r.grid) {
          const s = r.scale || 1;
          for (let ry = 0; ry < r.grid.length && ok; ry++)
            for (let rx = 0; rx < r.grid[ry].length && ok; rx++)
              ok = this._blit(x, r.sheet, r.grid[ry][rx], rx * 16 * s, ry * 16 * s, s);
        }
        if (ok) url = cv.toDataURL();
      }
      // Don't cache a null from a not-yet-loaded image; retry on the next call.
      if (url === null && this._sheets && !Object.values(this._sheets).every((i) => i.complete)) return null;
      return (this._b[type] = url);
    },

    unit(type) {
      if (this._u[type] !== undefined) return this._u[type];
      this._loadSheets();
      const f = UCG.Frames.unit[type];
      let url = null;
      if (f && f.frame !== undefined && this._sheetDefs[f.tex]) {
        const cv = document.createElement('canvas');
        cv.width = 48; cv.height = 48;
        const x = cv.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.scale(3, 3);
        if (this._blit(x, f.tex, f.frame, 0, 0, 1)) url = cv.toDataURL();
      } else {
        // Generated placeholder texture (canvas-backed in CANVAS mode only) — try getBase64.
        try {
          if (f && UCG.game && UCG.game.textures.exists(f.tex)) url = UCG.game.textures.getBase64(f.tex, f.frame);
        } catch (e) { url = null; }
      }
      if (url === null && this._sheets && !Object.values(this._sheets).every((i) => i.complete)) return null;
      return (this._u[type] = url);
    },

    // <img> tag for a resource key ('f'|'w'|'s'|'g') or name ('food'...).
    resImg(k, cls) {
      this.ensure();
      const url = this.res[k];
      return url ? `<img class="${cls || 'ric'}" src="${url}" alt="${RES_NAME[k] || k}">` : '';
    },

    // Cost as icon+number microformats. `cost` = {f,w,s,g}.
    costHTML(cost) {
      this.ensure();
      let out = '';
      for (const k of C.RES_KEYS) {
        if (!cost[k]) continue;
        out += `<span class="ci">${this.resImg(k)}<b>${cost[k]}</b></span>`;
      }
      return out || `<span class="ci free">free</span>`;
    }
  };
})(window.UCG);
