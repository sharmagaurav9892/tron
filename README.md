# Tron Light Cycles

Classic light-cycle duel: leave a trail behind you, trap the CPU, don't crash. Pure HTML / CSS / JS — no server, no build step, no dependencies.

## Quick start

Open `index.html` in a browser.

If you prefer serving locally:

```bash
python3 -m http.server 3000
# then open http://localhost:3000
```

## How it works

- 40 × 30 arena.
- You (emerald) start on the left facing right. The CPU (red) starts on the right facing left.
- Each tick (~80 ms, getting faster every round) both cycles advance one cell and leave a trail.
- Hit a wall or any trail (yours or the opponent's) and you die.
- Last cycle alive wins the round. Both crash same tick = draw.
- First to 5 rounds wraps up the match and posts your rounds-won total to the leaderboard.

## Score storage

Everything is stored in this browser's `localStorage`:

| Key | What |
| --- | ---- |
| `tron.leaderboard` | The Top 3 leaderboard (rounds won per match). |
| `tron.player` | Your current player name on this device. |

Use **Clear** on the leaderboard header to wipe scores.

## Controls

| Key                              | Action            |
| -------------------------------- | ----------------- |
| `←` `↑` `↓` `→` (or `W A S D`)   | Steer your cycle  |
| `Space`                          | Play / Pause      |
| `R`                              | Restart match     |
| **Change** (top right)           | Switch player     |
| **Clear** (leaderboard header)   | Wipe Top 3        |

180° reversals are blocked. Hit a direction before the round starts to launch.

## Files

```
tron/
├── index.html
├── styles.css
├── game.js
└── README.md
```
