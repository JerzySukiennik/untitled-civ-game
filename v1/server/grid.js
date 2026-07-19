// Grid: walkability (Uint8Array), occupancy for building footprints, road overlay, generation counter.
const C = require('../shared/constants.js');

class Grid {
  constructor(tiles) {
    this.w = C.MAP_W;
    this.h = C.MAP_H;
    this.tiles = tiles;                       // terrain id per tile
    this.walk = new Uint8Array(this.w * this.h);
    this.occ = new Int32Array(this.w * this.h).fill(-1); // building id occupying a tile, -1 free
    this.road = new Uint8Array(this.w * this.h);
    this.gate = new Uint8Array(this.w * this.h);         // 0 none, else owner side + 1 (passable by owner only)
    this.gen = 0;                             // bumped on any walkability change
    this.rebuildWalk();
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  terrainWalkable(id) {
    return id === C.TERRAIN.GRASS || id === C.TERRAIN.ROAD;
  }

  rebuildWalk() {
    for (let i = 0; i < this.tiles.length; i++) {
      this.walk[i] = this.terrainWalkable(this.tiles[i]) ? 1 : 0;
    }
  }

  isWalkable(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    return this.walk[i] === 1 && this.occ[i] === -1;
  }

  // Side-aware walkability: a gate tile is passable only by its owning side; everything else is
  // side-agnostic. side < 0 means "ignore ownership" (gates treated as passable).
  walkableFor(tx, ty, side) {
    if (!this.isWalkable(tx, ty)) return false;
    if (side < 0) return true;
    const g = this.gate[this.idx(tx, ty)];
    return g === 0 || g - 1 === side;
  }

  setGate(tx, ty, side) { this.gate[this.idx(tx, ty)] = side + 1; this.gen++; }
  clearGate(tx, ty) { this.gate[this.idx(tx, ty)] = 0; this.gen++; }

  // True if terrain under tile is grass (for placement of most buildings).
  isGrass(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    return this.tiles[this.idx(tx, ty)] === C.TERRAIN.GRASS;
  }

  isOccupied(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    return this.occ[this.idx(tx, ty)] !== -1;
  }

  // Can a WxH footprint anchored at (tx,ty) be placed: in-bounds, grass, unoccupied.
  canPlace(tx, ty, fw, fh) {
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!this.inBounds(x, y)) return false;
        if (!this.isGrass(x, y)) return false;
        if (this.isOccupied(x, y)) return false;
      }
    }
    return true;
  }

  stamp(tx, ty, fw, fh, id) {
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        this.occ[this.idx(tx + dx, ty + dy)] = id;
      }
    }
    this.gen++;
  }

  unstamp(tx, ty, fw, fh) {
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        this.occ[this.idx(tx + dx, ty + dy)] = -1;
      }
    }
    this.gen++;
  }

  setRoad(tx, ty) {
    const i = this.idx(tx, ty);
    this.road[i] = 1;
    this.gen++;
  }

  clearRoad(tx, ty) {
    const i = this.idx(tx, ty);
    this.road[i] = 0;
    this.gen++;
  }

  hasRoad(tx, ty) {
    return this.inBounds(tx, ty) && this.road[this.idx(tx, ty)] === 1;
  }

  // Convert a depleted node tile back to walkable grass.
  clearNode(tx, ty) {
    const i = this.idx(tx, ty);
    this.tiles[i] = C.TERRAIN.GRASS;
    this.walk[i] = 1;
    this.gen++;
  }

  // Nearest terrain of a given id within radius r (Chebyshev). Returns true if any found.
  hasTerrainNear(tx, ty, ids, r) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!this.inBounds(x, y)) continue;
        if (ids.indexOf(this.tiles[this.idx(x, y)]) !== -1) return true;
      }
    }
    return false;
  }
}

module.exports = Grid;
