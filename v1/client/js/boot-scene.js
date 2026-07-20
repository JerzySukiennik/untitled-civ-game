// UCG.BootScene: loads the Kenney tiny-town/tiny-farm/tiny-battle packed sheets (16x16, zero
// spacing, per assets/MANIFEST.md) and composes building/unit/terrain textures from real frames.
// Placeholder shapes remain for ids with no readable frame. UCG.Frames stays the only lookup.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, T = C.TERRAIN, P = C.TILE_PX;

  UCG.Frames = {
    terrain: {
      [T.GRASS]: { tex: 't_grass' }, [T.FOREST]: { tex: 't_forest' },
      [T.MOUNTAIN]: { tex: 't_mountain' }, [T.WATER]: { tex: 't_water' },
      [T.GOLD]: { tex: 't_gold' }, [T.ROAD]: { tex: 't_road' }
    },
    // Deterministic per-tile variant sets to kill grid banding on large fields.
    terrainVariants: {
      [T.GRASS]: ['t_grass', 't_grass2', 't_grass3'],
      [T.MOUNTAIN]: ['t_mountain', 't_mountain2', 't_mountain3'],
      [T.WATER]: ['t_water', 't_water2']
    },
    // Texture key for a tile, picking a variant deterministically from its coords.
    terrainTex(id, tx, ty) {
      const vs = UCG.Frames.terrainVariants[id];
      if (vs) return vs[(tx * 7 + ty * 13) % vs.length];
      const f = UCG.Frames.terrain[id];
      return f ? f.tex : 't_grass';
    },
    building: {},   // filled per building id (b_<id>) — composed textures for the world
    buildingIcon: {}, // {tex,frame} pointing at an image-backed sheet frame (for HUD getBase64)
    unit: {},       // filled per unit id (u_<id>)
    ring: { tex: 'ring' }, flag: { tex: 'flag' }, cursor: { tex: 'cursor' }
  };

  // Generated pixel-art palettes (smoked-glass world spec): warm grass, cool rock, gold ore.
  const PAL = {
    grass: { base: 0x79a556, d: 0x6c964c, l: 0x87b060 },
    tree: { out: 0x24361f, dk: 0x35552c, md: 0x467036, lt: 0x5c8c42, trunk: 0x4a3728 },
    rock: { out: 0x3f3d38, dk: 0x55524a, md: 0x6f6b60, lt: 0x8a8578, hi: 0xa8a396 },
    gold: { nug: 0xe8b64c, hi: 0xffe08a, dk: 0x9a6f1e },
    water: { base: 0x2f7fd0, l: 0x4b95e0 }
  };

  // Real-art recipes. scaled: single frame scaled to footprint. grid: frames laid out row-major.
  const B_REAL = {
    tc: { sheet: 'battle', scaled: 14 },        // grey castle
    // Red roof over a windowed wall + door. The old 48/50 + 84/85 mix put a blue roof on orange
    // doors and skipped frame 49, which read as a mismatched block rather than a house.
    house: { sheet: 'town', grid: [[52, 54], [72, 85]], inset: 3 },
    farm: { sheet: 'farm', grid: [[0, 1], [12, 13]] },      // crop-row soil
    lumber: { sheet: 'battle', scaled: 5 },     // wooden hut
    quarry: { sheet: 'farm', scaled: 89 },      // stone pile
    barracks: { sheet: 'battle', scaled: 10 },
    storehouse: { sheet: 'battle', scaled: 8 },
    granary: { sheet: 'farm', scaled: 96 },     // hay bale
    library: { sheet: 'battle', scaled: 9 },
    wall: { sheet: 'town', scaled: 99 },        // stone battlement
    gate: { sheet: 'town', grid: [[100], [123]] },          // battlement over arch door
    tower: { sheet: 'battle', scaled: 13 },
    range: { sheet: 'town', scaled: 118 },      // bow
    market: { sheet: 'town', scaled: 104 },     // market stall
    stable: { sheet: 'farm', grid: [[90, 91, 92], [102, 103, 104], [114, 115, 116]] }, // barn
    smith: { sheet: 'battle', scaled: 11 },     // factory
    temple: { sheet: 'battle', scaled: 15 },
    cartdepot: { sheet: 'battle', scaled: 12 }, // depot
    siege: { sheet: 'battle', scaled: 7 },      // crane
    wonder: { sheet: 'town', grid: [[111, 112], [123, 124]], scale: 2 } // grand stone arches
    // road: uses generated t_road
  };
  // Tiny-battle is a modern-military pack; its only human sprites are 5 palette-swapped infantry
  // (grey/green/blue/red/orange). We map them to the troop types so each reads as a distinct
  // soldier (much better than plain circles); no true medieval knight/archer/horseman art exists.
  const U_REAL = {
    worker: { sheet: 'farm', frame: 108 },      // farmer
    cart: { sheet: 'battle', frame: 96 },       // cargo wagon
    militia: { sheet: 'battle', frame: 106 },   // grey infantry
    soldier: { sheet: 'battle', frame: 107 },   // grey infantry, aiming pose
    knight: { sheet: 'battle', frame: 160 },    // red infantry (elite)
    archer: { sheet: 'battle', frame: 143 },    // blue infantry, aiming (ranged)
    horseman: { sheet: 'battle', frame: 178 },  // orange infantry (fast)
    ram: { sheet: 'battle', frame: 98 },        // heavy siege vehicle
    catapult: { sheet: 'battle', frame: 99 }    // artillery
  };

  const BUILDING_COLORS = {
    tc: 0xffd54f, house: 0x8d6e63, farm: 0xcddc39, lumber: 0x795548, quarry: 0x9e9e9e,
    barracks: 0xe57373, road: 0xbcaaa4, storehouse: 0x90a4ae, granary: 0xdce775,
    library: 0x64b5f6, wall: 0x9e9e9e, gate: 0xa1887f, tower: 0x78909c, range: 0xff8a65,
    market: 0x4db6ac, stable: 0xa1887f, smith: 0x607d8b, temple: 0xba68c8,
    cartdepot: 0x8d6e63, siege: 0x757575, wonder: 0xffb300
  };
  const UNIT_COLORS = {
    worker: 0xffe082, cart: 0xbcaaa4, militia: 0xef9a9a, soldier: 0xe57373,
    knight: 0xc62828, archer: 0x81c784, horseman: 0xffb74d, ram: 0x8d6e63, catapult: 0x616161
  };

  // Expose the building art recipes so icons.js can recompose them on a plain 2D canvas
  // (getBase64 cannot read WebGL-backed composed textures, so the HUD rebuilds icons itself).
  UCG.Frames.buildingRecipe = B_REAL;

  class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }

    preload() {
      const fw = { frameWidth: 16, frameHeight: 16 };
      this.load.spritesheet('town', 'assets/tiles/tiny-town_packed.png', fw);
      this.load.spritesheet('farm', 'assets/tiles/tiny-farm_packed.png', fw);
      this.load.spritesheet('battle', 'assets/tiles/tiny-battle_packed.png', fw);
      this.load.image('cursor_real', 'assets/cursors/pointer_a.png');
    }

    create() {
      this.buildTerrain();
      this.buildBuildings();
      this.buildUnits();
      this.buildDecor();
      if (this.textures.exists('cursor_real')) UCG.Frames.cursor.tex = 'cursor_real';
      UCG.applyDocumentCursors();

      UCG.Net.connect();
      this.scene.start('LobbyScene');
    }

    gfx() { return this.make.graphics({ add: false }); }

    tile(key, draw) {
      const g = this.gfx();
      draw(g);
      g.generateTexture(key, C.TILE_PX, C.TILE_PX);
      g.destroy();
    }

    // Compose a texture from frames/textures onto a RenderTexture, then save under `key`.
    compose(key, w, h, parts) {
      const rt = this.make.renderTexture({ width: w, height: h, add: false });
      for (const p of parts) {
        const img = this.make.image({ key: p.sheet, frame: p.frame, add: false })
          .setOrigin(0, 0).setScale(p.scale || 1);
        rt.draw(img, p.x, p.y);
        img.destroy();
      }
      rt.saveTexture(key);
      rt.destroy();
    }

    // Small draw helpers mirroring the PIL prototype (circles + rects at 16px).
    grassBase(g) {
      g.fillStyle(PAL.grass.base).fillRect(0, 0, P, P);
    }
    speckle(g, list) {
      for (const [x, y, c] of list) {
        g.fillStyle(c === 'l' ? PAL.grass.l : PAL.grass.d);
        g.fillRect(x, y, 2, 1);
      }
    }
    // A rocky boulder cluster: dark outline, mid fill, bottom-right shadow, top-left lit facet + hi.
    boulders(g, clusters) {
      const R = PAL.rock;
      for (const [cx, cy, r] of clusters) { g.fillStyle(R.out).fillCircle(cx, cy, r + 0.7); }
      for (const [cx, cy, r] of clusters) { g.fillStyle(R.md).fillCircle(cx, cy, r); }
      for (const [cx, cy, r] of clusters) {
        g.fillStyle(R.dk).fillCircle(cx + r * 0.35, cy + r * 0.45, r * 0.6);
        g.fillStyle(R.lt).fillCircle(cx - r * 0.32, cy - r * 0.34, r * 0.62);
        g.fillStyle(R.hi).fillCircle(cx - r * 0.42, cy - r * 0.44, r * 0.26);
      }
    }

    buildTerrain() {
      // Grass: 3 subtle speckle variants (no dot grid), warm green base.
      const SPECK = [
        [[3, 4, 'd'], [10, 9, 'l'], [7, 12, 'd'], [13, 3, 'l'], [5, 7, 'd']],
        [[2, 10, 'l'], [9, 3, 'd'], [12, 11, 'd'], [6, 5, 'l'], [11, 7, 'd']],
        [[4, 13, 'd'], [8, 8, 'l'], [13, 6, 'd'], [2, 3, 'l'], [10, 13, 'd']]
      ];
      this.tile('t_grass', (g) => { this.grassBase(g); this.speckle(g, SPECK[0]); });
      this.tile('t_grass2', (g) => { this.grassBase(g); this.speckle(g, SPECK[1]); });
      this.tile('t_grass3', (g) => { this.grassBase(g); this.speckle(g, SPECK[2]); });

      // Mountains: 3 rocky-outcrop variants on a grass base (no snow cap, no triangle rows).
      const CLUST = [
        [[6, 8, 5.2], [11, 10, 3.8], [9, 5, 3.2]],
        [[8, 9, 5.6], [4, 6, 3.0], [12, 6, 3.4]],
        [[5, 7, 4.2], [10, 8, 4.6], [8, 12, 3.4]]
      ];
      this.tile('t_mountain', (g) => { this.grassBase(g); this.boulders(g, CLUST[0]); });
      this.tile('t_mountain2', (g) => { this.grassBase(g); this.boulders(g, CLUST[1]); });
      this.tile('t_mountain3', (g) => { this.grassBase(g); this.boulders(g, CLUST[2]); });

      // Water: 2 subtle ripple variants.
      this.tile('t_water', (g) => {
        g.fillStyle(PAL.water.base).fillRect(0, 0, P, P);
        g.fillStyle(PAL.water.l).fillRect(2, 5, 4, 1).fillRect(9, 10, 4, 1);
      });
      this.tile('t_water2', (g) => {
        g.fillStyle(PAL.water.base).fillRect(0, 0, P, P);
        g.fillStyle(PAL.water.l).fillRect(5, 3, 3, 1).fillRect(2, 11, 3, 1).fillRect(10, 7, 4, 1);
      });

      this.tile('t_road', (g) => {
        g.fillStyle(0xc9b18a).fillRect(0, 0, P, P);
        g.fillStyle(0xb89b6e).fillRect(2, 2, 2, 2).fillRect(9, 6, 2, 2).fillRect(5, 11, 2, 2);
      });

      // Gold ore = mineral deposit in the ground: a rock mass with bright gold nuggets embedded
      // (deliberately NOT a coin — owner was confused by the old coin sprite).
      this.tile('t_gold', (g) => {
        const R = PAL.rock, G = PAL.gold;
        this.grassBase(g);
        g.fillStyle(R.out).fillCircle(8, 9, 5.8);
        g.fillStyle(R.md).fillCircle(8, 9, 5.2);
        g.fillStyle(R.dk).fillCircle(9.4, 10.2, 3.3);
        g.fillStyle(R.lt).fillCircle(6.2, 7.0, 3.4);
        for (const [nx, ny, nr] of [[6, 7, 1.6], [10, 6, 1.2], [9, 11, 1.4], [11, 10, 1.0]]) {
          g.fillStyle(G.dk).fillCircle(nx, ny, nr + 0.5);
          g.fillStyle(G.nug).fillCircle(nx, ny, nr);
          g.fillStyle(G.hi).fillCircle(nx - nr * 0.3, ny - nr * 0.3, nr * 0.45);
        }
      });

      // A depletion overlay tile (semi-transparent dark), drawn over near-empty nodes.
      this.tile('t_deplete', (g) => { g.fillStyle(0x101008, 0.42).fillRect(0, 0, P, P); });

      // Forest: drawn in the same language as the boulders (dark outline, lit top-left, shadow
      // bottom-right) so it reads as one art set. The Kenney tree clashed with the generated terrain.
      this.tile('t_forest', (g) => {
        const T = PAL.tree;
        this.grassBase(g);
        g.fillStyle(T.trunk).fillRect(7, 10, 2, 4);
        g.fillStyle(T.out).fillRect(6, 9, 4, 1);
        // Canopy: stacked blobs, widest at the bottom.
        g.fillStyle(T.out).fillCircle(8, 6.5, 5.6);
        g.fillStyle(T.dk).fillCircle(8, 6.8, 5.0);
        g.fillStyle(T.md).fillCircle(7.4, 6.0, 4.2);
        g.fillStyle(T.lt).fillCircle(6.4, 4.8, 2.6);
        g.fillStyle(T.dk).fillCircle(10.4, 8.4, 2.2);
      });
    }

    buildBuildings() {
      for (const id in UCG_BUILDINGS) {
        const def = UCG_BUILDINGS[id];
        const w = def.foot[0] * P, h = def.foot[1] * P;
        const key = 'b_' + id;
        const r = B_REAL[id];
        if (id === 'road') {
          UCG.Frames.building[id] = { tex: 't_road' };
          continue;
        }
        if (r && r.scaled !== undefined) {
          this.compose(key, w, h, [{ sheet: r.sheet, frame: r.scaled, x: 0, y: 0, scale: Math.min(w, h) / P }]);
        } else if (r && r.grid) {
          // `inset` leaves a margin of ground around the structure so it sits on the land instead
          // of filling its whole footprint like a solid block.
          const inset = r.inset || 0;
          const cols = r.grid[0].length, rowsN = r.grid.length;
          const s = r.scale || (inset ? Math.min((w - 2 * inset) / (cols * P), (h - 2 * inset) / (rowsN * P)) : 1);
          const parts = [];
          for (let ry = 0; ry < rowsN; ry++)
            for (let rx = 0; rx < r.grid[ry].length; rx++)
              parts.push({
                sheet: r.sheet, frame: r.grid[ry][rx],
                x: inset + rx * P * s, y: inset + ry * P * s, scale: s
              });
          this.compose(key, w, h, parts);
        } else {
          this.placeholderBuilding(key, w, h, BUILDING_COLORS[id] || 0xcccccc); // TODO(asset)
        }
        UCG.Frames.building[id] = { tex: key };
      }
    }

    placeholderBuilding(key, w, h, col) {
      const g = this.gfx();
      g.fillStyle(0x1a1a1a, 0.35).fillRect(1, 1, w, h);
      g.fillStyle(col).fillRect(0, 0, w - 1, h - 1);
      g.lineStyle(1, 0x000000, 0.4).strokeRect(0.5, 0.5, w - 2, h - 2);
      g.fillStyle(0xffffff, 0.18).fillRect(2, 2, w - 5, Math.max(2, (h - 5) * 0.35));
      g.generateTexture(key, w, h);
      g.destroy();
    }

    buildUnits() {
      for (const id in UCG_UNITS) {
        const r = U_REAL[id];
        if (r) {
          UCG.Frames.unit[id] = { tex: r.sheet, frame: r.frame };
          continue;
        }
        const col = UNIT_COLORS[id] || 0xdddddd;   // TODO(asset): knight/archer/horseman
        const g = this.gfx();
        g.fillStyle(0x000000, 0.3).fillEllipse(7, 12, 10, 4);
        g.fillStyle(0x222222).fillCircle(7, 6, 5);
        g.fillStyle(col).fillCircle(7, 6, 4);
        g.fillStyle(0xffffff, 0.35).fillCircle(6, 5, 1.4);
        g.generateTexture('u_' + id, 14, 16);
        g.destroy();
        UCG.Frames.unit[id] = { tex: 'u_' + id };
      }
    }

    buildDecor() {
      // Civ ring under units: soft dark seat + crisp civ-tinted rim (tinted at runtime).
      const r = this.gfx();
      r.fillStyle(0x000000, 0.28).fillEllipse(10, 12, 15, 7);
      r.lineStyle(1.5, 0xffffff, 1).strokeCircle(10, 10, 7);
      r.generateTexture('ring', 20, 20); r.destroy();
      // Selection: soft outer glow + crisp inner white ring (spec §1e).
      const s = this.gfx();
      s.lineStyle(3, 0xffffff, 0.22).strokeCircle(11, 11, 9);
      s.lineStyle(1, 0xffffff, 0.95).strokeCircle(11, 11, 7);
      s.generateTexture('selring', 22, 22); s.destroy();
      const f = this.gfx();
      f.fillStyle(0x5a4a2a).fillRect(0, 0, 2, 12);
      f.fillStyle(0xffffff).fillRect(2, 0, 8, 6);
      f.generateTexture('flag', 10, 12); f.destroy();
      const c = this.gfx();
      c.fillStyle(0x000000).fillTriangle(0, 0, 0, 18, 12, 12);
      c.fillStyle(0xffffff).fillTriangle(2, 3, 2, 14, 9, 11);
      c.generateTexture('cursor', 20, 20); c.destroy();
    }
  }

  UCG.BootScene = BootScene;
})(window.UCG);
