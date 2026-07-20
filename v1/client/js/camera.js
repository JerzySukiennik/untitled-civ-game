// UCG.Camera: arrow-key pan + left-drag pan + wheel zoom (1.0-3.0). Bounds = map size.
// No WASD and no edge-scroll by owner request: the map is grabbed and dragged, never nudged.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;

  UCG.Camera = {
    create(scene) {
      const cam = scene.cameras.main;
      const worldW = C.MAP_W * C.TILE_PX, worldH = C.MAP_H * C.TILE_PX;
      cam.setBounds(0, 0, worldW, worldH);
      cam.setZoom(C.ZOOM_DEFAULT);

      const keys = scene.input.keyboard.addKeys(
        { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' });
      const ctl = { cam, keys, dragging: false, dragX: 0, dragY: 0, panSpeed: 500 };

      // Left-drag (or middle-drag) grabs the map. Input.js owns the click/drag threshold and only
      // lets a drag through once the pointer has actually moved, so a plain click still commands.
      ctl.beginDrag = (p) => { ctl.dragging = true; ctl.dragX = p.x; ctl.dragY = p.y; };
      scene.input.on('pointerdown', (p) => { if (p.middleButtonDown()) ctl.beginDrag(p); });
      scene.input.on('pointerup', () => { ctl.dragging = false; });
      scene.input.on('pointermove', (p) => {
        if (ctl.dragging) {
          cam.scrollX -= (p.x - ctl.dragX) / cam.zoom;
          cam.scrollY -= (p.y - ctl.dragY) / cam.zoom;
          ctl.dragX = p.x; ctl.dragY = p.y;
        }
      });
      // Wheel zoom.
      scene.input.on('wheel', (_p, _o, _dx, dy) => {
        const z = Phaser.Math.Clamp(cam.zoom - Math.sign(dy) * 0.2, C.ZOOM_MIN, C.ZOOM_MAX);
        cam.setZoom(z);
      });

      // Center on the players' Town Center if present.
      ctl.centerOnStart = () => {
        for (const e of UCG.State.entities.values()) {
          if (e.type === 'tc' && e.side === C.SIDE.PLAYERS) {
            cam.centerOn(e.x * C.TILE_PX, e.y * C.TILE_PX);
            return;
          }
        }
      };

      ctl.update = (dt) => {
        const d = (ctl.panSpeed * dt) / 1000 / cam.zoom;
        let dx = 0, dy = 0;
        if (ctl.keys.left.isDown) dx -= d;
        if (ctl.keys.right.isDown) dx += d;
        if (ctl.keys.up.isDown) dy -= d;
        if (ctl.keys.down.isDown) dy += d;
        if (dx) cam.scrollX += dx;
        if (dy) cam.scrollY += dy;
      };

      return ctl;
    }
  };
})(window.UCG);
