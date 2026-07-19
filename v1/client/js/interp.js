// UCG.Interp: render-time position interpolation, ~2 ticks (167ms) behind the server clock.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;
  const DELAY = 2; // ticks behind

  const Interp = {
    // Returns { x, y } in tile units for the given entity at render time.
    pos(e) {
      const S = UCG.State;
      const h = e.hist;
      if (!h || h.length < 2) return { x: e.x, y: e.y };
      const frac = Math.min(1, Math.max(0, (performance.now() - S.lastTickTime) / C.TICK_MS));
      const renderTick = S.tick - DELAY + frac;
      // Find bracketing samples.
      for (let i = h.length - 1; i > 0; i--) {
        const a = h[i - 1], b = h[i];
        if (renderTick >= a.t && renderTick <= b.t) {
          const span = b.t - a.t || 1;
          const k = (renderTick - a.t) / span;
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        }
      }
      // Render time before earliest sample -> oldest; after latest -> newest.
      if (renderTick < h[0].t) return { x: h[0].x, y: h[0].y };
      const last = h[h.length - 1];
      return { x: last.x, y: last.y };
    }
  };

  UCG.Interp = Interp;
})(window.UCG);
