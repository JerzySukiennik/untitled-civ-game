// UCG.Net: WebSocket transport. JSON frames, pub/sub by message type, auto-rejoin with token.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;
  const LS = window.localStorage;

  const Net = {
    ws: null,
    handlers: {},
    connected: false,
    _retry: null,

    on(type, fn) {
      (this.handlers[type] = this.handlers[type] || []).push(fn);
    },
    emit(type, msg) {
      const list = this.handlers[type];
      if (list) for (const fn of list) fn(msg);
    },

    connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}`);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        if (this._retry) { clearInterval(this._retry); this._retry = null; }
        this.sendJoin();
      };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        UCG.State.handle(msg);
        this.emit(msg.t, msg);
      };
      ws.onclose = () => {
        this.connected = false;
        this.scheduleRetry();
      };
      ws.onerror = () => { };
    },

    scheduleRetry() {
      if (this._retry) return;
      this._retry = setInterval(() => { if (!this.connected) this.connect(); }, 2000);
    },

    sendJoin() {
      const nick = LS.getItem('ucg_nick') || 'Player';
      const token = window.sessionStorage.getItem('ucg_token') || undefined;
      const colorStr = LS.getItem('ucg_color');
      const color = colorStr != null ? parseInt(colorStr, 10) : undefined;
      this.send({ t: C.MSG.JOIN, nick, color, token });
    },

    send(obj) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    }
  };

  UCG.Net = Net;
})(window.UCG);
