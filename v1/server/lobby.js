// Lobby: connection manager + pre-game state. Players, shared civ/mode/difficulty picks,
// host = first joiner, ready gating, start transition, rejoin tokens, in-game command routing.
const crypto = require('crypto');
const C = require('../shared/constants.js');
const CIVS = require('../shared/data-civs.js');
const { MSG, validate } = require('./protocol.js');
const snapshot = require('./snapshot.js');
const Game = require('./game.js');

class Lobby {
  constructor() {
    this.players = new Map();      // id -> player
    this.tokens = new Map();       // token -> id
    this.nextPlayerId = 1;
    this.hostId = null;
    this.shared = { civ: 'townsfolk', mode: C.MODE.NORMAL, difficulty: C.DIFF.NORMAL };
    this.started = false;
    this.game = null;
    this.cursorTimer = null;
  }

  // ---- connection lifecycle ----
  handleConnection(ws) {
    ws._pid = null;
    ws.on('message', (data) => this.onMessage(ws, data));
    ws.on('close', () => this.onClose(ws));
    ws.on('error', () => { });
  }

  onClose(ws) {
    const p = ws._pid && this.players.get(ws._pid);
    if (!p) return;
    p.connected = false; p.ws = null;
    if (!this.started) {
      this.players.delete(p.id);
      if (this.hostId === p.id) this.hostId = this.firstPlayerId();
      this.broadcastLobby();
    } else {
      console.log(`[lobby] player ${p.id} (${p.nick}) disconnected, slot kept`);
      this.broadcastLobby();
    }
  }

  onMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!validate(msg)) { this.send(ws, { t: MSG.ERR, msg: 'bad message' }); return; }

    if (msg.t === MSG.JOIN) return this.onJoin(ws, msg);
    if (msg.t === MSG.PING) return this.send(ws, { t: MSG.PONG, n: msg.n });

    const p = ws._pid && this.players.get(ws._pid);
    if (!p) { this.send(ws, { t: MSG.ERR, msg: 'not joined' }); return; }

    switch (msg.t) {
      case MSG.LOBBY_SET: return this.onLobbySet(p, msg);
      case MSG.START: return this.onStart(p);
      case MSG.CURSOR:
        if (this.game) this.game.setCursor(p.id, msg.x, msg.y);
        return;
      default:
        // In-game sim commands: route to game on the players side.
        if (this.game) this.game.queueCommand(p.id, C.SIDE.PLAYERS, msg);
        return;
    }
  }

  // ---- join / rejoin ----
  onJoin(ws, msg) {
    if (msg.token && this.tokens.has(msg.token)) {
      const id = this.tokens.get(msg.token);
      const p = this.players.get(id);
      if (p) {
        p.ws = ws; p.connected = true; ws._pid = id;
        console.log(`[lobby] player ${id} (${p.nick}) rejoined`);
        this.send(ws, { t: MSG.WELCOME, playerId: id, token: p.token, lobby: this.lobbyState() });
        if (this.started && this.game) {
          this.send(ws, this.game.startPayload());
          this.send(ws, snapshot.fullSnap(this.game, C.SIDE.PLAYERS));
        }
        this.broadcastLobby();
        return;
      }
    }
    if (this.started) {
      this.send(ws, { t: MSG.ERR, msg: 'game in progress' });
      return;
    }
    const id = this.nextPlayerId++;
    const token = crypto.randomBytes(12).toString('hex');
    const player = {
      id, nick: this.sanitizeNick(msg.nick), ready: false, connected: true,
      ws, token, color: this.pickColor(msg.color)
    };
    this.players.set(id, player);
    this.tokens.set(token, id);
    if (this.hostId === null) this.hostId = id;
    ws._pid = id;
    console.log(`[lobby] player ${id} (${player.nick}) joined`);
    this.send(ws, { t: MSG.WELCOME, playerId: id, token, lobby: this.lobbyState() });
    this.broadcastLobby();
  }

  onLobbySet(p, msg) {
    if (this.started) return;
    if (typeof msg.nick === 'string') p.nick = this.sanitizeNick(msg.nick);
    if (typeof msg.color === 'number') p.color = this.pickColor(msg.color, p.id);
    if (typeof msg.ready === 'boolean') p.ready = msg.ready;
    if (typeof msg.civ === 'string' && CIVS[msg.civ]) this.shared.civ = msg.civ;
    if (typeof msg.mode === 'string' && this.validMode(msg.mode)) this.shared.mode = msg.mode;
    if (typeof msg.difficulty === 'string' && this.validDiff(msg.difficulty)) this.shared.difficulty = msg.difficulty;
    this.broadcastLobby();
  }

  onStart(p) {
    if (this.started) return;
    const all = [...this.players.values()];
    if (all.length === 0 || !all.every((x) => x.ready || !x.connected)) {
      return this.send(p.ws, { t: MSG.ERR, msg: 'all players must be ready' });
    }
    this.started = true;
    const seed = (crypto.randomBytes(4).readUInt32LE(0)) >>> 0;
    const botCiv = this.pickBotCiv(this.shared.civ);
    this.game = new Game({
      mode: this.shared.mode, difficulty: this.shared.difficulty,
      civs: { player: this.shared.civ, bot: botCiv }, seed
    });
    this.game.onBroadcast = (str) => this.broadcastRaw(str);
    this.game.onErr = (pid, m) => {
      const tp = this.players.get(pid);
      if (tp && tp.ws) this.send(tp.ws, { t: MSG.ERR, msg: m });
    };
    console.log(`[lobby] game starting: ${all.length} player(s), seed=${seed}`);
    this.broadcastRaw(JSON.stringify(this.game.startPayload()));
    for (const pl of this.players.values()) {
      if (pl.ws) this.send(pl.ws, snapshot.fullSnap(this.game, C.SIDE.PLAYERS));
    }
    snapshot.clearDirty(this.game); // start entities already in snapshot; avoid re-adding in first delta
    this.game.start();
    this.startCursorLoop();
  }

  startCursorLoop() {
    const period = Math.round(1000 / C.CURSOR_RATE);
    this.cursorTimer = setInterval(() => {
      if (!this.game) return;
      const ids = [];
      for (const pl of this.players.values()) if (pl.connected) ids.push(pl.id);
      this.broadcastRaw(JSON.stringify(this.game.cursorPayload(ids)));
    }, period);
  }

  // ---- helpers ----
  sanitizeNick(n) {
    const s = (typeof n === 'string' ? n : '').trim().slice(0, 16);
    return s.length ? s : 'Player';
  }

  validMode(m) { return m === C.MODE.NORMAL || m === C.MODE.INTRO || m === C.MODE.CREATIVE; }
  validDiff(d) { return d === C.DIFF.EASY || d === C.DIFF.NORMAL || d === C.DIFF.HARD; }

  pickColor(requested, selfId) {
    const used = new Set();
    for (const pl of this.players.values()) if (pl.id !== selfId) used.add(pl.color);
    if (typeof requested === 'number' && C.COLORS.indexOf(requested) !== -1 && !used.has(requested)) return requested;
    for (const col of C.COLORS) if (!used.has(col)) return col;
    return C.COLORS[0];
  }

  pickBotCiv(playerCiv) {
    const ids = Object.keys(CIVS).filter((k) => k !== playerCiv);
    return ids[Math.floor(Math.random() * ids.length)];
  }

  firstPlayerId() {
    const it = this.players.keys().next();
    return it.done ? null : it.value;
  }

  lobbyState() {
    return {
      players: [...this.players.values()].map((p) => ({
        id: p.id, nick: p.nick, color: p.color, ready: p.ready,
        connected: p.connected, host: p.id === this.hostId
      })),
      civ: this.shared.civ, mode: this.shared.mode, difficulty: this.shared.difficulty,
      started: this.started
    };
  }

  send(ws, obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  broadcastRaw(str) {
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) p.ws.send(str);
    }
  }

  broadcastLobby() { this.broadcastRaw(JSON.stringify({ t: MSG.LOBBY, ...this.lobbyState() })); }
}

module.exports = Lobby;
