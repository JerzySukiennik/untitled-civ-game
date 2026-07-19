// UCG.Entities: pooled sprites for buildings + units. Interpolated positions, side tinting via
// ring (units) / flag (buildings), HP bars when damaged, construction progress bars, selection
// highlight, camera culling. Stage C adds combat FX: attack flashes + impact sparks from `ev`
// attack events, a fade puff on death, and client-local move/attack destination markers.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, P = C.TILE_PX;

  UCG.Entities = {
    create(scene) {
      const layer = scene.add.container(0, 0); layer.setDepth(100);
      const fxLayer = scene.add.container(0, 0); fxLayer.setDepth(120);
      // Client-local rally flag for the currently selected trainer building.
      const rallyImg = scene.add.image(0, 0, UCG.Frames.flag.tex)
        .setOrigin(0.5, 1).setDepth(115).setTint(0x66ff88).setVisible(false);
      const pool = new Map(); // entityId -> node
      const fx = [];          // active effects { obj, born, life, fade }
      let fxTick = -1;

      function makeNode(e) {
        const node = { root: scene.add.container(0, 0) };
        if (e.k === C.KIND.BUILDING) {
          const f = UCG.Frames.building[e.type] || UCG.Frames.building.house;
          node.body = scene.add.image(0, 0, f.tex, f.frame).setOrigin(0, 0);
          node.flag = scene.add.image(P * (e.foot ? e.foot[0] : 2) - 4, -2, UCG.Frames.flag.tex).setOrigin(0.5, 1);
          node.flag.setTint(UCG.State.civColor(e.side));
          node.root.add(node.body); node.root.add(node.flag);
          node.prog = scene.add.rectangle(0, 0, 12, 3, 0xffcc33).setOrigin(0, 0.5).setVisible(false);
          node.root.add(node.prog);
        } else {
          const f = UCG.Frames.unit[e.type] || UCG.Frames.unit.worker;
          node.ring = scene.add.image(0, 2, UCG.Frames.ring.tex).setOrigin(0.5, 0.5);
          node.ring.setTint(UCG.State.civColor(e.side));
          node.sel = scene.add.image(0, 2, 'selring').setOrigin(0.5, 0.5).setVisible(false);
          node.body = scene.add.image(0, 0, f.tex, f.frame).setOrigin(0.5, 0.7);
          node.root.add(node.ring); node.root.add(node.sel); node.root.add(node.body);
        }
        node.hp = scene.add.rectangle(0, 0, 12, 2, 0x33dd33).setOrigin(0, 0.5).setVisible(false);
        node.root.add(node.hp);
        node.flashUntil = 0;
        layer.add(node.root);
        return node;
      }

      function foot(e) { return e.foot || (UCG_BUILDINGS[e.type] ? UCG_BUILDINGS[e.type].foot : [1, 1]); }

      // Entity render position (tile units) accounting for interpolation.
      function entPos(e) {
        if (e.k === C.KIND.BUILDING) return { x: e.tx + foot(e)[0] / 2, y: e.ty + foot(e)[1] / 2 };
        return UCG.Interp.pos(e);
      }

      // ---- effects ----
      function spawnImpact(px, py, color) {
        const g = scene.add.star(px, py, 4, 1.5, 5, color).setDepth(120);
        fxLayer.add(g);
        fx.push({ obj: g, born: performance.now(), life: 240, fade: true, grow: true });
      }
      function spawnPuff(px, py, color) {
        const g = scene.add.circle(px, py, 6, color, 0.6).setDepth(120);
        fxLayer.add(g);
        fx.push({ obj: g, born: performance.now(), life: 360, fade: true, grow: true });
      }
      function spawnMarker(px, py, color) {
        const g = scene.add.circle(px, py, 7, color, 0).setStrokeStyle(2, color, 1).setDepth(120);
        fxLayer.add(g);
        fx.push({ obj: g, born: performance.now(), life: 520, fade: true, grow: false, shrink: true });
      }

      function processEvents() {
        for (const ev of UCG.State.events) {
          if (ev.e !== 'attack') continue;
          const tgt = UCG.State.entities.get(ev.to);
          if (!tgt) continue;
          const p = entPos(tgt);
          spawnImpact(p.x * P, p.y * P, 0xffdd44);
          const node = pool.get(ev.to);
          if (node) node.flashUntil = performance.now() + 110;
        }
      }

      function updateFx(now) {
        for (let i = fx.length - 1; i >= 0; i--) {
          const f = fx[i];
          const t = (now - f.born) / f.life;
          if (t >= 1) { f.obj.destroy(); fx.splice(i, 1); continue; }
          if (f.fade) f.obj.setAlpha(1 - t);
          if (f.grow) f.obj.setScale(1 + t * 1.5);
          else if (f.shrink) f.obj.setScale(1 - t * 0.6);
        }
      }

      const ctl = {
        layer,
        // Client-local destination markers (called from input.js on issuing an order).
        marker(tileX, tileY, attack) {
          spawnMarker(tileX * P, tileY * P, attack ? 0xff5555 : 0x66ff88);
        },
        update() {
          const now = performance.now();
          const cam = scene.cameras.main;
          const view = cam.worldView;
          const margin = 4 * P;
          const alive = new Set();
          const selected = UCG.Input.selected;

          if (UCG.State.tick !== fxTick) { fxTick = UCG.State.tick; processEvents(); }

          for (const e of UCG.State.entities.values()) {
            alive.add(e.id);
            let node = pool.get(e.id);
            if (!node) { node = makeNode(e); pool.set(e.id, node); }

            let wx, wy;
            if (e.k === C.KIND.BUILDING) {
              wx = e.tx * P; wy = e.ty * P;
            } else {
              const ip = UCG.Interp.pos(e);
              wx = ip.x * P; wy = ip.y * P;
            }

            // Cull: skip updates for off-screen entities.
            if (wx < view.x - margin || wx > view.right + margin ||
              wy < view.y - margin || wy > view.bottom + margin) {
              node.root.setVisible(false);
              continue;
            }
            node.root.setVisible(true);
            node.root.setPosition(wx, wy);

            // Damage flash tint.
            if (node.flashUntil > now) node.body.setTint(0xff5555);
            else node.body.clearTint();

            if (e.k === C.KIND.BUILDING) {
              const constructing = e.progress !== undefined && e.progress < 1;
              node.body.setAlpha(constructing ? 0.55 : 1);
              if (constructing) {
                const ft = foot(e);
                node.prog.setVisible(true).setPosition(0, ft[1] * P + 3).width = Math.max(1, ft[0] * P * e.progress);
              } else {
                node.prog.setVisible(false);
              }
            } else if (node.sel) {
              node.sel.setVisible(selected.has(e.id));
            }

            // HP bar only when damaged.
            if (e.hp < e.maxhp) {
              const w = (e.k === C.KIND.BUILDING) ? foot(e)[0] * P : 12;
              const ox = (e.k === C.KIND.BUILDING) ? 0 : -6;
              const oy = (e.k === C.KIND.BUILDING) ? -4 : -12;
              node.hp.setVisible(true).setPosition(ox, oy).width = w * Math.max(0, e.hp / e.maxhp);
              node.hp.fillColor = e.hp / e.maxhp > 0.4 ? 0x33dd33 : 0xdd3333;
            } else {
              node.hp.setVisible(false);
            }
          }

          // Release sprites for entities that no longer exist; puff on death.
          for (const [id, node] of pool) {
            if (!alive.has(id)) {
              spawnPuff(node.root.x, node.root.y, 0xffaa55);
              node.root.destroy();
              pool.delete(id);
            }
          }

          // Rally flag for the selected trainer building.
          const rb = UCG.Input.selectedBuilding, rp = rb && UCG.Input.rally[rb];
          if (rp) rallyImg.setVisible(true).setPosition((rp.tx + 0.5) * P, (rp.ty + 0.5) * P);
          else rallyImg.setVisible(false);

          updateFx(now);
        }
      };

      UCG.EntitiesCtl = ctl;
      return ctl;
    }
  };
})(window.UCG);
