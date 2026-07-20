// UCG.GameScene: bakes the terrain once into a static RenderTexture, wires render subsystems,
// drives the per-frame update (camera, entities, cursors, HUD).
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, P = C.TILE_PX;

  class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    create() {
      this.bakeTerrain();
      this.cam = UCG.Camera.create(this);
      this.entities = UCG.Entities.create(this);
      this.cursors = UCG.Cursors.create(this);
      UCG.Input.create(this, this.cam);
      UCG.Audio.init();
      this.tooltips = UCG.Tooltips.create(this);
      this.minimap = UCG.Minimap.create(this);
      this.hud = UCG.HUD.create(this);
      this.cam.centerOnStart();

      this.events.once('shutdown', () => { if (this.hud) this.hud.destroy(); });
      console.log('[game-scene] ready; entities:', UCG.State.entities.size);
    }

    bakeTerrain() {
      const map = UCG.State.map;
      const rt = this.add.renderTexture(0, 0, map.w * P, map.h * P).setOrigin(0, 0).setDepth(0);
      rt.beginDraw();
      for (let ty = 0; ty < map.h; ty++) {
        for (let tx = 0; tx < map.w; tx++) {
          const id = map.tiles[ty * map.w + tx];
          rt.batchDraw(UCG.Frames.terrainTex(id, tx, ty), tx * P, ty * P);
        }
      }
      rt.endDraw();
      this.terrain = rt;
    }

    // Redraw single tiles whose terrain changed (node depletion -> grass).
    consumeDirtyTiles() {
      const S = UCG.State;
      if (!S.tilesDirty.length) return;
      for (const i of S.tilesDirty) {
        const tx = i % S.map.w, ty = (i - tx) / S.map.w;
        this.terrain.draw(UCG.Frames.terrainTex(S.map.tiles[i], tx, ty), tx * P, ty * P);
      }
      S.tilesDirty.length = 0;
    }

    // Darken tiles whose node just dropped below 25% so players see it running out (spec §1d).
    consumeFadeTiles() {
      const S = UCG.State;
      if (!S.nodeFadeDirty.length) return;
      for (const i of S.nodeFadeDirty) {
        const tx = i % S.map.w, ty = (i - tx) / S.map.w;
        this.terrain.draw(UCG.Frames.terrainTex(S.map.tiles[i], tx, ty), tx * P, ty * P);
        this.terrain.draw('t_deplete', tx * P, ty * P);
      }
      S.nodeFadeDirty.length = 0;
    }

    update(_time, dt) {
      if (!UCG.State.started) return;
      this.consumeDirtyTiles();
      this.consumeFadeTiles();
      this.cam.update(dt);
      this.entities.update();
      this.cursors.update();
      this.minimap.update();
      this.hud.update();
      UCG.Audio.update();
    }
  }

  UCG.GameScene = GameScene;
})(window.UCG);
