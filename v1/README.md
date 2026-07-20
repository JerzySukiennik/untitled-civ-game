# Untitled Civ Game

A LAN co-op RTS-lite. You and your friends share one economy against an AI civilization: gather
food/wood/stone/gold, raise buildings, advance through five eras, research techs, train an army, and
raze the enemy city. One authoritative Node.js server (with `ws`) runs the whole simulation at 12 Hz
and serves a no-build Phaser 3 client; everyone just opens a browser tab. No accounts, no install on
the client side, no persistence — a session lives and dies with the server process.

## Requirements

- **Node.js 18 or newer** (only one dependency, `ws`).
- A modern browser (Chrome, Edge, Firefox, or Safari) on each player's machine.
- All players on the **same local network** (same Wi-Fi / LAN).

## Quick start (Windows)

Double-click **`start.bat`**. It installs dependencies on first run, opens
`http://localhost:8080` in your browser, and starts the server. Leave the window open — closing it
ends the game for everyone.

## Manual start (any OS)

```
npm install        # first time only
node server.js
```

Then open `http://localhost:8080`.

## Playing over LAN

1. On the machine running the server, find its local IP address:
   - **Windows:** run `ipconfig` and read the `IPv4 Address` (looks like `192.168.x.x`).
   - **macOS/Linux:** run `ifconfig` (or `ip addr`) and read the `inet` address of your Wi-Fi/Ethernet adapter.
2. Every other player opens `http://<that-IP>:8080` in their browser (e.g. `http://192.168.1.42:8080`).
3. Everyone picks a nickname and color. The civilization, mode, and bot difficulty are **shared** —
   anyone can change them, and everyone sees the change live. Once every player is marked *ready*,
   **any player** can click **Start game**.
4. **Firewall note (Windows):** the first time you run the server, Windows may pop up a
   "Windows Defender Firewall" prompt. Allow access on **Private networks** so other machines can
   reach you. If teammates can't connect, re-check that prompt (or add an inbound rule for port 8080).

If a player's tab drops mid-game, it auto-reconnects and rejoins the same session. New players cannot
join after the match has started.

## Changing the port

The server listens on **8080** by default. Override it with the `PORT` environment variable:

```
# Windows (cmd)
set PORT=9000 && node server.js

# macOS/Linux
PORT=9000 node server.js
```

Remember to use the same port in the URL: `http://<IP>:9000`.

## Modes and difficulty

**Modes**
- **Normal** — standard match against the AI; last side with a building standing wins.
- **Intro** — no enemy, no win/lose, tooltips hidden. A calm sandbox to learn the controls.
- **Creative** — everything unlocked, treasury pinned high, training is near-instant. Build freely.

**Bot difficulty** (Normal mode)
- **Easy** — slow economy, first attack around 12 min, stays in the early eras.
- **Normal** — even economy, first attack around 8 min, reaches the late game, rebuilds losses.
- **Hard** — boosted economy and a resource trickle, first attack around 5.5 min, big growing waves.

## Controls

**The left button drives the world, the right button picks things up.**

| Input | Action |
|---|---|
| Right-click | Select a unit or your own building |
| Right-drag box | Select all your units in the box |
| Left-drag | Grab and pan the map |
| Left-click | Context order for the selection: move / attack enemy / gather node / build site / set rally |
| Arrow keys | Pan the camera |
| Mouse wheel | Zoom (1.0×–3.0×) |
| `1`–`9`, `0` | Start placing the matching building (number shown on each button) |
| `Shift` + `1`–`9`, `0` | Same, for the later buildings |
| `A` then left-click | Attack-move to a spot (engage anything on the way) |
| `Ctrl` + `1`–`5` | Assign the current selection to a control group |
| `Alt` + `1`–`5` | Recall a control group |
| `Esc` | Cancel placement / attack-move / deselect |
| Minimap click | Jump the camera there |

Build buildings from the bottom bar (grouped by era; locked ones show what they need). Select a
building to train units, research at the Library, advance eras at the Town Center, or set a rally
point by left-clicking the map. Mute music or sound effects from the top bar.

## Credits

All assets are **CC0 (public domain)** — see `assets/CREDITS.txt` for full attribution.

- **Art** (tiles, cursors, UI prompts) and **sound effects**: [Kenney](https://kenney.nl) (Tiny Town,
  Tiny Farm, Tiny Battle, Map Pack, Cursor Pack, Input Prompts, Interface Sounds).
- **Music**: "Short Loops Background Music Pack" (calm tracks) and Juhani Junkala's
  "5 Chiptunes (Action)" (tension / late-era tracks), both CC0 via
  [OpenGameArt](https://opengameart.org).

Game code © its authors, released alongside these CC0 assets.
