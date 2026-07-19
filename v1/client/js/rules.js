// UCG.Rules: data-driven lock/availability checks for the HUD, computed from the shared tables
// (UCG_ERAS/TECHS/BUILDINGS/UNITS) + the local mirror (State.era, researched techs, own buildings).
// Server re-validates every command; this only drives greying + lock reasons in the UI.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;

  function completedCounts() {
    const have = {};
    for (const e of UCG.State.entities.values()) {
      if (e.k !== C.KIND.BUILDING || e.side !== C.SIDE.PLAYERS) continue;
      if (e.progress !== undefined && e.progress < 1) continue;
      have[e.type] = (have[e.type] || 0) + 1;
    }
    return have;
  }

  function canAfford(cost) {
    const r = UCG.State.res;
    return r.f >= cost.f && r.w >= cost.w && r.s >= cost.s && r.g >= cost.g;
  }

  UCG.Rules = {
    completedCounts, canAfford,

    // { locked, reason } — locked buildings are greyed with the era reason (buildings gate on era only).
    buildingLock(type) {
      const def = UCG_BUILDINGS[type];
      if (def.era > UCG.State.era) return { locked: true, reason: 'Era ' + def.era };
      return { locked: false, reason: '' };
    },

    unitLock(type) {
      const def = UCG_UNITS[type];
      if (def.era > UCG.State.era) return { locked: true, reason: 'Era ' + def.era };
      return { locked: false, reason: '' };
    },

    // Tech UI state: 'researched' | 'active' | 'queued' | { locked, reason } | 'available'.
    techState(id) {
      const S = UCG.State, t = UCG_TECHS[id];
      if (S.techs.indexOf(id) !== -1) return 'researched';
      if (S.techA && S.techA.tech === id) return 'active';
      if (S.techQ.indexOf(id) !== -1) return 'queued';
      if (t.era > S.era) return { locked: true, reason: 'Era ' + t.era };
      const have = completedCounts();
      if (!have.library) return { locked: true, reason: 'Needs Library' };
      if (t.requires && !have[t.requires]) return { locked: true, reason: 'Needs ' + UCG_BUILDINGS[t.requires].name };
      return 'available';
    },

    // Next-era info for the Advance Era button, or null at era 5.
    eraNext() {
      const S = UCG.State;
      if (S.era >= 5) return null;
      const def = UCG_ERAS[S.era];              // next era (ERAS[0].n === 1)
      const have = completedCounts();
      const missing = [];
      if (def.requires && def.requires.buildings) {
        for (const t in def.requires.buildings) {
          const need = def.requires.buildings[t];
          if ((have[t] || 0) < need) missing.push(need + ' ' + UCG_BUILDINGS[t].name);
        }
      }
      return {
        def, missing,
        affordable: canAfford(def.cost),
        researching: !!S.eraP
      };
    },

    // Remaining seconds for an active { endTick } research object (ceil).
    secsLeft(obj) {
      if (!obj) return 0;
      return Math.max(0, Math.ceil((obj.endTick - UCG.State.tick) / C.TICK_RATE));
    }
  };
})(window.UCG);
