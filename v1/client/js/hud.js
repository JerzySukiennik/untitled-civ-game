// UCG.HUD: DOM overlay. Top bar (resources, pop, era + research countdown, game clock, tick, mute
// toggles, pause), era-grouped build bar with keyboard hotkeys, selection panel (units: portrait +
// aggregate stats with modifiers; buildings: portrait + HP + era/train/research actions + production
// queue with cancel + rally), market trade row, toasts. DOM writes are change-guarded.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;
  const RES_IC = { f: '#7cb342', w: '#8d6e63', s: '#9e9e9e', g: '#ffca28' };
  const RES_NAME = { f: 'food', w: 'wood', s: 'stone', g: 'gold' };
  const TRAIN = {
    tc: ['worker'], cartdepot: ['cart'], barracks: ['militia', 'soldier', 'knight'],
    range: ['archer'], stable: ['horseman'], siege: ['ram', 'catapult']
  };
  const BRANCHES = ['Economy', 'Military', 'Construction', 'Population'];
  // Build-bar hotkeys: letters that don't collide with camera (WASD), attack-move (A) or groups (1-5).
  const HK_POOL = ['q', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'f', 'g', 'h', 'j', 'k', 'l', 'z', 'x', 'c', 'v', 'b'];
  const TECH_BY_BRANCH = {};
  for (const b of BRANCHES) TECH_BY_BRANCH[b] = [];
  for (const id of Object.keys(UCG_TECHS)) TECH_BY_BRANCH[UCG_TECHS[id].branch].push(id);

  const BUILD_IDS = Object.keys(UCG_BUILDINGS).filter((id) => id !== 'tc');
  const HK = {}, HK_INV = {};
  BUILD_IDS.forEach((id, i) => { if (HK_POOL[i]) { HK[id] = HK_POOL[i]; HK_INV[HK_POOL[i]] = id; } });

  function costStr(cost) {
    const parts = [];
    for (const k of C.RES_KEYS) if (cost[k]) parts.push(cost[k] + ' ' + RES_NAME[k]);
    return parts.join(', ') || 'free';
  }
  function setTxt(node, v) { v = '' + v; if (node._v !== v) { node._v = v; node.textContent = v; } }
  function mmss(sec) {
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  UCG.HUD = {
    _portraits: {},
    portrait(kind, type) {
      const key = kind + ':' + type;
      if (this._portraits[key] !== undefined) return this._portraits[key];
      let url = null;
      try {
        const f = kind === 'b' ? UCG.Frames.building[type] : UCG.Frames.unit[type];
        if (f && UCG.game && UCG.game.textures.exists(f.tex)) url = UCG.game.textures.getBase64(f.tex, f.frame);
      } catch (e) { url = null; }
      this._portraits[key] = url;
      return url;
    },

    create(scene) {
      const el = document.createElement('div');
      el.id = 'hud';
      // Build bar grouped by era.
      let bar = '';
      for (let era = 1; era <= 5; era++) {
        const ids = BUILD_IDS.filter((id) => UCG_BUILDINGS[id].era === era);
        if (!ids.length) continue;
        bar += `<div class="bgroup"><div class="glabel">Era ${era}</div><div class="grow">` +
          ids.map((id) => {
            const d = UCG_BUILDINGS[id];
            return `<div class="btn" data-build="${id}"><span class="hk">${(HK[id] || '').toUpperCase()}</span>` +
              `<span class="bn">${d.name}</span><span class="cost">${costStr(d.cost)}</span><span class="lock"></span></div>`;
          }).join('') + `</div></div>`;
      }
      el.innerHTML = `
        <div id="topbar">
          ${['f', 'w', 's', 'g'].map((k) => `<div class="res"><span class="ic" style="background:${RES_IC[k]}"></span><span id="hud-${k}">0</span></div>`).join('')}
          <div class="res">pop <span id="hud-pop">0/0</span></div>
          <div class="spacer"></div>
          <div class="meta">era <span id="hud-era">1</span><span id="hud-erap"></span></div>
          <div class="meta">time <span id="hud-clock">00:00</span></div>
          <div class="meta tick">tick <span id="hud-tick">0</span></div>
          <button id="hud-mute-music" class="mute" title="Toggle music">Music</button>
          <button id="hud-mute-sfx" class="mute" title="Toggle sound effects">SFX</button>
          <button id="hud-pause">Pause</button>
        </div>
        <div id="selpanel"></div>
        <div id="tradebar">
          <span>Market:</span>
          <select id="trade-give">${C.RES_KEYS.map((k) => `<option value="${k}">${RES_NAME[k]}</option>`).join('')}</select>
          <span>100 &rarr; 75</span>
          <select id="trade-get">${C.RES_KEYS.map((k) => `<option value="${k}" ${k === 'g' ? 'selected' : ''}>${RES_NAME[k]}</option>`).join('')}</select>
          <button id="trade-go">Trade</button>
        </div>
        <div id="buildbar">${bar}</div>
        <div id="toast"></div>`;
      document.body.appendChild(el);
      this.el = el;
      const sel = el.querySelector('#selpanel');

      const toast = el.querySelector('#toast');
      const showToast = (text) => {
        toast.textContent = text;
        toast.classList.add('show');
        clearTimeout(this._tt);
        this._tt = setTimeout(() => toast.classList.remove('show'), 2200);
      };
      const sfx = (n) => { if (UCG.Audio) UCG.Audio.play(n); };

      // Build bar click: block era-locked, otherwise toggle placement.
      el.querySelector('#buildbar').addEventListener('click', (ev) => {
        const btn = ev.target.closest('.btn');
        if (!btn) return;
        const id = btn.dataset.build;
        const lock = UCG.Rules.buildingLock(id);
        if (lock.locked) { showToast(UCG_BUILDINGS[id].name + ' requires ' + lock.reason); sfx('error'); return; }
        UCG.Input.begin(UCG.Input.placementType === id ? null : id);
        sfx('click');
      });
      // Keyboard hotkeys for the build bar.
      window.addEventListener('keydown', (ev) => {
        if (!UCG.State.started) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const id = HK_INV[ev.key.toLowerCase()];
        if (!id) return;
        const lock = UCG.Rules.buildingLock(id);
        if (lock.locked) { showToast(UCG_BUILDINGS[id].name + ' requires ' + lock.reason); sfx('error'); return; }
        UCG.Input.begin(UCG.Input.placementType === id ? null : id);
        sfx('click');
      });

      el.querySelector('#hud-pause').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.PAUSE, paused: !UCG.State.paused }); sfx('click');
      });
      el.querySelector('#trade-go').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.TRADE, give: el.querySelector('#trade-give').value, get: el.querySelector('#trade-get').value });
        sfx('click');
      });

      const mm = el.querySelector('#hud-mute-music'), ms = el.querySelector('#hud-mute-sfx');
      const reflectMute = () => {
        const a = UCG.Audio;
        mm.classList.toggle('off', a ? a.muteMusic : false);
        ms.classList.toggle('off', a ? a.muteSfx : false);
      };
      mm.addEventListener('click', () => { if (UCG.Audio) UCG.Audio.toggleMusic(); reflectMute(); });
      ms.addEventListener('click', () => { if (UCG.Audio) UCG.Audio.toggleSfx(); reflectMute(); });
      reflectMute();

      // Selection panel actions.
      sel.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const id = UCG.Input.selectedBuilding;
        if (btn.dataset.tech) { UCG.Net.send({ t: C.MSG.RESEARCH, tech: btn.dataset.tech }); sfx('click'); return; }
        if (btn.dataset.act === 'era') { UCG.Net.send({ t: C.MSG.ADVANCE_ERA }); sfx('click'); return; }
        if (!id) return;
        if (btn.dataset.cancel !== undefined) { UCG.Net.send({ t: C.MSG.CANCELQ, id, index: parseInt(btn.dataset.cancel, 10) }); sfx('click'); return; }
        if (btn.dataset.train) { UCG.Net.send({ t: C.MSG.TRAIN, id, unit: btn.dataset.train }); sfx('click'); }
        else if (btn.dataset.act === 'demolish') { UCG.Net.send({ t: C.MSG.DEMOLISH, id }); UCG.Input.clearSelection(); sfx('back'); }
      });

      UCG.Net.on('err', (m) => showToast(m.msg || 'error'));
      UCG.Net.on('over', (m) => this.showEnd(m));

      const $ = (id) => el.querySelector(id);
      let sig = '';
      return {
        update() {
          const S = UCG.State;
          setTxt($('#hud-f'), S.res.f); setTxt($('#hud-w'), S.res.w);
          setTxt($('#hud-s'), S.res.s); setTxt($('#hud-g'), S.res.g);
          setTxt($('#hud-pop'), `${S.pop.cur}/${S.pop.cap}`);
          setTxt($('#hud-era'), S.era);
          setTxt($('#hud-erap'), S.eraP ? ` → ${S.eraP.target} (${UCG.Rules.secsLeft(S.eraP)}s)` : '');
          setTxt($('#hud-clock'), mmss(Math.floor(S.tick / C.TICK_RATE)));
          setTxt($('#hud-tick'), S.tick);
          setTxt($('#hud-pause'), S.paused ? 'Resume' : 'Pause');
          $('#hud-pause').classList.toggle('on', S.paused);

          // Build bar era-lock greying.
          for (const btn of el.querySelectorAll('#buildbar .btn')) {
            const lock = UCG.Rules.buildingLock(btn.dataset.build);
            btn.classList.toggle('locked', lock.locked);
            btn.classList.toggle('active', UCG.Input.placementType === btn.dataset.build);
            const lk = btn.querySelector('.lock');
            if (lk._v !== lock.reason) { lk._v = lock.reason; lk.textContent = lock.reason; }
          }

          // Transient event toasts (own side).
          for (const ev of S.events) {
            if (ev.e === 'starve') showToast('Starvation! Units are losing HP - get food.');
            else if (ev.e === 'era' && ev.side === C.SIDE.PLAYERS) showToast('Advanced to ' + UCG_ERAS[ev.n - 1].name + '!');
            else if (ev.e === 'research_done' && ev.side === C.SIDE.PLAYERS) showToast(UCG_TECHS[ev.tech].name + ' researched!');
          }

          // ---- selection panel ----
          const units = UCG.Input.selected, selId = UCG.Input.selectedBuilding;
          let ns = '';
          if (units.size) {
            ns = 'U|' + unitSelKey() + '|' + S.era + '|' + S.techs.length;
          } else if (selId) {
            const b = S.entities.get(selId);
            if (b) {
              let eraSig = '';
              if (b.type === 'tc') { const ei = UCG.Rules.eraNext(); eraSig = ei ? (ei.affordable ? 'a' : '') + ei.missing.length : 'max'; }
              const r = UCG.Input.rally[selId];
              ns = ['B', selId, b.type, b.progress < 1 ? 1 : 0, b.q || 0, S.era, S.techs.length,
                S.techQ.join(','), S.techA && S.techA.tech, S.eraP && S.eraP.target, eraSig,
                r ? r.tx + ',' + r.ty : ''].join('|');
            }
          }
          if (ns !== sig) {
            sig = ns;
            sel.innerHTML = units.size ? renderUnitPanel() : (selId && S.entities.get(selId) ? renderPanel(S.entities.get(selId)) : '');
          }

          // Live bits without full rebuild.
          if (units.size) {
            const hp = sel.querySelector('#usel-hp');
            if (hp) { let cur = 0, max = 0; for (const id of units) { const e = S.entities.get(id); if (e) { cur += e.hp; max += e.maxhp; } } setTxt(hp, 'HP ' + Math.round(cur) + '/' + max); }
          } else if (selId) {
            const b = S.entities.get(selId);
            const bhp = sel.querySelector('#bsel-hp');
            if (bhp && b) setTxt(bhp, 'HP ' + Math.round(b.hp) + '/' + b.maxhp);
            const ecd = sel.querySelector('#erap-cd');
            if (ecd && S.eraP) ecd.textContent = ` (${UCG.Rules.secsLeft(S.eraP)}s)`;
            const tcd = sel.querySelector('#techa-cd');
            if (tcd && S.techA) tcd.textContent = ` ${UCG.Rules.secsLeft(S.techA)}s`;
          }
        },
        destroy() { el.remove(); }
      };
    },

    showEnd(m) {
      const win = m.winner === 'players';
      const ov = document.createElement('div');
      ov.id = 'endoverlay';
      ov.className = win ? 'win' : 'lose';
      const secs = m.stats && m.stats.seconds ? m.stats.seconds : 0;
      ov.innerHTML = `<div class="card">
        <h1>${win ? 'Victory' : 'Defeat'}</h1>
        <p>${win ? 'The enemy city has fallen.' : 'Your city has been destroyed.'}</p>
        <p class="clk">Game time ${mmss(secs)}</p>
        <p class="hint">Restart the server to play again.</p></div>`;
      document.body.appendChild(ov);
    }
  };

  // ---- unit selection panel ----
  function unitSelKey() {
    const counts = {};
    for (const id of UCG.Input.selected) { const e = UCG.State.entities.get(id); if (e && e.k === C.KIND.UNIT) counts[e.type] = (counts[e.type] || 0) + 1; }
    return Object.keys(counts).sort().map((t) => t + counts[t]).join(',');
  }
  function renderUnitPanel() {
    const S = UCG.State, counts = {};
    let total = 0, primary = null, pc = 0;
    for (const id of UCG.Input.selected) {
      const e = S.entities.get(id); if (!e || e.k !== C.KIND.UNIT) continue;
      counts[e.type] = (counts[e.type] || 0) + 1; total++;
      if (counts[e.type] > pc) { pc = counts[e.type]; primary = e.type; }
    }
    if (!total) return '';
    const port = UCG.HUD.portrait('u', primary);
    const list = Object.keys(counts).map((t) => UCG_UNITS[t].name + ' x' + counts[t]).join(', ');
    return `<div class="selhead"><div class="port">${port ? `<img src="${port}">` : ''}</div>` +
      `<div class="selmeta"><div class="ttl">${UCG_UNITS[primary].name}${total > 1 ? ' (+' + (total - 1) + ')' : ''}</div>` +
      `<div class="hint" id="usel-hp"></div></div></div>` +
      `<div class="stat">${UCG.Tooltips.unitStatLine(primary)}</div>` +
      (total > 1 ? `<div class="hint">${list}</div>` : `<div class="hint">${UCG_UNITS[primary].desc}</div>`) +
      `<div class="hint">A: attack-move · Ctrl+1-5 set group</div>`;
  }

  // ---- building selection panel ----
  function renderPanel(b) {
    const def = UCG_BUILDINGS[b.type];
    const port = UCG.HUD.portrait('b', b.type);
    let html = `<div class="selhead"><div class="port bport">${port ? `<img src="${port}">` : ''}</div>` +
      `<div class="selmeta"><div class="ttl">${def.name}${b.progress < 1 ? ' (building…)' : ''}</div>` +
      `<div class="hint" id="bsel-hp"></div></div></div>`;
    if (b.progress >= 1) {
      if (b.type === 'tc') html += eraSection();
      if (TRAIN[b.type]) html += trainSection(b.type);
      if (b.type === 'library') html += librarySection();
      if (b.q) html += queueSection(b.q);
      if (TRAIN[b.type]) {
        const r = UCG.Input.rally[b.id];
        html += `<div class="hint">Rally: ${r ? `(${r.tx}, ${r.ty})` : 'right-click map to set'}</div>`;
      }
    }
    html += '<button data-act="demolish">Demolish</button>';
    return html;
  }

  function queueSection(n) {
    let x = `<div class="queue">Producing ${n}: `;
    for (let i = 0; i < n; i++) x += `<button class="qx" data-cancel="${i}" title="cancel">✕</button>`;
    return x + '</div>';
  }

  function eraSection() {
    const info = UCG.Rules.eraNext();
    if (!info) return '<div class="q">Empire (max era)</div>';
    if (info.researching) return `<div class="era-row">Researching Era<span id="erap-cd"></span></div>`;
    const miss = info.missing.length ? `<div class="lockmsg">need: ${info.missing.join(', ')}</div>` : '';
    const dis = (info.missing.length || !info.affordable) ? ' disabled' : '';
    return `<button data-act="era"${dis}>Advance to ${info.def.name}<span class="cost">${costStr(info.def.cost)}</span></button>${miss}`;
  }

  function trainSection(type) {
    return TRAIN[type].map((u) => {
      const lock = UCG.Rules.unitLock(u);
      const dis = lock.locked ? ' disabled' : '';
      const badge = lock.locked ? `<span class="cost">${lock.reason}</span>` : `<span class="cost">${costStr(UCG_UNITS[u].cost)}</span>`;
      return `<button data-train="${u}"${dis}>Train ${UCG_UNITS[u].name}${badge}</button>`;
    }).join('');
  }

  function librarySection() {
    let html = '';
    for (const branch of BRANCHES) {
      html += `<div class="branch">${branch}</div>`;
      for (const id of TECH_BY_BRANCH[branch]) {
        const t = UCG_TECHS[id], st = UCG.Rules.techState(id);
        if (st === 'researched') { html += `<button class="done" disabled>${t.name}<span class="cost">done</span></button>`; continue; }
        if (st === 'active') { html += `<button class="active" disabled>${t.name}<span class="cost">researching<span id="techa-cd"></span></span></button>`; continue; }
        if (st === 'queued') { html += `<button disabled>${t.name}<span class="cost">queued</span></button>`; continue; }
        if (st === 'available') { html += `<button data-tech="${id}">${t.name}<span class="cost">${costStr(t.cost)}</span></button>`; continue; }
        html += `<button disabled>${t.name}<span class="cost">${st.reason}</span></button>`;
      }
    }
    return html;
  }
})(window.UCG);
