// UCG.LobbyScene: DOM-overlay lobby. Nick, color, civ/mode/difficulty (shared), ready, host Start.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, LS = window.localStorage;

  class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }

    create() {
      this.built = false;
      this.buildDom();
      UCG.Net.on('lobby', () => this.render());
      UCG.Net.on('welcome', () => this.render());
      UCG.Net.on('err', (m) => console.warn('[lobby] err:', m.msg));
      this.render();
    }

    buildDom() {
      const el = document.createElement('div');
      el.id = 'lobby';
      el.innerHTML = `
        <div class="panel">
          <h1>Untitled Civ Game</h1>
          <p class="sub">LAN co-op — share your local IP, everyone opens it in a browser.</p>
          <label>Nickname</label>
          <input type="text" id="lb-nick" maxlength="16" />
          <label>Color</label>
          <div class="swatches" id="lb-swatches"></div>
          <div class="row">
            <div><label>Civilization</label><select id="lb-civ"></select></div>
            <div><label>Mode</label><select id="lb-mode"></select></div>
            <div><label>Bot difficulty</label><select id="lb-diff"></select></div>
          </div>
          <div class="players" id="lb-players"></div>
          <div class="ready-row">
            <input type="checkbox" id="lb-ready" /><label for="lb-ready" style="margin:0">I'm ready</label>
          </div>
          <button id="lb-start">Start game</button>
        </div>`;
      document.body.appendChild(el);
      this.el = el;

      const nick = LS.getItem('ucg_nick') || 'Player';
      const nickIn = el.querySelector('#lb-nick');
      nickIn.value = nick;
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

      this.fillSelect('#lb-civ', Object.keys(UCG_CIVS).map((k) => [k, UCG_CIVS[k].name]), 'civ');
      this.fillSelect('#lb-mode', [[C.MODE.NORMAL, 'Normal'], [C.MODE.INTRO, 'Intro'], [C.MODE.CREATIVE, 'Creative']], 'mode');
      this.fillSelect('#lb-diff', [[C.DIFF.EASY, 'Easy'], [C.DIFF.NORMAL, 'Normal'], [C.DIFF.HARD, 'Hard']], 'difficulty');

      el.querySelector('#lb-ready').addEventListener('change', (e) => {
        UCG.Net.send({ t: C.MSG.LOBBY_SET, ready: e.target.checked });
      });
      el.querySelector('#lb-start').addEventListener('click', () => {
        UCG.Net.send({ t: C.MSG.START });
      });
      this.built = true;
    }

    fillSelect(sel, pairs, key) {
      const s = this.el.querySelector(sel);
      pairs.forEach(([v, label]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label; s.appendChild(o);
      });
      s.addEventListener('change', () => UCG.Net.send({ t: C.MSG.LOBBY_SET, [key]: s.value }));
    }

    render() {
      if (!this.built || !this.el) return;
      const lb = UCG.State.lobby;
      // Reflect shared picks.
      this.el.querySelector('#lb-civ').value = lb.civ;
      this.el.querySelector('#lb-mode').value = lb.mode;
      this.el.querySelector('#lb-diff').value = lb.difficulty;
      // Highlight own color.
      const me = lb.players.find((p) => p.id === UCG.State.playerId);
      this.el.querySelectorAll('.swatch').forEach((d) => {
        d.classList.toggle('sel', me && parseInt(d.dataset.color, 10) === me.color);
      });
      if (me) this.el.querySelector('#lb-ready').checked = me.ready;
      // Player list.
      const pl = this.el.querySelector('#lb-players');
      pl.innerHTML = lb.players.map((p) => `
        <div class="player">
          <span class="dot" style="background:#${p.color.toString(16).padStart(6, '0')}"></span>
          <span>${escapeHtml(p.nick)}</span>
          ${p.host ? '<span class="tag">HOST</span>' : ''}
          ${p.connected ? '' : '<span class="tag">offline</span>'}
          <span class="rdy">${p.ready ? '✓ ready' : '…'}</span>
        </div>`).join('');
      // Start button: host only, everyone connected is ready.
      const btn = this.el.querySelector('#lb-start');
      const allReady = lb.players.length > 0 && lb.players.every((p) => p.ready || !p.connected);
      btn.style.display = UCG.State.isHost() ? 'block' : 'none';
      btn.disabled = !allReady;
      btn.textContent = allReady ? 'Start game' : 'Waiting for players…';
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
