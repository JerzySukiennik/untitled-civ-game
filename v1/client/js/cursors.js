// UCG.CURSORS: the single source of truth for pointer art. Every state — including idle and every
// DOM surface — uses a Kenney cursor; the native arrow must never appear once the game is running.
window.UCG = window.UCG || {};
(function (UCG) {
  const url = (name, hx, hy, fallback) =>
    `url('assets/cursors/${name}.png') ${hx} ${hy}, ${fallback}`;

  UCG.CURSORS = {
    idle: url('pointer_a', 4, 2, 'default'),      // default in-world pointer
    ui: url('pointer_a_outline', 4, 2, 'default'),// over HUD/lobby chrome (outlined for contrast)
    hand: url('hand_point', 8, 4, 'pointer'),     // clickable target: resource node, build site
    grab: url('hand_open', 12, 12, 'grabbing'),   // dragging the map
    attack: url('target_a', 12, 12, 'crosshair'), // enemy under cursor, military selected
    cross: url('cross_large', 16, 16, 'crosshair'),// placing a building
    no: url('cursor_disabled', 12, 12, 'not-allowed'), // invalid placement
    busy: url('cursor_busy', 12, 12, 'progress'), // loading
    menu: url('cursor_menu', 4, 2, 'context-menu')
  };

  // Apply to the document so DOM chrome (lobby, HUD, tooltips) never falls back to the native arrow.
  UCG.applyDocumentCursors = function () {
    const css = `
      html, body { cursor: ${UCG.CURSORS.idle}; }
      #lobby, #hud, #tooltip, #minimap { cursor: ${UCG.CURSORS.ui}; }
      button, select, input, .bbtn, .civcard, .seg > *, .swatch, #minimap canvas {
        cursor: ${UCG.CURSORS.hand};
      }
      button:disabled, .bbtn.locked, #lb-start:disabled { cursor: ${UCG.CURSORS.no}; }
    `;
    const tag = document.createElement('style');
    tag.id = 'ucg-cursors';
    tag.textContent = css;
    document.head.appendChild(tag);
  };
})(window.UCG);
