# Riel Runner tests

These are automated checks that load the real game pages in headless Google Chrome and test how the game behaves.

## Run them

```bash
bash tests/run-all.sh
```

You need Node.js and Google Chrome. Running everything takes about 10 minutes, and it ends with `ALL PASSED` or lists each check that failed. If Chrome isn't installed at the default Windows location, set `CHROME="/path/to/chrome"` first.

To run one suite: `node tests/<name>-test.js . "<path to chrome.exe>"` from the repo root.

## What's covered

| Suite | Checks |
|---|---|
| `check.js` | Every page loads with no console errors or missing files |
| `intro` | Intro video plays only on the first visit of a session |
| `death` | Death screen and stats; fallen campaigns are grayed out, details/delete only |
| `touch` | Touch controls toggle; on-screen buttons and pause work with mouse and touch |
| `lives` | HP refills every level; lives refill only after boss levels |
| `shop` | Upgrades, prices, level-10 cap, effects in game, old-save migration |
| `menushop` | Title-screen SHOP button; shop opened from the menu (no level skip, closed without a campaign) |
| `ai` | Enemy AI: help calls, backup, flanking, tank cover, retreat, dodging, bosses |
| `soak` | Full levels run 2000 frames with no crashes or stuck enemies |
| `jump` | Jump heights, power-up boosts, every platform reachable |
| `save` | Mid-level save and resume |
| `laser` | Laser placement rules and the 5s on / 3s off cycle |
| `kinds` | Runner, spitter, bomber, shielder and medic abilities |

`tools/shot.js` and `tools/enemy-shot.js` take screenshots and don't run any checks.

## Things to know when writing tests

- **Headless Chrome doesn't run `requestAnimationFrame`,** so the game loop is frozen. Tests drive the game by calling its functions directly, such as `frameCount++; updateNPCs();`. Use `w.eval('name')` to read `let` and `const` globals.
- **Button clicks are delayed** by `js/click-sounds.js` until the click sound finishes, so wait about 1.5s after clicking a button.
- **The game saves the level when the page closes.** The harness blanks the iframe before loading a new page, then restores the test's own localStorage.
- **Edge's headless mode prints nothing on some machines,** so use Chrome.
