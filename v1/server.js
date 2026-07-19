// Entry point: one HTTP server (static files) + ws on the same port. Glue only.
const http = require('http');
const { WebSocketServer } = require('ws');
const C = require('./shared/constants.js');
const staticServer = require('./server/static.js');
const Lobby = require('./server/lobby.js');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : C.PORT;

const httpServer = http.createServer((req, res) => staticServer.serve(req, res));
const wss = new WebSocketServer({ server: httpServer });
const lobby = new Lobby();

wss.on('connection', (ws, req) => {
  console.log(`[ws] connection from ${req.socket.remoteAddress}`);
  lobby.handleConnection(ws);
});

httpServer.listen(PORT, () => {
  console.log(`[http] Untitled Civ Game serving on http://localhost:${PORT}`);
  console.log('[http] LAN clients: use http://<this-machine-ip>:' + PORT);
});

process.on('SIGINT', () => { console.log('\n[server] shutting down'); process.exit(0); });
