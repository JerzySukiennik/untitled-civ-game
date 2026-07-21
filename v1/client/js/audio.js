// UCG.Audio: WebAudio bus (master gain -> compressor -> destination) with separate music/sfx gain
// nodes. One-shot SFX from assets/sounds (throttled), plus adaptive music from assets/music:
// per-era calm track crossfaded 2 s on era change, and a tension layer that fades in when >=5 own-side
// combat events land within 5 s and reverts after 10 s of calm. Autoplay-safe (context resumed on the
// first user gesture); mute toggles persisted to localStorage.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST, LS = window.localStorage;

  // name -> file (assets/sounds/*.mp3). Roles are mapped to the available Kenney interface sounds.
  const SFX = {
    click: 'click.mp3', select: 'select.mp3', place: 'drop.mp3', built: 'confirm.mp3',
    train: 'switch.mp3', era: 'open.mp3', research: 'toggle_on.mp3', destroyed: 'back.mp3',
    hit: 'tick.mp3', victory: 'confirm.mp3', defeat: 'error.mp3', error: 'error.mp3',
    toggle: 'toggle_off.mp3'
  };
  const MUSIC = {
    calm1: 'calm_building_1.mp3', calm2: 'calm_building_2.mp3', calm3: 'calm_building_3.mp3',
    battle1: 'tension_battle_1.mp3', battle2: 'tension_battle_2.mp3', late: 'late_era.mp3'
  };
  const CROSSFADE = 2.0;          // seconds
  const HIT_THROTTLE = 1000 / 6;  // <=6 attack-hit sfx per second
  const COMBAT_WINDOW = 5000, COMBAT_TRIGGER = 5, CALM_REVERT = 10000;

  // Calm track per era (manifest roles: calm1 peaceful, calm2 lighthearted, calm3 wintry, late driving).
  function eraTrack(era) { return era >= 5 ? 'late' : era >= 4 ? 'calm3' : era >= 3 ? 'calm2' : 'calm1'; }

  UCG.Audio = {
    ready: false,
    suspended: false,               // set by stopAll(); blocks _fadeTo until the socket is back
    muteMusic: LS.getItem('ucg_mute_music') === '1',
    muteSfx: LS.getItem('ucg_mute_sfx') === '1',

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;                     // no WebAudio -> silent, everything guards on this.ready
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      this.master = master;
      this.musicGain = ctx.createGain(); this.musicGain.connect(master);
      this.sfxGain = ctx.createGain(); this.sfxGain.connect(master);
      this.musicGain.gain.value = this.muteMusic ? 0 : 0.5;
      this.sfxGain.gain.value = this.muteSfx ? 0 : 0.7;

      this.buffers = {};             // decoded AudioBuffers by name
      this.lastSfx = {};             // sfx name -> last play time (throttle)
      this.slots = [null, null];     // { src, gain } crossfade slots
      this.curMusic = null;          // track name currently playing
      this.mode = 'calm';            // 'calm' | 'battle'
      this.combat = [];              // recent own-side combat event times
      this.lastCombat = 0;
      this.lastTick = -1;
      this.ownUnits = -1;            // last own-side unit count (train-done detection)
      this.ready = true;

      this._load();
      // Resume on the first user gesture (browsers block autoplay until then).
      const resume = () => { if (ctx.state !== 'running') ctx.resume(); };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
      UCG.Net.on('over', (m) => this.onOver(m));
      UCG.Net.on('err', () => this.play('error'));
      // Teardown. A looping BufferSource outlives the page: closing the tab (or the embedded
      // browser pane) leaves the music playing until the browser process itself is killed —
      // this cost one 8-hour phantom soundtrack. pagehide covers tab close / bfcache; the
      // socket close covers a dead server, and reconnecting lifts the suspension so update()
      // fades the era track back in on its own.
      window.addEventListener('pagehide', () => this.stopAll());
      UCG.Net.on('_close', () => this.stopAll());
      UCG.Net.on('_open', () => { this.suspended = false; });
    },

    // Stop every music slot and forget the current track. Idempotent; SFX are unaffected.
    stopAll() {
      this.suspended = true;
      if (!this.ready) return;
      for (const s of this.slots) {
        if (!s) continue;
        try { s.src.stop(); } catch (e) { /* already stopped */ }
        try { s.gain.disconnect(); } catch (e) { /* already detached */ }
      }
      this.slots = [null, null];
      this.curMusic = null;
      this.mode = 'calm';
      this.combat.length = 0;
    },

    _load() {
      const grab = (dir, file, name, dst) => fetch(dir + file)
        .then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
        .then((buf) => { dst[name] = buf; })
        .catch(() => { /* leave missing; play() guards */ });
      for (const n in SFX) grab('assets/sounds/', SFX[n], n, this.buffers);
      this.music = {};
      for (const n in MUSIC) grab('assets/music/', MUSIC[n], n, this.music);
    },

    // ---- SFX ----
    play(name) {
      if (!this.ready || this.muteSfx) return;
      const buf = this.buffers[name];
      if (!buf || this.ctx.state !== 'running') return;
      const now = performance.now();
      const gap = name === 'hit' ? HIT_THROTTLE : 45;   // tiny global de-dupe + hit throttle
      if (now - (this.lastSfx[name] || 0) < gap) return;
      this.lastSfx[name] = now;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.connect(this.sfxGain); src.start();
    },

    // ---- music crossfade ----
    _fadeTo(name) {
      if (!this.ready || this.suspended || name === this.curMusic) return;
      const buf = this.music[name];
      if (!buf || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      // Fade out any active slot.
      for (const s of this.slots) {
        if (!s) continue;
        s.gain.gain.cancelScheduledValues(t);
        s.gain.gain.setValueAtTime(s.gain.gain.value, t);
        s.gain.gain.linearRampToValueAtTime(0, t + CROSSFADE);
        try { s.src.stop(t + CROSSFADE + 0.05); } catch (e) { /* already stopped */ }
      }
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + CROSSFADE);
      gain.connect(this.musicGain);
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.connect(gain); src.start();
      this.slots = [{ src, gain }, null];
      this.curMusic = name;
    },

    // ---- per-tick drive (events -> sfx, adaptive music) ----
    update() {
      if (!this.ready) return;
      const S = UCG.State;
      if (this.ctx.state !== 'running') return;
      // Kick off era music once audio is unlocked.
      if (!this.curMusic) this._fadeTo(eraTrack(S.era));

      if (S.tick === this.lastTick) { this._music(); return; }
      this.lastTick = S.tick;

      let ownUnits = 0;
      for (const e of S.entities.values()) if (e.k === C.KIND.UNIT && e.side === C.SIDE.PLAYERS) ownUnits++;
      if (this.ownUnits >= 0 && ownUnits > this.ownUnits) this.play('train');
      this.ownUnits = ownUnits;

      const now = performance.now();
      let hitThisTick = false;
      for (const ev of S.events) {
        if (ev.e === 'attack') {
          if (this._ownInvolved(ev)) {
            this.combat.push(now); this.lastCombat = now;
            if (!hitThisTick) { this.play('hit'); hitThisTick = true; }
          }
        } else if (ev.e === 'die') {
          const info = S.deadInfo.get(ev.id);
          if (info && info.k === C.KIND.BUILDING) this.play('destroyed');
        } else if (ev.e === 'era' && ev.side === C.SIDE.PLAYERS) {
          this.play('era');
        } else if (ev.e === 'research_done' && ev.side === C.SIDE.PLAYERS) {
          this.play('research');
        } else if (ev.e === 'built') {
          const b = S.entities.get(ev.id);
          if (b && b.side === C.SIDE.PLAYERS) this.play('built');
        } else if (ev.e === 'starve') {
          this.play('error');
        }
      }
      this._music();
    },

    _ownInvolved(ev) {
      const S = UCG.State;
      const f = S.entities.get(ev.from), t = S.entities.get(ev.to);
      return (f && f.side === C.SIDE.PLAYERS) || (t && t.side === C.SIDE.PLAYERS);
    },

    // Decide calm vs battle layer and keep the calm track matched to the current era.
    _music() {
      const now = performance.now();
      while (this.combat.length && now - this.combat[0] > COMBAT_WINDOW) this.combat.shift();
      const era = UCG.State.era;
      if (this.mode === 'calm') {
        if (this.combat.length >= COMBAT_TRIGGER) {
          this.mode = 'battle';
          this._fadeTo(era >= 4 ? 'battle2' : 'battle1');
        } else {
          this._fadeTo(eraTrack(era));   // no-op if already correct
        }
      } else {                            // battle
        if (now - this.lastCombat > CALM_REVERT) {
          this.mode = 'calm';
          this._fadeTo(eraTrack(era));
        }
      }
    },

    onOver(m) {
      this.play(m.winner === 'players' ? 'victory' : 'defeat');
      // Let the outcome breathe: drop to a calm bed.
      this.mode = 'calm';
      this._fadeTo(eraTrack(UCG.State.era));
    },

    toggleMusic() {
      this.muteMusic = !this.muteMusic;
      LS.setItem('ucg_mute_music', this.muteMusic ? '1' : '0');
      if (this.ready) this.musicGain.gain.value = this.muteMusic ? 0 : 0.5;
      this.play('toggle');
      return this.muteMusic;
    },
    toggleSfx() {
      this.muteSfx = !this.muteSfx;
      LS.setItem('ucg_mute_sfx', this.muteSfx ? '1' : '0');
      if (this.ready) this.sfxGain.gain.value = this.muteSfx ? 0 : 0.7;
      if (!this.muteSfx) this.play('toggle');
      return this.muteSfx;
    }
  };
})(window.UCG);
