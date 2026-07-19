// Pathfinding: A* on the walkability grid (8-directional, no corner cutting), binary min-heap
// over typed arrays, expansion budget with best-effort partial fallback, LRU path cache keyed by
// start|goal tile and invalidated by the grid generation counter. Also hosts unit soft-collision
// resolution, approach-tile lookup and group-move formation offsets. Allocation-light per tick.
const C = require('../shared/constants.js');

const DIAG = Math.SQRT2;              // diagonal step cost
const BUDGET = 3000;                  // max node expansions per search
const CACHE_MAX = 512;                // LRU entries
const PUSH = 0.1;                     // max soft-collision push per tick (tiles)
const RADIUS = 0.6;                   // collision radius (tiles)

class Pathfinder {
  constructor(grid) {
    this.grid = grid;
    const N = grid.w * grid.h;
    this.g = new Float64Array(N);
    this.from = new Int32Array(N);
    this.openId = new Int32Array(N).fill(-1);
    this.closedId = new Int32Array(N).fill(-1);
    this.heapNode = new Int32Array(N + 1);
    this.heapF = new Float64Array(N + 1);
    this.heapSize = 0;
    this.searchId = 0;
    this.cache = new Map();            // "start|goal|side" -> path (array of {x,y} tile centers)
    this.cacheGen = grid.gen;
    this.curSide = -1;                 // ownership context for gate walkability during a search
    this._buckets = new Map();         // scratch for soft collision (cleared each pass)
  }

  // ---- heap ----
  _push(node, f) {
    let i = ++this.heapSize;
    this.heapNode[i] = node; this.heapF[i] = f;
    while (i > 1) {
      const p = i >> 1;
      if (this.heapF[p] <= this.heapF[i]) break;
      this._swap(i, p); i = p;
    }
  }
  _pop() {
    const top = this.heapNode[1];
    this.heapNode[1] = this.heapNode[this.heapSize];
    this.heapF[1] = this.heapF[this.heapSize];
    this.heapSize--;
    let i = 1;
    while (true) {
      const l = i << 1, r = l + 1; let m = i;
      if (l <= this.heapSize && this.heapF[l] < this.heapF[m]) m = l;
      if (r <= this.heapSize && this.heapF[r] < this.heapF[m]) m = r;
      if (m === i) break;
      this._swap(i, m); i = m;
    }
    return top;
  }
  _swap(a, b) {
    const n = this.heapNode[a]; this.heapNode[a] = this.heapNode[b]; this.heapNode[b] = n;
    const f = this.heapF[a]; this.heapF[a] = this.heapF[b]; this.heapF[b] = f;
  }

  walkable(tx, ty) { return this.grid.walkableFor(tx, ty, this.curSide); }

  // Octile heuristic.
  _h(x0, y0, x1, y1) {
    const dx = Math.abs(x0 - x1), dy = Math.abs(y0 - y1);
    return (dx + dy) + (DIAG - 2) * Math.min(dx, dy);
  }

  // A* from (sx,sy) to (gx,gy), both must be walkable. Returns array of {x,y} tile centers
  // (excluding the start tile) or null if no partial progress possible.
  findPath(sx, sy, gx, gy, side) {
    const grid = this.grid;
    this.curSide = (side === undefined) ? -1 : side;
    if (grid.gen !== this.cacheGen) { this.cache.clear(); this.cacheGen = grid.gen; }
    if (!grid.inBounds(sx, sy) || !grid.inBounds(gx, gy)) return null;
    if (sx === gx && sy === gy) return [];
    if (!this.walkable(gx, gy)) return null;

    const W = grid.w, key = (sy * W + sx) + '|' + (gy * W + gx) + '|' + this.curSide;
    const cached = this.cache.get(key);
    if (cached !== undefined) { this.cache.delete(key); this.cache.set(key, cached); return cached; }

    const id = ++this.searchId;
    this.heapSize = 0;
    const start = sy * W + sx, goal = gy * W + gx;
    this.g[start] = 0; this.openId[start] = id;
    this._push(start, this._h(sx, sy, gx, gy));
    let best = start, bestH = this._h(sx, sy, gx, gy), expansions = 0, reached = false;

    while (this.heapSize > 0 && expansions < BUDGET) {
      const cur = this._pop();
      if (this.closedId[cur] === id) continue;
      this.closedId[cur] = id;
      if (cur === goal) { reached = true; break; }
      const cx = cur % W, cy = (cur - cx) / W;
      const ch = this._h(cx, cy, gx, gy);
      if (ch < bestH) { bestH = ch; best = cur; }
      expansions++;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.walkable(nx, ny)) continue;
          if (dx !== 0 && dy !== 0) {
            // No corner cutting: both orthogonal neighbours must be open.
            if (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy)) continue;
          }
          const nb = ny * W + nx;
          if (this.closedId[nb] === id) continue;
          const step = (dx !== 0 && dy !== 0) ? DIAG : 1;
          const ng = this.g[cur] + step;
          if (this.openId[nb] !== id || ng < this.g[nb]) {
            this.g[nb] = ng; this.from[nb] = cur; this.openId[nb] = id;
            this._push(nb, ng + this._h(nx, ny, gx, gy));
          }
        }
      }
    }

    const endNode = reached ? goal : best;
    if (endNode === start) return reached ? [] : null;
    const path = this._reconstruct(start, endNode, W);
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, path);
    return path;
  }

  _reconstruct(start, end, W) {
    const rev = [];
    let n = end;
    while (n !== start) { const x = n % W, y = (n - x) / W; rev.push({ x: x + 0.5, y: y + 0.5 }); n = this.from[n]; }
    rev.reverse();
    return rev;
  }

  // Nearest walkable tile to (tx,ty): identity if walkable, else outward spiral. Returns {x,y} tile.
  nearestWalkable(tx, ty, maxR = 8) {
    if (this.walkable(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy;
          if (this.walkable(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  // Best walkable tile adjacent to a footprint rect, nearest to (fx,fy). Node = 1x1 footprint.
  approach(fx, fy, tx, ty, fw, fh) {
    let best = null, bestD = Infinity;
    for (let x = tx - 1; x <= tx + fw; x++) {
      for (let y = ty - 1; y <= ty + fh; y++) {
        const insideX = x >= tx && x < tx + fw, insideY = y >= ty && y < ty + fh;
        if (insideX && insideY) continue;           // skip footprint interior
        if (!this.walkable(x, y)) continue;
        const d = (x + 0.5 - fx) ** 2 + (y + 0.5 - fy) ** 2;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best;
  }

  // Expanding-ring formation offsets for group moves (count entries around the target tile).
  formationOffsets(count) {
    const out = [{ dx: 0, dy: 0 }];
    let r = 1;
    while (out.length < count) {
      for (let dy = -r; dy <= r && out.length < count; dy++) {
        for (let dx = -r; dx <= r && out.length < count; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          out.push({ dx, dy });
        }
      }
      r++;
    }
    return out;
  }

  // Soft collision: units within RADIUS push apart (cap PUSH/tick). Only MOVE-state units are
  // displaced (working/idle units stay anchored). Bucketed by tile to stay ~O(n).
  softCollision(game) {
    const b = this._buckets; b.clear();
    const W = this.grid.w;
    for (const e of game.entities.values()) {
      if (e.kind !== C.KIND.UNIT || e.state === C.ST.DEAD) continue;
      const k = (e.y | 0) * W + (e.x | 0);
      let arr = b.get(k); if (!arr) { arr = []; b.set(k, arr); }
      arr.push(e);
    }
    for (const e of game.entities.values()) {
      if (e.kind !== C.KIND.UNIT || e.state !== C.ST.MOVE) continue;
      const ex = e.x | 0, ey = e.y | 0;
      let px = 0, py = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const arr = b.get((ey + dy) * W + (ex + dx)); if (!arr) continue;
          for (const o of arr) {
            if (o === e) continue;
            const ddx = e.x - o.x, ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 > RADIUS * RADIUS || d2 === 0) continue;
            const d = Math.sqrt(d2) || 0.0001;
            const f = (RADIUS - d) / RADIUS;
            px += (ddx / d) * f; py += (ddy / d) * f;
          }
        }
      }
      if (px === 0 && py === 0) continue;
      const mag = Math.hypot(px, py);
      const s = Math.min(PUSH, mag) / mag;
      const nx = e.x + px * s, ny = e.y + py * s;
      if (this.walkable(nx | 0, ny | 0)) { e.x = nx; e.y = ny; e.dirty |= 1; }
    }
  }
}

module.exports = Pathfinder;
