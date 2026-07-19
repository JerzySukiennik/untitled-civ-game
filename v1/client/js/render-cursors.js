// UCG.Cursors: live cursor sprites for other players, tinted with their lobby color + nick label.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;

  UCG.Cursors = {
    create(scene) {
      const layer = scene.add.container(0, 0);
      layer.setDepth(1000);
      const pool = new Map(); // playerId -> { sprite, label }

      function acquire(id) {
        let c = pool.get(id);
        if (!c) {
          const sprite = scene.add.image(0, 0, UCG.Frames.cursor.tex).setOrigin(0, 0);
          sprite.setTint(UCG.State.playerColor(id));
          const label = scene.add.text(0, 0, '', { fontSize: '11px', color: '#fff', backgroundColor: '#0009', padding: { x: 3, y: 1 } });
          label.setResolution(2);
          layer.add(sprite); layer.add(label);
          c = { sprite, label }; pool.set(id, c);
        }
        return c;
      }

      return {
        layer,
        update() {
          const seen = new Set();
          const zoom = scene.cameras.main.zoom;
          for (const cu of UCG.State.cursors) {
            if (cu.id === UCG.State.playerId) continue; // own cursor is the OS pointer
            seen.add(cu.id);
            const c = acquire(cu.id);
            const wx = cu.x * C.TILE_PX, wy = cu.y * C.TILE_PX;
            c.sprite.setPosition(wx, wy).setScale(1 / zoom).setVisible(true).setTint(UCG.State.playerColor(cu.id));
            const p = UCG.State.lobby.players.find((x) => x.id === cu.id);
            c.label.setText(p ? p.nick : '').setPosition(wx + 10 / zoom, wy + 2 / zoom).setScale(1 / zoom).setVisible(true);
          }
          for (const [id, c] of pool) {
            if (!seen.has(id)) { c.sprite.setVisible(false); c.label.setVisible(false); }
          }
        }
      };
    }
  };
})(window.UCG);
