// UCG.Camera: WASD + edge-scroll + middle/drag pan + wheel zoom (1.0-3.0). Bounds = map size.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;

  UCG.Camera = {
    create(scene) {
      const cam = scene.cameras.main;
      const worldW = C.MAP_W * C.TILE_PX, worldH = C.MAP_H * C.TILE_PX;
      cam.setBounds(0, 0, worldW, worldH);
      cam.setZoom(C.ZOOM_DEFAULT);

      const keys = scene.input.keyboard.addKeys('W,A,S,D');
      const ctl = { cam, keys, dragging: false, dragX: 0, dragY: 0, panSpeed: 500, edge: 24 };

      // Middle-button (or drag) pan.
      scene.input.on('pointerdown', (p) => {
        if (p.middleButtonDown()) { ctl.dragging = true; ctl.dragX = p.x; ctl.dragY = p.y; }
      });
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
        const p = scene.input.activePointer;
        const gw = scene.scale.width, gh = scene.scale.height;
        let dx = 0, dy = 0;
        const aPansCamera = !(UCG.Input && UCG.Input.selected && UCG.Input.selected.size);
        if (ctl.keys.A.isDown && aPansCamera) dx -= d;
        if (ctl.keys.D.isDown) dx += d;
        if (ctl.keys.W.isDown) dy -= d;
        if (ctl.keys.S.isDown) dy += d;
        if (p.x >= 0 && p.x < ctl.edge) dx -= d;
        else if (p.x > gw - ctl.edge && p.x <= gw) dx += d;
        if (p.y >= 0 && p.y < ctl.edge) dy -= d;
        else if (p.y > gh - ctl.edge && p.y <= gh) dy += d;
        if (dx) cam.scrollX += dx;
        if (dy) cam.scrollY += dy;
      };

      return ctl;
    }
  };
})(window.UCG);
