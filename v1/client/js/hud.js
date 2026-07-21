// UCG.HUD: DOM overlay in the "smoked glass over pixel art" language. Floating top capsule
// (pixel resource icons + tabular numbers with change pulses, clock, pause, mutes), a top-center
// Era Ribbon (roman era + gold research progress fill, click = select/center TC), glass build dock
// (era sections, sprite icons, hotkeys, icon+number costs, folded market chip), glass selection card
// (3x portrait, HP bar, stats, production queue), top-center toasts, and a materializing end card.
// All DOM writes are change-guarded (see §7 perf).
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;
  const RES_NAME = { f: 'food', w: 'wood', s: 'stone', g: 'gold' };
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  const TRAIN = {
    tc: ['worker'], cartdepot: ['cart'], barracks: ['militia', 'soldier', 'knight'],
    range: ['archer'], stable: ['horseman'], siege: ['ram', 'catapult']
  };
  const BRANCHES = ['Economy', 'Military', 'Construction', 'Population'];
  // Digit hotkeys: 1-9,0 for the first ten buildings, Shift+1-9,0 for the next ten.
  // Matched on ev.code (Digit1…Digit0) so Shift doesn't scramble the reported key. There are no
  // control groups to compete for the digit row (removed 2026-07-21, owner's call).
  const HK_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const TECH_BY_BRANCH = {};
  for (const b of BRANCHES) TECH_BY_BRANCH[b] = [];
  for (const id of Object.keys(UCG_TECHS)) TECH_BY_BRANCH[UCG_TECHS[id].branch].push(id);

  const BUILD_IDS = Object.keys(UCG_BUILDINGS).filter((id) => id !== 'tc');
  const HK = {}, HK_INV = {};
  BUILD_IDS.forEach((id, i) => {
    const d = HK_DIGITS[i % 10];
    if (!d || i >= 20) return;
    const shifted = i >= 10;
    HK[id] = (shifted ? '⇧' : '') + d;
    HK_INV[(shifted ? 'S' : '') + 'Digit' + d] = id;
  });

  const cost$ = (cost) => UCG.Icons.costHTML(cost);
  function setTxt(node, v) { v = '' + v; if (node._v !== v) { node._v = v; node.textContent = v; } }
  // Resource number with a one-shot pulse (gold on gain, danger on drop).
  function resSet(node, v) {
    v = '' + v;
    if (node._v === v) return;
    const up = node._n !== undefined && +v > node._n;
    node._n = +v; node._v = v; node.textContent = v;
    node.classList.remove('pulse-up', 'pulse-down');
    void node.offsetWidth;                       // restart the CSS animation
    node.classList.add(up ? 'pulse-up' : 'pulse-down');
  }
  function mmss(sec) {
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  UCG.HUD = {
    _portraits: {},
    portrait(kind, type) {
      const key = kind + ':' + type;
      if (this._portraits[key]) return this._portraits[key];
      const url = kind === 'b' ? UCG.Icons.building(type) : UCG.Icons.unit(type);
      if (url) this._portraits[key] = url;      // never cache null (sheet may still be loading)
      return url;
    },

    create(scene) {
      this.scene = scene;
      UCG.Icons.ensure();
      const el = document.createElement('div');
      el.id = 'hud';

      // Build dock: era sections + folded market chip.
      let dock = '';
      for (let era = 1; era <= 5; era++) {
        const ids = BUILD_IDS.filter((id) => UCG_BUILDINGS[id].era === era);
        if (!ids.length) continue;
        dock += `<div class="esec"><div class="enum">${ROMAN[era]}</div><div class="erow">` +
          ids.map((id) => {
            const d = UCG_BUILDINGS[id];
            const ic = UCG.Icons.building(id);
            return `<button class="bbtn" data-build="${id}">` +
              `<span class="hk">${HK[id] || ''}</span>` +
              `<span class="bic">${ic ? `<img src="${ic}" alt="${d.name}">` : ''}</span>` +
              `<span class="bcost">${cost$(d.cost)}</span></button>`;
          }).join('') + `</div></div>`;
      }
      const opt = (selG) => C.RES_KEYS.map((k) =>
        `<option value="${k}" ${(!selG && k === 'g') ? 'selected' : ''}>${RES_NAME[k]}</option>`).join('');
      dock += `<div class="esec market"><div class="enum">⇄</div><div class="erow trow">` +
        `<select id="trade-give">${opt(true)}</select><span class="tarrow">100 → 75</span>` +
        `<select id="trade-get">${opt(false)}</select><button id="trade-go" class="tbtn">Trade</button>` +
        `</div></div>`;

      el.innerHTML = `
        <div id="topbar">
          <div class="cluster">
            ${['f', 'w', 's', 'g'].map((k) => `<div class="res" data-r="${k}">${UCG.Icons.resImg(k)}<span class="num" id="hud-${k}">0</span></div>`).join('')}
            <div class="res pop">${UCG.Icons.resImg('pop')}<span class="num" id="hud-pop">0/0</span></div>
          </div>
          <div class="cluster right">
            <span class="clock" id="hud-clock">00:00</span>
            <button id="hud-pause" class="chip" title="Pause">❚❚</button>
            <button id="hud-mute-music" class="chip mute" title="Toggle music">♪</button>
            <button id="hud-mute-sfx" class="chip mute" title="Toggle sound effects">♬</button>
          </div>
        </div>
        <div id="eraribbon" title="Advance eras / center Town Center">
          <div class="erafill"></div>
          <div class="eratext"><span class="eranum" id="hud-eranum">I</span><span class="eraname" id="hud-eraname">Settlement</span></div>
        </div>
        <div id="pausechip"></div>
        <div id="toast"></div>
        <div id="pausescrim"></div>
        <div id="selpanel"></div>
        <div id="buildbar">${dock}</div>`;
      document.body.appendChild(el);
      this.el = el;
      const sel = el.querySelector('#selpanel');
      const $ = (id) => el.querySelector(id);

      const toast = $('#toast');
      const showToast = (text, danger) => {
        toast.textContent = text;
        toast.classList.toggle('danger', !!danger);
        toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
        clearTimeout(this._tt);
        this._tt = setTimeout(() => toast.classList.remove('show'), 3000);
      };
      const sfx = (n) => { if (UCG.Audio) UCG.Audio.play(n); };

      // Build dock: block era-locked, else toggle placement.
      const tryPlace = (id) => {
        const lock = UCG.Rules.buildingLock(id);
        if (lock.locked) { showToast(UCG_BUILDINGS[id].name + ' needs ' + lock.reason, true); sfx('error'); return; }
        UCG.Input.begin(UCG.Input.placementType === id ? null : id);
        sfx('click');
      };
      $('#buildbar').addEventListener('click', (ev) => {
        const btn = ev.target.closest('.bbtn');
        if (btn) tryPlace(btn.dataset.build);
      });
      window.addEventListener('keydown', (ev) => {
        if (!UCG.State.started) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) return;
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;   // e.g. Ctrl+A select-all, not a build hotkey
        const id = HK_INV[(ev.shiftKey ? 'S' : '') + ev.code];
        if (id) { ev.preventDefault(); tryPlace(id); }
      });

      // Era ribbon click: select + center own Town Center.
      $('#eraribbon').addEventListener('click', () => {
        for (const e of UCG.State.entities.values()) {
          if (e.type === 'tc' && e.side === C.SIDE.PLAYERS) {
            UCG.Input.clearSelection();
            UCG.Input.selectedBuilding = e.id;
            this.scene.cameras.main.centerOn(e.x * C.TILE_PX, e.y * C.TILE_PX);
            sfx('select');
            return;
          }
        }
      });

      $('#hud-pause').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.PAUSE, paused: !UCG.State.paused }); sfx('click');
      });
      $('#trade-go').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.TRADE, give: $('#trade-give').value, get: $('#trade-get').value });
        sfx('click');
      });

      const mm = $('#hud-mute-music'), ms = $('#hud-mute-sfx');
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

      UCG.Net.on('err', (m) => showToast(m.msg || 'error', true));
      UCG.Net.on('over', (m) => this.showEnd(m));
      UCG.Net.on('paused', (m) => {
        const p = UCG.State.lobby.players.find((x) => x.id === m.by);
        this._pausedBy = p ? p.nick : null;
      });

      let sig = '', eraStart = null, eraTarget = null, eraUp = 1, iconsDone = false;
      return {
        update() {
          const S = UCG.State;

          // Backfill dock icons that weren't ready at create() (sheet images load async).
          if (!iconsDone) {
            let all = true;
            for (const btn of el.querySelectorAll('#buildbar .bbtn')) {
              const bic = btn.querySelector('.bic');
              if (!bic.firstChild) {
                const u = UCG.Icons.building(btn.dataset.build);
                if (u) bic.innerHTML = `<img src="${u}" alt="">`; else all = false;
              }
            }
            const popImg = el.querySelector('.res.pop img');
            if (!popImg) {
              const u = UCG.Icons.unit('worker');
              if (u) el.querySelector('.res.pop').insertAdjacentHTML('afterbegin', `<img class="ric" src="${u}" alt="pop">`);
            }
            iconsDone = all;
          }
          resSet($('#hud-f'), S.res.f); resSet($('#hud-w'), S.res.w);
          resSet($('#hud-s'), S.res.s); resSet($('#hud-g'), S.res.g);
          setTxt($('#hud-pop'), `${S.pop.cur}/${S.pop.cap}`);
          setTxt($('#hud-clock'), mmss(Math.floor(S.tick / C.TICK_RATE)));
          $('#topbar').querySelector('.res[data-r="f"]').classList.toggle('starve', S.res.f === 0);
          const pauseBtn = $('#hud-pause');
          setTxt(pauseBtn, S.paused ? '▶' : '❚❚');
          pauseBtn.classList.toggle('on', S.paused);
          $('#pausescrim').classList.toggle('on', S.paused);
          const pc = $('#pausechip');
          if (S.paused) { pc.textContent = 'PAUSED' + (this._pausedBy ? ' — ' + this._pausedBy : ''); pc.classList.add('on'); }
          else pc.classList.remove('on');

          // Era ribbon: current era text + gold research fill.
          setTxt($('#hud-eranum'), ROMAN[S.era] || S.era);
          setTxt($('#hud-eraname'), (UCG_ERAS[S.era - 1] || {}).name || '');
          const fill = $('#eraribbon .erafill');
          if (S.eraP) {
            if (eraTarget !== S.eraP.target) { eraTarget = S.eraP.target; eraStart = S.tick; }
            const span = Math.max(1, S.eraP.endTick - eraStart);
            const pct = Math.max(0, Math.min(1, (S.tick - eraStart) / span));
            const w = (pct * 100).toFixed(1) + '%';
            if (fill._w !== w) { fill._w = w; fill.style.width = w; }
            $('#eraribbon').classList.add('researching');
          } else {
            eraTarget = null;
            if (fill._w !== '0') { fill._w = '0'; fill.style.width = '0'; }
            $('#eraribbon').classList.remove('researching');
          }
          if (S.era > eraUp) { eraUp = S.era; const r = $('#eraribbon'); r.classList.remove('levelup'); void r.offsetWidth; r.classList.add('levelup'); }

          // Build dock lock/active state.
          for (const btn of el.querySelectorAll('#buildbar .bbtn')) {
            const lock = UCG.Rules.buildingLock(btn.dataset.build);
            btn.classList.toggle('locked', lock.locked);
            btn.classList.toggle('active', UCG.Input.placementType === btn.dataset.build);
          }

          // Transient event toasts (own side).
          for (const ev of S.events) {
            if (ev.e === 'starve') showToast('Starvation — units are losing HP. Get food.', true);
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
            if (hp) { let cur = 0, max = 0; for (const id of units) { const e = S.entities.get(id); if (e) { cur += e.hp; max += e.maxhp; } } setTxt(hp, 'HP ' + Math.round(cur) + ' / ' + max); }
          } else if (selId) {
            const b = S.entities.get(selId);
            const bar = sel.querySelector('#bsel-bar');
            if (bar && b) { const f = Math.max(0, b.hp / b.maxhp); bar.style.width = (f * 100).toFixed(0) + '%'; bar.className = 'barfill ' + (f > 0.6 ? 'ok' : f > 0.3 ? 'mid' : 'low'); }
            const bt = sel.querySelector('#bsel-hp');
            if (bt && b) setTxt(bt, Math.round(b.hp) + ' / ' + b.maxhp);
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
        <div class="eyebrow">${win ? 'Enemy city fallen' : 'Your city destroyed'}</div>
        <h1>${win ? 'VICTORY' : 'DEFEAT'}</h1>
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
    const list = Object.keys(counts).map((t) => UCG_UNITS[t].name + ' ×' + counts[t]).join(' · ');
    return `<div class="selhead"><div class="port">${port ? `<img src="${port}">` : ''}</div>` +
      `<div class="selmeta"><div class="ttl">${UCG_UNITS[primary].name}${total > 1 ? ' <span class="plus">+' + (total - 1) + '</span>' : ''}</div>` +
      `<div class="hint" id="usel-hp"></div></div></div>` +
      `<div class="stat">${UCG.Tooltips.unitStatLine(primary)}</div>` +
      (total > 1 ? `<div class="hint">${list}</div>` : `<div class="hint">${UCG_UNITS[primary].desc}</div>`) +
      `<div class="eyebrow-s">Q attack-move · Ctrl+A select all</div>`;
  }

  // ---- building selection panel ----
  function renderPanel(b) {
    const def = UCG_BUILDINGS[b.type];
    const port = UCG.HUD.portrait('b', b.type);
    // Completed buildings may have no `progress` field at all (only sites/updates carry it).
    const done = b.progress === undefined || b.progress >= 1;
    let html = `<div class="selhead"><div class="port bport">${port ? `<img src="${port}">` : ''}</div>` +
      `<div class="selmeta"><div class="ttl">${def.name}${done ? '' : ' <span class="plus">building…</span>'}</div>` +
      `<div class="hpbar"><div class="barfill ok" id="bsel-bar"></div></div><div class="hint" id="bsel-hp"></div></div></div>`;
    if (done) {
      if (b.type === 'tc') html += eraSection();
      if (TRAIN[b.type]) html += trainSection(b.type);
      if (b.type === 'library') html += librarySection();
      if (b.q) html += queueSection(b.q);
      if (TRAIN[b.type]) {
        const r = UCG.Input.rally[b.id];
        html += `<div class="rally">Rally ${r ? `<span class="chipmini">(${r.tx}, ${r.ty})</span>` : '<span class="hint">right-click map</span>'}</div>`;
      }
    }
    html += '<button class="danger" data-act="demolish">Demolish</button>';
    return html;
  }

  function queueSection(n) {
    let x = `<div class="eyebrow-s">In production (${n})</div><div class="queue">`;
    for (let i = 0; i < n; i++) x += `<button class="qx${i === 0 ? ' active' : ''}" data-cancel="${i}" title="cancel">✕</button>`;
    return x + '</div>';
  }

  function eraSection() {
    const info = UCG.Rules.eraNext();
    if (!info) return '<div class="era-row">Empire — max era reached</div>';
    if (info.researching) return `<div class="era-row">Researching era<span id="erap-cd"></span></div>`;
    const miss = info.missing.length ? `<div class="lockmsg">Needs: ${info.missing.join(', ')}</div>` : '';
    const dis = (info.missing.length || !info.affordable) ? ' disabled' : '';
    return `<button class="gold" data-act="era"${dis}>Advance to ${info.def.name}<span class="cost">${cost$(info.def.cost)}</span></button>${miss}`;
  }

  function trainSection(type) {
    return TRAIN[type].map((u) => {
      const lock = UCG.Rules.unitLock(u);
      const dis = lock.locked ? ' disabled' : '';
      const badge = lock.locked ? `<span class="cost lockc">${lock.reason}</span>` : `<span class="cost">${cost$(UCG_UNITS[u].cost)}</span>`;
      const ic = UCG.Icons.unit(u);
      return `<button data-train="${u}"${dis}><span class="tico">${ic ? `<img src="${ic}">` : ''}</span>Train ${UCG_UNITS[u].name}${badge}</button>`;
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
        if (st === 'available') { html += `<button data-tech="${id}">${t.name}<span class="cost">${cost$(t.cost)}</span></button>`; continue; }
        html += `<button disabled>${t.name}<span class="cost lockc">${st.reason}</span></button>`;
      }
    }
    return html;
  }
})(window.UCG);
