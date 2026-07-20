// UCG.Tooltips: hover tooltips for build-bar / train / tech buttons (delegated DOM hover) and for
// entities under the cursor on the map (Phaser pointer hit-test). Shows name, cost, key stats with
// the players' side modifiers applied (via UCG.State.mods + UCG_CONST.stat) and a short description.
// Fully suppressed when UCG.State.tooltipsOff (Intro mode). Also exports the modifier-aware stat
// helpers so the HUD selection panel can render the same numbers.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, P = C.TILE_PX;
  const RES_NAME = { f: 'food', w: 'wood', s: 'stone', g: 'gold' };

  // Combat role sets — mirror server/mods.js so displayed stats match the sim.
  const MILITARY = new Set(['militia', 'soldier', 'knight', 'archer', 'horseman', 'ram', 'catapult']);
  const INFANTRY = new Set(['militia', 'soldier', 'knight']);
  const MELEE = new Set(['militia', 'soldier', 'knight', 'horseman']);
  const DEFENSE_B = new Set(['wall', 'tower', 'gate']);

  function costStr(cost) {
    const parts = [];
    for (const k of C.RES_KEYS) if (cost[k]) parts.push(cost[k] + ' ' + RES_NAME[k]);
    return parts.join(', ') || 'free';
  }
  function m(base, key) { return C.stat(base, UCG.State.mods, key); }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // Modifier-aware unit stats (players side).
  function unitDmg(type) {
    const d = UCG_UNITS[type]; let dmg = d.dmg;
    if (MELEE.has(type)) dmg = m(dmg, 'meleeDmgAdd');
    if (INFANTRY.has(type)) dmg = m(dmg, 'infantryDmg');
    if (type === 'archer') dmg = m(dmg, 'archerDmgAdd');
    if (type === 'horseman') dmg = m(dmg, 'horsemanDmg');
    if (MILITARY.has(type)) dmg = m(dmg, 'era5Dmg');
    return Math.round(dmg);
  }
  function unitHp(type) {
    const d = UCG_UNITS[type]; let mult = 1;
    if (MILITARY.has(type)) { mult = m(mult, 'militaryHp'); mult = m(mult, 'era5Hp'); }
    if (type === 'horseman') mult = m(mult, 'horsemanHp');
    return Math.round(d.hp * mult);
  }
  function unitRng(type) {
    const d = UCG_UNITS[type];
    return type === 'archer' ? Math.round(m(d.rng, 'archerRngAdd')) : d.rng;
  }
  function unitSpd(type) {
    let s = m(UCG_UNITS[type].spd, 'unitSpeed');
    if (type === 'worker') s = m(s, 'workerSpeed');
    return Math.round(s * 10) / 10;
  }
  function buildingHp(type) {
    let mult = m(1, 'buildingHp'); mult = m(mult, 'buildingHp2');
    if (DEFENSE_B.has(type)) mult = m(mult, 'defenseHp');
    return Math.round(UCG_BUILDINGS[type].hp * mult);
  }

  // Modified-value tooltip helpers: show "base → final" (final in gold) when a modifier changed it.
  function fmt(n) { return Math.round(n * 10) / 10; }
  function pair(base, mod) {
    const b = fmt(base), m = fmt(mod);
    return b === m ? '' + m : `${b} <span class="up">→ ${m}</span>`;
  }
  function unitStatPairs(type) {
    const d = UCG_UNITS[type];
    const parts = ['HP ' + pair(d.hp, unitHp(type))];
    if (d.dmg) parts.push('dmg ' + pair(d.dmg, unitDmg(type)) + (d.vsBuilding ? ` (×${d.vsBuilding} vs bldg)` : ''));
    if (d.rng > 1) parts.push('rng ' + pair(d.rng, unitRng(type)));
    parts.push('spd ' + pair(d.spd, unitSpd(type)));
    return parts.join(' · ');
  }

  // Stat line for a unit (used by tooltip + selection panel). base=true skips modifier lookup.
  function unitStatLine(type, base) {
    const d = UCG_UNITS[type];
    const hp = base ? d.hp : unitHp(type);
    const parts = ['HP ' + hp];
    if (d.dmg) parts.push('dmg ' + (base ? d.dmg : unitDmg(type)) + (d.vsBuilding ? ' (x' + d.vsBuilding + ' vs bldg)' : ''));
    if (d.rng > 1) parts.push('rng ' + (base ? d.rng : unitRng(type)));
    parts.push('spd ' + (base ? d.spd : unitSpd(type)));
    return parts.join(' · ');
  }

  UCG.Tooltips = {
    unitDmg, unitHp, unitRng, unitSpd, buildingHp, unitStatLine, costStr,

    create(scene) {
      this.scene = scene;
      const el = document.createElement('div');
      el.id = 'tooltip';
      document.body.appendChild(el);
      this.el = el;
      this.src = null;         // 'dom' | 'map' | null
      this.mx = 0; this.my = 0;

      window.addEventListener('mousemove', (e) => {
        this.mx = e.clientX; this.my = e.clientY;
        if (this.src) this.position();
      });

      // Delegated DOM hover for build-bar / train / tech buttons.
      document.body.addEventListener('mouseover', (e) => {
        if (UCG.State.tooltipsOff) return;
        const t = e.target.closest('[data-build],[data-train],[data-tech]');
        if (!t) return;
        const html = this.domHtml(t);
        if (html) this.show(html, 'dom');
      });
      document.body.addEventListener('mouseout', (e) => {
        if (this.src !== 'dom') return;
        const t = e.target.closest('[data-build],[data-train],[data-tech]');
        if (t) this.hide();
      });

      // Map entity hover. Rebuild the tooltip only when the hovered entity changes; the window
      // mousemove listener above keeps it following the cursor.
      this._mapEnt = null;
      scene.input.on('pointermove', (p) => {
        if (UCG.State.tooltipsOff || this.src === 'dom') return;
        const e = this.hitEntity(p.worldX / P, p.worldY / P);
        if (e) {
          if (e.id !== this._mapEnt) { this._mapEnt = e.id; this.show(this.entityHtml(e), 'map'); }
        } else if (this.src === 'map') { this._mapEnt = null; this.hide(); }
      });

      return { update() { } };
    },

    domHtml(t) {
      if (t.dataset.build) {
        const d = UCG_BUILDINGS[t.dataset.build];
        const lock = UCG.Rules.buildingLock(t.dataset.build);
        return `<b>${esc(d.name)}</b> <span class="tt-w">era ${d.era}</span>` +
          `<div class="tt-c">${UCG.Icons.costHTML(d.cost)}</div>` +
          `<span class="tt-s">HP ${pair(d.hp, buildingHp(d.id))}</span>` +
          (lock.locked ? `<span class="tt-l">Locked: ${lock.reason}</span>` : '') +
          `<span class="tt-d">${esc(d.desc)}</span>`;
      }
      if (t.dataset.train) {
        const u = UCG_UNITS[t.dataset.train];
        return `<b>${esc(u.name)}</b>` +
          `<div class="tt-c">${UCG.Icons.costHTML(u.cost)}</div>` +
          `<span class="tt-s">${unitStatPairs(u.id)}</span>` +
          `<span class="tt-d">${esc(u.desc)}</span>`;
      }
      if (t.dataset.tech) {
        const k = UCG_TECHS[t.dataset.tech];
        return `<b>${esc(k.name)}</b> <span class="tt-w">${k.time}s</span>` +
          `<div class="tt-c">${UCG.Icons.costHTML(k.cost)}</div>` +
          `<span class="tt-d">${esc(k.desc)}</span>`;
      }
      return '';
    },

    entityHtml(e) {
      const mine = e.side === C.SIDE.PLAYERS;
      const who = mine ? 'yours' : 'enemy';
      if (e.k === C.KIND.BUILDING) {
        const d = UCG_BUILDINGS[e.type]; if (!d) return '';
        return `<b>${esc(d.name)}</b> <span class="tt-w">(${who})</span>` +
          `<span class="tt-s">HP ${Math.round(e.hp)}/${e.maxhp}</span>` +
          `<span class="tt-d">${esc(d.desc)}</span>`;
      }
      const u = UCG_UNITS[e.type]; if (!u) return '';
      // Enemy uses base numbers (bot-side mods aren't shipped to us); HP is authoritative from the entity.
      return `<b>${esc(u.name)}</b> <span class="tt-w">(${who})</span>` +
        `<span class="tt-s">HP ${Math.round(e.hp)}/${e.maxhp} · ${unitStatLine(u.id, !mine)}</span>`;
    },

    // Nearest own/enemy unit within 0.6 tile, else building under the tile.
    hitEntity(wx, wy) {
      let best = null, bestD = 0.6 * 0.6;
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.UNIT) continue;
        const d = (e.x - wx) ** 2 + (e.y - wy) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) return best;
      const tx = Math.floor(wx), ty = Math.floor(wy);
      for (const e of UCG.State.entities.values()) {
        if (e.k !== C.KIND.BUILDING) continue;
        const def = UCG_BUILDINGS[e.type];
        const fw = e.foot ? e.foot[0] : (def ? def.foot[0] : 1);
        const fh = e.foot ? e.foot[1] : (def ? def.foot[1] : 1);
        if (tx >= e.tx && tx < e.tx + fw && ty >= e.ty && ty < e.ty + fh) return e;
      }
      return null;
    },

    show(html, src) {
      if (!html) { this.hide(); return; }
      this.el.innerHTML = html;
      this.el.classList.add('show');
      this.src = src;
      this.position();
    },
    hide() { this.el.classList.remove('show'); this.src = null; this._mapEnt = null; },
    position() {
      const pad = 14, w = this.el.offsetWidth, h = this.el.offsetHeight;
      let x = this.mx + pad, y = this.my + pad;
      if (x + w > window.innerWidth - 6) x = this.mx - w - pad;
      if (y + h > window.innerHeight - 6) y = this.my - h - pad;
      this.el.style.left = Math.max(4, x) + 'px';
      this.el.style.top = Math.max(4, y) + 'px';
    }
  };
})(window.UCG);
