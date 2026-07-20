// UCG.LobbyScene: DOM-overlay lobby in the glass language. Nick, color, civ cards, mode/difficulty
// segmented controls, player list, ready toggle, host Start. All lobby_set wiring unchanged.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, LS = window.localStorage;

  class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }

    create() {
      this.built = false;
      this._ready = false;
      this.buildDom();
      UCG.Net.on('lobby', () => this.render());
      UCG.Net.on('welcome', () => this.render());
      UCG.Net.on('err', (m) => console.warn('[lobby] err:', m.msg));
      this.render();
    }

    buildDom() {
      const el = document.createElement('div');
      el.id = 'lobby';
      const civCards = Object.keys(UCG_CIVS).map((k) => {
        const c = UCG_CIVS[k];
        return `<button class="civcard" data-civ="${k}">
          <span class="chead"><span class="cchip" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>
          <span class="cname">${c.name}</span></span>
          <span class="cperk">${c.perks}</span></button>`;
      }).join('');
      el.innerHTML = `
        <div class="card">
          <div class="wordmark">Untitled Civ Game</div>
          <div class="tagline">LAN co-op — share your local IP, everyone opens it in a browser.</div>
          <label class="eyebrow">Nickname</label>
          <input type="text" id="lb-nick" maxlength="16" />
          <label class="eyebrow">Color</label>
          <div class="swatches" id="lb-swatches"></div>
          <label class="eyebrow">Civilization</label>
          <div class="civgrid" id="lb-civ">${civCards}</div>
          <div class="row2" style="margin-top:16px">
            <div><label class="eyebrow">Mode</label><div class="seg" id="lb-mode"></div></div>
            <div><label class="eyebrow">Bot difficulty</label><div class="seg" id="lb-diff"></div></div>
          </div>
          <div class="players" id="lb-players"></div>
          <div class="lobby-actions">
            <button id="lb-ready">I'm ready</button>
            <button id="lb-start">Start game</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      this.el = el;

      const nickIn = el.querySelector('#lb-nick');
      nickIn.value = LS.getItem('ucg_nick') || 'Player';
      nickIn.addEventListener('input', () => {
        LS.setItem('ucg_nick', nickIn.value);
        UCG.Net.send({ t: C.MSG.LOBBY_SET, nick: nickIn.value });
      });

      const sw = el.querySelector('#lb-swatches');
      C.COLORS.forEach((col) => {
        const d = document.createElement('div');
        d.className = 'swatch'; d.dataset.color = col;
        d.style.background = '#' + col.toString(16).padStart(6, '0');
        d.addEventListener('click', () => {
          LS.setItem('ucg_color', String(col));
          UCG.Net.send({ t: C.MSG.LOBBY_SET, color: col });
        });
        sw.appendChild(d);
      });

      el.querySelector('#lb-civ').addEventListener('click', (e) => {
        const c = e.target.closest('.civcard'); if (!c) return;
        UCG.Net.send({ t: C.MSG.LOBBY_SET, civ: c.dataset.civ });
      });

      this.fillSeg('#lb-mode', [[C.MODE.NORMAL, 'Normal'], [C.MODE.INTRO, 'Intro'], [C.MODE.CREATIVE, 'Creative']], 'mode');
      this.fillSeg('#lb-diff', [[C.DIFF.EASY, 'Easy'], [C.DIFF.NORMAL, 'Normal'], [C.DIFF.HARD, 'Hard']], 'difficulty');

      el.querySelector('#lb-ready').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.LOBBY_SET, ready: !this._ready });
      });
      el.querySelector('#lb-start').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.START });
      });
      this.built = true;
    }

    fillSeg(sel, pairs, key) {
      const s = this.el.querySelector(sel);
      s.innerHTML = pairs.map(([v, label]) => `<button data-val="${v}">${label}</button>`).join('');
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        UCG.Net.send({ t: C.MSG.LOBBY_SET, [key]: b.dataset.val });
      });
    }

    render() {
      if (!this.built || !this.el) return;
      const lb = UCG.State.lobby, $ = (s) => this.el.querySelector(s);
      // Civ cards + segmented controls reflect shared picks.
      $('#lb-civ').querySelectorAll('.civcard').forEach((c) => c.classList.toggle('sel', c.dataset.civ === lb.civ));
      $('#lb-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.val === lb.mode));
      $('#lb-diff').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.val === lb.difficulty));

      const me = lb.players.find((p) => p.id === UCG.State.playerId);
      this.el.querySelectorAll('.swatch').forEach((d) => {
        d.classList.toggle('sel', me && parseInt(d.dataset.color, 10) === me.color);
      });
      this._ready = !!(me && me.ready);
      const rb = $('#lb-ready');
      rb.classList.toggle('on', this._ready);
      rb.textContent = this._ready ? '✓ Ready' : "I'm ready";

      $('#lb-players').innerHTML = lb.players.map((p) => `
        <div class="player">
          <span class="dot" style="background:#${p.color.toString(16).padStart(6, '0')}"></span>
          <span>${escapeHtml(p.nick)}</span>
          ${p.id === UCG.State.playerId ? '<span class="tag">YOU</span>' : ''}
          ${p.connected ? '' : '<span class="off">offline</span>'}
          <span class="rdy ${p.ready ? 'ok' : ''}">${p.ready ? '✓ ready' : 'not ready'}</span>
        </div>`).join('');

      const btn = $('#lb-start');
      const allReady = lb.players.length > 0 && lb.players.every((p) => p.ready || !p.connected);
      const waiting = lb.players.filter((p) => p.connected && !p.ready).length;
      btn.disabled = !allReady;
      btn.textContent = allReady ? 'Start game'
        : `Waiting for ${waiting} player${waiting === 1 ? '' : 's'}…`;
    }

    update() {
      if (UCG.State.started) {
        if (this.el) { this.el.remove(); this.el = null; }
        this.scene.start('GameScene');
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  UCG.LobbyScene = LobbyScene;
})(window.UCG);
