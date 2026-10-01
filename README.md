# 2D Football Wars

A quick arcade football match with bouncy players, power kicks, instant goal replays, and a colorful stadium.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use the match selectors to choose Computer or 2 Players, then start a 60-second match.

## Controls

- Single-player Blue: `A` / `D` or `←` / `→` move, `W` or `↑` jump, and `S` or `↓` slide. Press `X` or `Space` for a quick shot; hold/release `E` or `Enter` for a charged shot. `Left Shift` sprints and `Q` braces.
- Single-player skills: use the visible skill buttons, `Z` / `C` / `V` / `B` / `N`, or `1`–`5`: Cannon Shot (35 energy), Magnet (20), Sky Jump (15), Freeze (25), and Heal (20). Their buttons show energy needs, active/armed state, cooldowns, and other activation gates; clicks and key presses explain denials such as low energy, cooldown, Freeze range, or full health.
- Energy restores automatically at 8 per second during play, with additional energy from kicks and goals.
- Blue strikes: numpad `6`–`9`.
- In 2 Player mode, Blue uses `A` / `D` to move, `W` to jump, `S` to slide, `Space` for a quick shot, and hold/release `E` to charge a shot. Blue skills use `1`–`5`; Blue strikes use numpad `6`–`9` or `Z` / `X` / `C` / `V`.
- Red in 2 Player mode uses `←` / `→` to move, `↑` to jump, hold/release `Enter` to shoot, `Right Shift` to sprint, `↓` to slide, and `/` to brace.
- Red skills: `6`–`0` in the same order: Cannon Shot, Magnet, Sky Jump, Freeze, Heal. Red skill use is supported in local two-player matches.
- Red strikes: `I` / `O` / `K` / `L`.
- `P` or `Escape` pause, `R` restart, `F` fullscreen. The touch control panel switches between movement actions and combat controls; the five blue skill buttons remain visible below the arena.

Touch controls appear on coarse-pointer devices, including landscape phones. Sound volume is adjustable from the footer.
