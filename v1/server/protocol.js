// Protocol: message type constants (mirror of UCG_CONST.MSG) + client command shape validation.
const C = require('../shared/constants.js');
const BUILDINGS = require('../shared/data-buildings.js');

const MSG = C.MSG;

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function isInt(v) { return isNum(v) && Math.floor(v) === v; }
function isStr(v) { return typeof v === 'string'; }
function isBool(v) { return typeof v === 'boolean'; }

// Validate a decoded client message shape. Returns true if structurally acceptable.
// Legality (cost, ownership, footprint) is checked in game.js against sim state.
function validate(msg) {
  if (!msg || typeof msg !== 'object' || !isStr(msg.t)) return false;
  switch (msg.t) {
    case MSG.JOIN:
      return isStr(msg.nick) && (msg.color === undefined || isInt(msg.color)) &&
        (msg.token === undefined || isStr(msg.token));
    case MSG.LOBBY_SET:
      return true; // all fields optional; game.js sanitizes each
    case MSG.START:
      return true;
    case MSG.CURSOR:
      return isNum(msg.x) && isNum(msg.y);
    case MSG.PLACE:
      return isStr(msg.building) && !!BUILDINGS[msg.building] && isInt(msg.tx) && isInt(msg.ty);
    case MSG.DEMOLISH:
      return isInt(msg.id);
    case MSG.MOVE:
      return Array.isArray(msg.ids) && isNum(msg.tx) && isNum(msg.ty);
    case MSG.GATHER:
      return Array.isArray(msg.ids) && msg.target !== undefined;
    case MSG.TRAIN:
      return isInt(msg.id) && isStr(msg.unit);
    case MSG.CANCELQ:
      return isInt(msg.id) && isInt(msg.index);
    case MSG.RALLY:
      return isInt(msg.id) && isNum(msg.tx) && isNum(msg.ty);
    case MSG.RESEARCH:
      return isStr(msg.tech);
    case MSG.TRADE:
      return isStr(msg.give) && isStr(msg.get);
    case MSG.ADVANCE_ERA:
      return true;
    case MSG.PAUSE:
      return isBool(msg.paused);
    case MSG.PING:
      return true;
    default:
      return false;
  }
}

module.exports = { MSG, validate };
