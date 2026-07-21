// UCG.Camera: arrow-key pan + middle-drag pan + wheel zoom (1.0-3.0). No scroll bounds by owner
// request: the camera can fly off the island in any direction, past the water border.
// No WASD and no edge-scroll by owner request: the map is grabbed and dragged, never nudged.
// Left-drag is reserved for unit/box selection (input.js) since the mouse scheme reverted to the
// standard RTS convention (left = select, right = order).
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;

  UCG.Camera = {
    create(scene) {
      const cam = scene.cameras.main;
      cam.setZoom(C.ZOOM_DEFAULT);

      const keys = scene.input.keyboard.addKeys(
        { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' });
      const ctl = { cam, keys, dragging: false, dragX: 0, dragY: 0, panSpeed: 500 };

      // Middle-drag grabs the map.
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
