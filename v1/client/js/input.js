// UCG.Input: unit selection (click + drag box of own units incl. military), control groups 1-5,
// right-click context orders (move / attack-move onto enemy / gather / build / farm / rally),
// attack-move arming (A), wall drag-place line, placement ghost with validity tint, throttled
// cursor broadcast.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, P = C.TILE_PX;
  const DRAG_PX = 6;

  UCG.Input = {
    placementType: null,
    selected: new Set(),        // own unit ids
    selectedBuilding: null,     // own building id or null
    groups: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    rally: {},                  // buildingId -> {tx,ty} (client-local rally indicator)
    attackArmed: false,

    create(scene, cam) {
      this.scene = scene;
      this.cam = cam;                // camera controller, so a left-drag can hand off the pan
      this.ghost = scene.add.image(0, 0, 'b_house').setOrigin(0, 0).setAlpha(0.55).setDepth(500).setVisible(false);
      this.box = scene.add.rectangle(0, 0, 1, 1, 0x66ff66, 0.15)
        .setStrokeStyle(1, 0x66ff66, 0.9).setOrigin(0, 0).setDepth(500).setVisible(false);
      this._lastCursor = 0;
      this._down = null;          // {x,y,worldX,worldY} at left-button press
      this._dragging = false;
      this._wallDrag = null;      // {tx,ty} start tile while dragging a wall line

      scene.input.mouse.disableContextMenu();
      scene.input.on('pointermove', (p) => this.onMove(p));
      scene.input.on('pointerdown', (p) => this.onDown(p));
      scene.input.on('pointerup', (p) => this.onUp(p));
      scene.input.keyboard.on('keydown-ESC', () => { this.cancel(); this.attackArmed = false; this.clearSelection(); });
      scene.input.keyboard.on('keydown-A', () => { if (this.selected.size) this.attackArmed = true; });
      scene.input.keyboard.on('keydown', (ev) => this.onKey(ev));

      return { update: () => { } };
    },

    // Control groups live on the modifiers: plain digits belong to the build bar.
    // Ctrl/Cmd+1-5 sets a group, Alt+1-5 recalls it. Matched on ev.code because Alt rewrites ev.key.
    onKey(ev) {
      const m = /^Digit([1-5])$/.exec(ev.code);
      if (!m) return;
      const n = +m[1];
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        this.groups[n] = [...this.selected];
      } else if (ev.altKey) {
        ev.preventDefault();
        const ids = this.groups[n].filter((id) => UCG.State.entities.has(id));
        this.groups[n] = ids;
        this.clearSelection();
        for (const id of ids) this.selected.add(id);
      }
    },

    begin(type) {
      this.attackArmed = false;
      this.placementType = type;
      if (!type) { this.ghost.setVisible(false); return; }
      const f = UCG.Frames.building[type];
      if (f) this.ghost.setTexture(f.tex);
      this.ghost.setVisible(true);
    },

    cancel() {
      this.placementType = null;
      this._wallDrag = null;
      this.ghost.setVisible(false);
    },

    clearSelection() {
      this.selected.clear();
      this.selectedBuilding = null;
    },

    tileUnder(p) {
      return { tx: Math.floor(p.worldX / P), ty: Math.floor(p.worldY / P) };
    },

    mark(tx, ty, attack) { if (UCG.EntitiesCtl) UCG.EntitiesCtl.marker(tx + 0.5, ty + 0.5, attack); },

    onMove(p) {
      const now = performance.now();
      if (now - this._lastCursor >= 1000 / C.CURSOR_RATE) {
        this._lastCursor = now;
        UCG.Net.send({ t: C.MSG.CURSOR, x: p.worldX / P, y: p.worldY / P });
      }
      this.updateCursor(p);
      // Right-drag draws the selection box.
      if (this._sel && p.rightButtonDown()) {
        if (!this._dragging &&
          (Math.abs(p.x - this._sel.x) > DRAG_PX || Math.abs(p.y - this._sel.y) > DRAG_PX)) {
          this._dragging = true;
          this.box.setVisible(true);
        }
        if (this._dragging) {
          const x0 = Math.min(this._sel.worldX, p.worldX), y0 = Math.min(this._sel.worldY, p.worldY);
          this.box.setPosition(x0, y0);
          this.box.width = Math.abs(p.worldX - this._sel.worldX);
          this.box.height = Math.abs(p.worldY - this._sel.worldY);
        }
        return;
      }
      // Left-drag past the threshold grabs the map and hands the pan to the camera.
      if (this._down && p.leftButtonDown() && !this._wallDrag && !this.placementType) {
        if (!this._panning &&
          (Math.abs(p.x - this._down.x) > DRAG_PX || Math.abs(p.y - this._down.y) > DRAG_PX)) {
          this._panning = true;
          if (this.cam && this.cam.beginDrag) this.cam.beginDrag(p);
        }
        return;
      }
      if (!this.placementType) return;
      const { tx, ty } = this.tileUnder(p);
      this.ghost.setPosition(tx * P, ty * P);
      const ok = this.canPlace(this.placementType, tx, ty);
      this._ghostOk = ok;
      this.ghost.setTint(ok ? 0x7fb069 : 0xe05545);
      this.updateCursor(p);
    },

    // Context cursor: attack over enemies (military selected), hand over resources (workers selected).
    updateCursor(p) {
      let kind = 'idle';
      if (this._panning) kind = 'grab';
      else if (this.placementType) kind = this._ghostOk === false ? 'no' : 'cross';
      else if (this.selected.size) {
        const wx = p.worldX / P, wy = p.worldY / P;
        let mil = false, work = false;
        for (const id of this.selected) {
          const e = UCG.State.entities.get(id); if (!e) continue;
          if (e.type === 'worker') work = true;
          else if (e.type !== 'cart') mil = true;
        }
        const enemyU = this.enemyUnitAt(wx, wy);
        const b = this.buildingAt(Math.floor(wx), Math.floor(wy));
        const enemyB = b && b.side !== C.SIDE.PLAYERS && b.type !== 'road';
        if (mil && (enemyU || enemyB)) kind = 'attack';
        else if (work && UCG.State.nodesByTile.get(Math.floor(wy) * UCG.State.map.w + Math.floor(wx))) kind = 'hand';
      }
      this.setCursor(kind);
    },

    // Every pointer state has its own art — the native cursor must never appear in-game.
    setCursor(kind) {
      if (this._cursor === kind) return;
      this._cursor = kind;
      this.scene.input.setDefaultCursor(UCG.CURSORS[kind] || UCG.CURSORS.idle);
    },

    shakeGhost() {
      if (!this.ghost.visible) return;
      const bx = this.ghost.x;
      this.scene.tweens.add({ targets: this.ghost, x: bx + 2, duration: 40, yoyo: true, repeat: 1, onComplete: () => { this.ghost.x = bx; } });
    },

    // Mouse scheme (owner's spec): LEFT = grab the map / issue orders, RIGHT = select units.
    onDown(p) {
      if (p.rightButtonDown()) { this._sel = { x: p.x, y: p.y, worldX: p.worldX, worldY: p.worldY }; return; }
      if (!p.leftButtonDown()) return;
      const { tx, ty } = this.tileUnder(p);

      // Armed attack-move: next left-click issues an attack-move to the ground.
      if (this.attackArmed && this.selected.size) {
        UCG.Net.send({ t: C.MSG.MOVE, ids: [...this.selected], tx, ty, attack: true });
        this.mark(tx, ty, true);
        this.attackArmed = false;
        return;
      }

      if (this.placementType) {
        if (this.placementType === 'wall') { this._wallDrag = { tx, ty }; return; }
        if (!this.canPlace(this.placementType, tx, ty)) { this.shakeGhost(); if (UCG.Audio) UCG.Audio.play('error'); return; }
        UCG.Net.send({ t: C.MSG.PLACE, building: this.placementType, tx, ty });
        if (UCG.Audio) UCG.Audio.play('place');
        if (!p.event.shiftKey) this.cancel();
        return;
      }
      // Not placing: left press is a potential map grab. It only becomes a pan once the pointer
      // moves past the threshold; a clean press-release stays an order to the selected units.
      this._down = { x: p.x, y: p.y, worldX: p.worldX, worldY: p.worldY, tx, ty };
      this._panning = false;
    },

    onUp(p) {
      // Finish a wall line: place along the drag from start to end tile.
      if (this._wallDrag) {
        const a = this._wallDrag; this._wallDrag = null;
        const b = this.tileUnder(p);
        this.placeWallLine(a, b);
        if (!p.event.shiftKey) this.cancel();
        return;
      }
      // Right button finishes a selection: box if it was dragged, single pick otherwise.
      if (this._sel && !p.leftButtonReleased()) {
        const s = this._sel; this._sel = null;
        if (this._dragging) {
          this._dragging = false;
          this.box.setVisible(false);
          this.selectBox(s.worldX / P, s.worldY / P, p.worldX / P, p.worldY / P, p.event.shiftKey);
        } else {
          this.selectAt(p, p.event.shiftKey);
        }
        return;
      }

      if (!this._down) return;
      const down = this._down; this._down = null;
      // A drag panned the map — no order, no selection change.
      if (this._panning) {
        this._panning = false;
        if (this.cam) this.cam.dragging = false;
        this.updateCursor(p);            // drop the grab cursor immediately on release
        return;
      }
      // A clean left click orders the current selection (move / attack / gather / rally).
      this.issueOrder(p, down);
    },

    placeWallLine(a, b) {
      const dx = b.tx - a.tx, dy = b.ty - a.ty;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      let last = -1;
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const tx = Math.round(a.tx + dx * t), ty = Math.round(a.ty + dy * t);
        const key = ty * C.MAP_W + tx;
        if (key === last) continue;
        last = key;
        if (this.canPlace('wall', tx, ty)) UCG.Net.send({ t: C.MSG.PLACE, building: 'wall', tx, ty });
      }
    },

    // ---- selection ----
    selectBox(x0, y0, x1, y1, additive) {
      const lx = Math.min(x0, x1), hx = Math.max(x0, x1);
      const ly = Math.min(y0, y1), hy = Math.max(y0, y1);
      if (!additive) this.clearSelection();
      let n = 0;
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.UNIT || e.side !== C.SIDE.PLAYERS) continue;
        if (e.x >= lx && e.x <= hx && e.y >= ly && e.y <= hy) { this.selected.add(e.id); n++; }
      }
      if (n && UCG.Audio) UCG.Audio.play('select');
    },

    selectAt(p, additive) {
      const wx = p.worldX / P, wy = p.worldY / P;
      // Nearest own unit within 0.7 tiles.
      let best = null, bestD = 0.7 * 0.7;
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.UNIT || e.side !== C.SIDE.PLAYERS) continue;
        const d = (e.x - wx) ** 2 + (e.y - wy) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        if (!additive) this.clearSelection();
        this.selected.add(best.id);
        if (UCG.Audio) UCG.Audio.play('select');
        return;
      }
      // Own building under tile.
      const b = this.buildingAt(Math.floor(wx), Math.floor(wy));
      this.clearSelection();
      if (b && b.side === C.SIDE.PLAYERS) { this.selectedBuilding = b.id; if (UCG.Audio) UCG.Audio.play('select'); }
    },

    buildingAt(tx, ty) {
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.BUILDING) continue;
        const def = UCG_BUILDINGS[e.type];
        const fw = e.foot ? e.foot[0] : (def ? def.foot[0] : 1);
        const fh = e.foot ? e.foot[1] : (def ? def.foot[1] : 1);
        if (tx >= e.tx && tx < e.tx + fw && ty >= e.ty && ty < e.ty + fh) return e;
      }
      return null;
    },

    // Nearest enemy unit within 0.8 tiles of a world point (for right-click attack).
    enemyUnitAt(wx, wy) {
      let best = null, bestD = 0.8 * 0.8;
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.UNIT || e.side === C.SIDE.PLAYERS) continue;
        const d = (e.x - wx) ** 2 + (e.y - wy) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    },

    // ---- left-click orders (context sensitive: attack / gather / build / move / rally) ----
    issueOrder(p) {
      this.attackArmed = false;
      if (this.placementType) { this.cancel(); return; }
      const { tx, ty } = this.tileUnder(p);
      const wx = p.worldX / P, wy = p.worldY / P;
      if (this.selected.size) {
        const ids = [...this.selected];
        // Attack an enemy entity (unit takes priority, then enemy building under the tile).
        const enemyU = this.enemyUnitAt(wx, wy);
        const b = this.buildingAt(tx, ty);
        if (enemyU) { UCG.Net.send({ t: C.MSG.MOVE, ids, tx, ty, attack: true, target: enemyU.id }); this.mark(tx, ty, true); return; }
        if (b && b.side !== C.SIDE.PLAYERS && b.type !== 'road') {
          UCG.Net.send({ t: C.MSG.MOVE, ids, tx, ty, attack: true, target: b.id }); this.mark(tx, ty, true); return;
        }
        // Gather a resource node / own construction site / own farm.
        const node = UCG.State.nodesByTile.get(ty * UCG.State.map.w + tx);
        if (node) { UCG.Net.send({ t: C.MSG.GATHER, ids, target: node.id }); this.mark(tx, ty, false); return; }
        if (b && b.side === C.SIDE.PLAYERS &&
          ((b.progress !== undefined && b.progress < 1) || b.type === 'farm')) {
          UCG.Net.send({ t: C.MSG.GATHER, ids, target: b.id }); this.mark(tx, ty, false); return;
        }
        UCG.Net.send({ t: C.MSG.MOVE, ids, tx, ty });
        this.mark(tx, ty, false);
        return;
      }
      if (this.selectedBuilding) {
        this.rally[this.selectedBuilding] = { tx, ty };
        UCG.Net.send({ t: C.MSG.RALLY, id: this.selectedBuilding, tx, ty });
        this.mark(tx, ty, false);
      }
    },

    // ---- placement validity (client-side preview; server re-validates) ----
    occupiedTiles() {
      const occ = new Set();
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.BUILDING || e.type === 'road' || e.type === 'gate') continue;
        const fw = e.foot ? e.foot[0] : 1, fh = e.foot ? e.foot[1] : 1;
        for (let dy = 0; dy < fh; dy++)
          for (let dx = 0; dx < fw; dx++) occ.add((e.ty + dy) * C.MAP_W + (e.tx + dx));
      }
      return occ;
    },

    canPlace(type, tx, ty) {
      const map = UCG.State.map;
      if (!map) return false;
      const def = UCG_BUILDINGS[type];
      const [fw, fh] = def.foot;
      const occ = this.occupiedTiles();
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          const x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
          if (map.tiles[y * map.w + x] !== C.TERRAIN.GRASS) return false;
          if (occ.has(y * map.w + x)) return false;
        }
      }
      const r = UCG.State.res;
      if (r.f < def.cost.f || r.w < def.cost.w || r.s < def.cost.s || r.g < def.cost.g) return false;
      return true;
    }
  };
})(window.UCG);
