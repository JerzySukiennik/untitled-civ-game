// Seeded terrain generation (PLAN.md §3). Returns { tiles, nodes, citySites }.
const C = require('../shared/constants.js');
const { makePrng } = require('./prng.js');

const W = C.MAP_W, H = C.MAP_H, T = C.TERRAIN;

function generate(seed) {
  const rng = makePrng(seed);
  const tiles = new Uint8Array(W * H).fill(T.GRASS);
  const protectedTiles = new Uint8Array(W * H); // city squares: never overwritten by blobs
  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // 1. Water border ring (sin-wobbled 1-2 tiles) + one lake blob.
  for (let x = 0; x < W; x++) {
    const topT = 1 + (Math.sin(x * 0.5 + seed) > 0.3 ? 1 : 0);
    const botT = 1 + (Math.sin(x * 0.4 + seed * 2) > 0.3 ? 1 : 0);
    for (let d = 0; d < topT; d++) tiles[idx(x, d)] = T.WATER;
    for (let d = 0; d < botT; d++) tiles[idx(x, H - 1 - d)] = T.WATER;
  }
  for (let y = 0; y < H; y++) {
    const lT = 1 + (Math.sin(y * 0.5 + seed) > 0.3 ? 1 : 0);
    const rT = 1 + (Math.sin(y * 0.45 + seed * 3) > 0.3 ? 1 : 0);
    for (let d = 0; d < lT; d++) tiles[idx(d, y)] = T.WATER;
    for (let d = 0; d < rT; d++) tiles[idx(W - 1 - d, y)] = T.WATER;
  }
  // Lake in middle third, top or bottom half.
  const lakeX = rng.int(Math.floor(W / 3), Math.floor(2 * W / 3));
  const lakeY = rng.chance(0.5) ? rng.int(8, Math.floor(H / 2) - 4)
    : rng.int(Math.floor(H / 2) + 4, H - 8);
  const lakeR = rng.int(4, 6);
  for (let dy = -lakeR; dy <= lakeR; dy++) {
    for (let dx = -lakeR; dx <= lakeR; dx++) {
      if (dx * dx + dy * dy > lakeR * lakeR) continue;
      const x = lakeX + dx, y = lakeY + dy;
      if (inB(x, y)) tiles[idx(x, y)] = T.WATER;
    }
  }

  // 2. City sites with jitter, clear 14x14 grass square each.
  const sites = {
    players: { tx: 14 + rng.int(-3, 3), ty: 28 + rng.int(-3, 3) },
    bots: { tx: 82 + rng.int(-3, 3), ty: 28 + rng.int(-3, 3) }
  };
  const clearSquare = (cx, cy) => {
    for (let dy = -7; dy < 7; dy++) {
      for (let dx = -7; dx < 7; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!inB(x, y)) continue;
        tiles[idx(x, y)] = T.GRASS;
        protectedTiles[idx(x, y)] = 1;
      }
    }
  };
  clearSquare(sites.players.tx, sites.players.ty);
  clearSquare(sites.bots.tx, sites.bots.ty);

  // Random-walk blob painter that respects protected tiles and skips water.
  const paintBlob = (sx, sy, count, type) => {
    let x = sx, y = sy, placed = 0, guard = count * 40;
    while (placed < count && guard-- > 0) {
      if (inB(x, y)) {
        const i = idx(x, y);
        if (!protectedTiles[i] && tiles[i] === T.GRASS) { tiles[i] = type; placed++; }
      }
      const dir = rng.int(0, 3);
      if (dir === 0) x++; else if (dir === 1) x--; else if (dir === 2) y++; else y--;
      if (x < 1) x = 1; if (x > W - 2) x = W - 2;
      if (y < 1) y = 1; if (y > H - 2) y = H - 2;
    }
  };

  // 3. Forests: 8-11 blobs (25-60 tiles) + guaranteed one near each site.
  paintBlob(sites.players.tx + rng.int(8, 10), sites.players.ty + rng.int(-4, 4), rng.int(25, 60), T.FOREST);
  paintBlob(sites.bots.tx - rng.int(8, 10), sites.bots.ty + rng.int(-4, 4), rng.int(25, 60), T.FOREST);
  const forestBlobs = rng.int(8, 11);
  for (let b = 0; b < forestBlobs; b++) {
    paintBlob(rng.int(6, W - 6), rng.int(6, H - 6), rng.int(25, 60), T.FOREST);
  }

  // 4. Mountains: 5-7 blobs (15-35) + guaranteed one near each site.
  paintBlob(sites.players.tx + rng.int(-10, -8), sites.players.ty + rng.int(-6, 6), rng.int(15, 35), T.MOUNTAIN);
  paintBlob(sites.bots.tx + rng.int(8, 10), sites.bots.ty + rng.int(-6, 6), rng.int(15, 35), T.MOUNTAIN);
  const mtnBlobs = rng.int(5, 7);
  for (let b = 0; b < mtnBlobs; b++) {
    paintBlob(rng.int(6, W - 6), rng.int(6, H - 6), rng.int(15, 35), T.MOUNTAIN);
  }

  // 5. Gold: six 2x2 patches. One near each site, four in middle third.
  const placeGold = (cx, cy) => {
    // Snap onto a nearby grass 2x2 area.
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = cx + rng.int(-6, 6), y = cy + rng.int(-6, 6);
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++)
        for (let dx = 0; dx < 2; dx++) {
          if (!inB(x + dx, y + dy) || protectedTiles[idx(x + dx, y + dy)] ||
            tiles[idx(x + dx, y + dy)] !== T.GRASS) { ok = false; break; }
        }
      if (ok) {
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) tiles[idx(x + dx, y + dy)] = T.GOLD;
        return;
      }
    }
  };
  placeGold(sites.players.tx + 10, sites.players.ty + rng.int(-6, 6));
  placeGold(sites.bots.tx - 10, sites.bots.ty + rng.int(-6, 6));
  const midLo = Math.floor(W / 3), midHi = Math.floor(2 * W / 3);
  for (let g = 0; g < 4; g++) placeGold(rng.int(midLo, midHi), rng.int(10, H - 10));

  // 6. Connectivity: BFS walkable player->bot, carve corridor if unreachable.
  ensureConnected(tiles, sites, idx, inB);

  // Re-protect city squares stay grass (blobs already skipped them; nodes derived below).
  const nodes = buildNodes(tiles, idx);
  return { tiles, nodes, citySites: sites };
}

function walkable(t) { return t === T.GRASS || t === T.ROAD; }

function ensureConnected(tiles, sites, idx, inB) {
  const seen = new Uint8Array(W * H);
  const q = [idx(sites.players.tx, sites.players.ty)];
  seen[q[0]] = 1;
  const goal = idx(sites.bots.tx, sites.bots.ty);
  let reached = false;
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) { reached = true; break; }
    const cx = cur % W, cy = (cur - cx) / W;
    const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of nb) {
      if (!inB(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (seen[ni] || !walkable(tiles[ni])) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  if (reached) return;
  // Carve a 3-wide straight corridor of grass between sites.
  const a = sites.players, b = sites.bots;
  const steps = Math.max(Math.abs(b.tx - a.tx), Math.abs(b.ty - a.ty));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(a.tx + (b.tx - a.tx) * (s / steps));
    const y = Math.round(a.ty + (b.ty - a.ty) * (s / steps));
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (inB(x + dx, y + dy)) tiles[idx(x + dx, y + dy)] = T.GRASS;
  }
}

function buildNodes(tiles, idx) {
  const nodes = [];
  let nid = C.NODE_ID_BASE + 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[idx(x, y)];
      if (t === T.FOREST) nodes.push({ id: nid++, res: 'w', tx: x, ty: y, amt: C.YIELD.FOREST_WOOD });
      else if (t === T.MOUNTAIN) nodes.push({ id: nid++, res: 's', tx: x, ty: y, amt: C.YIELD.MOUNTAIN_STONE });
      else if (t === T.GOLD) nodes.push({ id: nid++, res: 'g', tx: x, ty: y, amt: C.YIELD.GOLD_TILE });
    }
  }
  return nodes;
}

module.exports = { generate };
