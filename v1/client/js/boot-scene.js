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
    building: {},   // filled per building id (b_<id>)
    unit: {},       // filled per unit id (u_<id>)
    ring: { tex: 'ring' }, flag: { tex: 'flag' }, cursor: { tex: 'cursor' }
  };

  // Real-art recipes. scaled: single frame scaled to footprint. grid: frames laid out row-major.
  const B_REAL = {
    tc: { sheet: 'battle', scaled: 14 },        // grey castle
    house: { sheet: 'town', grid: [[48, 50], [84, 85]] },   // roof edges + window/door walls
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

    buildTerrain() {
      this.tile('t_grass', (g) => {
        g.fillStyle(0x4caf50).fillRect(0, 0, P, P);
        g.fillStyle(0x45a049).fillRect(3, 4, 2, 2).fillRect(10, 9, 2, 2).fillRect(7, 12, 2, 2);
      });
      this.tile('t_mountain', (g) => {
        g.fillStyle(0x8d8d8d).fillRect(0, 0, P, P);
        g.fillStyle(0x6f6f6f).fillTriangle(8, 2, 1, 15, 15, 15);
        g.fillStyle(0xf0f0f0).fillTriangle(8, 2, 5, 7, 11, 7);
      });
      this.tile('t_water', (g) => {
        g.fillStyle(0x2f7fd0).fillRect(0, 0, P, P);
        g.fillStyle(0x4b95e0).fillRect(2, 5, 6, 1).fillRect(9, 10, 5, 1);
      });
      this.tile('t_road', (g) => {
        g.fillStyle(0xc9b18a).fillRect(0, 0, P, P);
        g.fillStyle(0xb89b6e).fillRect(2, 2, 2, 2).fillRect(9, 6, 2, 2).fillRect(5, 11, 2, 2);
      });
      // Real props over generated grass: tiny-town tree (forest), tiny-town coin (gold ore).
      this.compose('t_forest', P, P, [
        { sheet: 't_grass', x: 0, y: 0 },
        { sheet: 'town', frame: 4, x: 0, y: 0 }
      ]);
      this.compose('t_gold', P, P, [
        { sheet: 't_grass', x: 0, y: 0 },
        { sheet: 'town', frame: 93, x: 0, y: 0 }
      ]);
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
          const s = r.scale || 1;
          const parts = [];
          for (let ry = 0; ry < r.grid.length; ry++)
            for (let rx = 0; rx < r.grid[ry].length; rx++)
              parts.push({ sheet: r.sheet, frame: r.grid[ry][rx], x: rx * P * s, y: ry * P * s, scale: s });
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
      const r = this.gfx();
      r.lineStyle(2, 0xffffff, 1).strokeCircle(9, 9, 7);
      r.generateTexture('ring', 18, 18); r.destroy();
      const s = this.gfx();
      s.lineStyle(1, 0xffff88, 1).strokeCircle(9, 9, 8);
      s.generateTexture('selring', 18, 18); s.destroy();
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
